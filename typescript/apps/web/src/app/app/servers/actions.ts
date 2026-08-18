"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@mcpfy/db/client";
import { AuthorizationError, owned, requireRole, scoped } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";
import { ensureDefaultProject } from "@/lib/projects";

export interface CreateServerState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "endpointUrl", string>>;
}

const CreateServer = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the server a name of at least two characters.")
    .max(64, "Names are limited to 64 characters."),
  source: z.enum(["url", "cli"]),
  endpointUrl: z.string().trim().optional(),
  transport: z.enum(["streamable_http", "sse"]).default("streamable_http"),
});

/**
 * §42 — server creation.
 *
 * Two sources work today: connecting an MCP endpoint you already run, and
 * creating an empty server to deploy into from the CLI. GitHub import is
 * Phase 2 and the form says so rather than offering a button that fails.
 */
export async function createServerAction(
  _prev: CreateServerState,
  formData: FormData,
): Promise<CreateServerState> {
  const viewer = await requireViewer("/app/servers/new");

  // §24 — authorization on the server, every time. Viewers cannot create.
  try {
    requireRole(viewer.tenant, "developer");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const parsed = CreateServer.safeParse({
    name: formData.get("name"),
    source: formData.get("source"),
    endpointUrl: formData.get("endpointUrl"),
    transport: formData.get("transport") ?? "streamable_http",
  });

  if (!parsed.success) {
    const fieldErrors: CreateServerState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "endpointUrl") {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const { name, source, endpointUrl, transport } = parsed.data;

  let validatedEndpoint: string | null = null;
  if (source === "url") {
    if (!endpointUrl) {
      return {
        error: "Check the highlighted fields.",
        fieldErrors: { endpointUrl: "Enter the MCP endpoint URL." },
      };
    }
    try {
      validatedEndpoint = (await assertSafeUrl(endpointUrl)).toString();
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        return {
          error: "Check the highlighted fields.",
          fieldErrors: { endpointUrl: e.message },
        };
      }
      throw e;
    }
  }

  const project = await ensureDefaultProject(viewer.tenant.organizationId);

  const taken = await db()
    .select({ slug: schema.server.slug })
    .from(schema.server)
    .where(scoped(viewer.tenant, schema.server));
  const slug = uniqueSlug(slugify(name), new Set(taken.map((r) => r.slug)));

  const serverId = await db().transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.server)
      .values(
        owned(viewer.tenant, {
          projectId: project.id,
          name,
          slug,
          transport,
          // Detection runs against a repository, which this server does not
          // have yet. "unknown" is honest; it is not a placeholder value we
          // later pretend was detected.
          framework: "unknown" as const,
          health: "unknown" as const,
        }),
      )
      .returning({ id: schema.server.id });

    if (!created) throw new Error("Server row was not created.");

    await tx.insert(schema.environment).values([
      owned(viewer.tenant, {
        serverId: created.id,
        kind: "production" as const,
        name: "production",
        branch: "main",
        endpointUrl: validatedEndpoint,
      }),
      owned(viewer.tenant, {
        serverId: created.id,
        kind: "development" as const,
        name: "development",
        endpointUrl: null,
      }),
    ]);

    await tx.insert(schema.auditLog).values({
      organizationId: viewer.tenant.organizationId,
      actorUserId: viewer.user.id,
      action: "server.created",
      targetType: "server",
      targetId: created.id,
      metadata: { name, slug, source },
    });

    return created.id;
  });

  revalidatePath("/app");
  revalidatePath("/app/servers");
  redirect(`/app/servers/${serverId}`);
}
