import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@mcpfy/db/client";
import { AuthorizationError, owned, requireRole, scoped } from "@mcpfy/db";
import { apiError, tenantFromRequest } from "@/lib/api-auth";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertSafeUrl, assertSafeGitUrl, UnsafeUrlError } from "@/lib/ssrf";
import {
  DeploymentError,
  inspectRepository,
  type RepositoryInspection,
} from "@mcpfy/deployment";
import { ensureDefaultProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

/** GET /api/v1/servers — list servers in the caller's organization. */
export async function GET(request: Request) {
  const ctx = await tenantFromRequest(request);
  if (!ctx) {
    return apiError(401, "unauthorized", "Provide a session cookie or Bearer API key.");
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);

  const rows = await db()
    .select({
      id: schema.server.id,
      name: schema.server.name,
      slug: schema.server.slug,
      framework: schema.server.framework,
      transport: schema.server.transport,
      region: schema.server.region,
      health: schema.server.health,
      createdAt: schema.server.createdAt,
    })
    .from(schema.server)
    .where(scoped(ctx, schema.server))
    .orderBy(desc(schema.server.createdAt))
    .limit(limit);

  return Response.json(
    { data: rows, has_more: rows.length === limit },
    { headers: { "cache-control": "no-store" } },
  );
}

const CreateBody = z.object({
  name: z.string().trim().min(2).max(64),
  endpoint_url: z.url().optional(),
  /** A git URL MCPfy will clone, inspect and build. */
  repository_url: z.string().trim().optional(),
  branch: z.string().trim().optional(),
  transport: z.enum(["streamable_http", "sse", "stdio"]).default("streamable_http"),
  project_id: z.string().optional(),
});

/** POST /api/v1/servers — create a server. */
export async function POST(request: Request) {
  const ctx = await tenantFromRequest(request);
  if (!ctx) {
    return apiError(401, "unauthorized", "Provide a session cookie or Bearer API key.");
  }

  try {
    requireRole(ctx, "developer");
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return apiError(403, "forbidden", e.message);
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "invalid_request", "One or more fields are invalid.", {
      fields: parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }

  let endpointUrl: string | null = null;
  if (parsed.data.endpoint_url) {
    try {
      endpointUrl = (await assertSafeUrl(parsed.data.endpoint_url)).toString();
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        return apiError(422, "unsafe_endpoint", e.message);
      }
      throw e;
    }
  }

  // An explicit project_id must belong to the caller's organization; the
  // scoped lookup is what enforces that, not the id itself.
  let projectId: string;
  if (parsed.data.project_id) {
    const owned = await db()
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(scoped(ctx, schema.project, eq(schema.project.id, parsed.data.project_id)))
      .limit(1);
    if (!owned[0]) {
      return apiError(404, "project_not_found", "No such project.");
    }
    projectId = owned[0].id;
  } else {
    projectId = (await ensureDefaultProject(ctx.organizationId)).id;
  }

  // Cloning happens before the transaction: it takes seconds, and holding a
  // database transaction open across a network fetch is how connection pools
  // die under load.
  let inspection: RepositoryInspection | null = null;
  if (parsed.data.repository_url) {
    try {
      await assertSafeGitUrl(parsed.data.repository_url);
      inspection = await inspectRepository(parsed.data.repository_url, {
        branch: parsed.data.branch,
      });
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        return apiError(422, "unsafe_repository", e.message);
      }
      if (e instanceof DeploymentError) {
        return apiError(
          422,
          e.code,
          e.detail ? `${e.message} ${e.detail}` : e.message,
        );
      }
      throw e;
    }
  }

  const taken = await db()
    .select({ slug: schema.server.slug })
    .from(schema.server)
    .where(scoped(ctx, schema.server));

  const slug = uniqueSlug(
    slugify(parsed.data.name),
    new Set(taken.map((r) => r.slug)),
  );

  const created = await db().transaction(async (tx) => {
    let repositoryId: string | null = null;
    if (inspection && parsed.data.repository_url) {
      const [repo] = await tx
        .insert(schema.repository)
        .values(
          owned(ctx, {
            provider: "git",
            externalId: parsed.data.repository_url,
            owner: inspection.owner,
            name: inspection.name,
            defaultBranch: parsed.data.branch ?? inspection.defaultBranch,
            connectedByUserId: ctx.userId ?? null,
          }),
        )
        .onConflictDoUpdate({
          target: [schema.repository.provider, schema.repository.externalId],
          set: {
            defaultBranch: parsed.data.branch ?? inspection.defaultBranch,
          },
        })
        .returning({ id: schema.repository.id });
      repositoryId = repo?.id ?? null;
    }

    const detection = inspection?.detection;

    const [server] = await tx
      .insert(schema.server)
      .values(
        owned(ctx, {
          projectId,
          repositoryId,
          name: parsed.data.name,
          slug,
          transport: parsed.data.transport,
          framework: detection?.framework ?? "unknown",
          runtime:
            detection?.runtime === "docker"
              ? "docker"
              : (detection?.runtime ?? "node22"),
          rootDirectory: detection?.rootDirectory ?? ".",
          installCommand: detection?.installCommand ?? null,
          buildCommand: detection?.buildCommand ?? null,
          startCommand: detection?.startCommand ?? null,
          detection: detection
            ? {
                confidence: detection.confidence,
                language: detection.language,
                packageManager: detection.packageManager,
                evidence: detection.evidence,
                warnings: detection.warnings,
                headSha: inspection?.headSha,
                inspectedAt: new Date().toISOString(),
              }
            : null,
        }),
      )
      .returning();

    if (!server) throw new Error("Server row was not created.");

    await tx.insert(schema.environment).values(
      owned(ctx, {
        serverId: server.id,
        kind: "production" as const,
        name: "production",
        endpointUrl,
      }),
    );

    await tx.insert(schema.auditLog).values({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      actorApiKeyId: ctx.apiKeyId,
      action: "server.created",
      targetType: "server",
      targetId: server.id,
      metadata: { via: "api", slug },
    });

    return server;
  });

  return Response.json(
    { data: created },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
