"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@mcpfy/db/client";
import { AuthorizationError, owned, requireRole, scoped } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertSafeUrl, assertSafeGitUrl, UnsafeUrlError } from "@/lib/ssrf";
import { ensureDefaultProject } from "@/lib/projects";
import {
  DeploymentError,
  inspectRepository,
  type RepositoryInspection,
} from "@mcpfy/deployment";
import { startDeployment, cancelDeployment, DeployError } from "@/lib/deploy";
import { probeHealth } from "@/lib/health";
import { allows } from "@/lib/billing";

export interface CreateServerState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "endpointUrl" | "repositoryUrl", string>>;
}

const CreateServer = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the server a name of at least two characters.")
    .max(64, "Names are limited to 64 characters."),
  source: z.enum(["url", "git", "cli"]),
  endpointUrl: z.string().trim().optional(),
  repositoryUrl: z.string().trim().optional(),
  branch: z.string().trim().optional(),
  transport: z.enum(["streamable_http", "sse"]).default("streamable_http"),
});

/**
 * §42 — server creation.
 *
 * Three sources: an MCP endpoint you already run, a git repository MCPfy
 * builds and runs for you, or an empty server to deploy into later. The git
 * path clones the repository once at connect time so detection can show what
 * it found and why before a build spends minutes proving a guess wrong.
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

  // §31 — checked before any work is done, so someone at their limit is told
  // immediately rather than after a repository has been cloned.
  const entitlement = await allows(viewer.tenant, { kind: "create_server" });
  if (!entitlement.allowed) {
    return {
      error:
        entitlement.reason +
        (entitlement.upgradeTo
          ? ` The ${entitlement.upgradeTo} plan raises it — see Settings → Billing.`
          : ""),
    };
  }

  const parsed = CreateServer.safeParse({
    name: formData.get("name"),
    source: formData.get("source"),
    endpointUrl: formData.get("endpointUrl"),
    repositoryUrl: formData.get("repositoryUrl"),
    branch: formData.get("branch") || undefined,
    transport: formData.get("transport") ?? "streamable_http",
  });

  if (!parsed.success) {
    const fieldErrors: CreateServerState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "endpointUrl" || key === "repositoryUrl") {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const { name, source, endpointUrl, repositoryUrl, branch, transport } =
    parsed.data;

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

  let inspection: RepositoryInspection | null = null;
  if (source === "git") {
    if (!repositoryUrl) {
      return {
        error: "Check the highlighted fields.",
        fieldErrors: { repositoryUrl: "Enter the repository URL." },
      };
    }
    try {
      await assertSafeGitUrl(repositoryUrl);
      inspection = await inspectRepository(repositoryUrl, { branch });
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        return {
          error: "Check the highlighted fields.",
          fieldErrors: { repositoryUrl: e.message },
        };
      }
      if (e instanceof DeploymentError) {
        return {
          error: "Check the highlighted fields.",
          fieldErrors: {
            repositoryUrl: e.detail ? `${e.message} ${e.detail}` : e.message,
          },
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
    let repositoryId: string | null = null;
    if (inspection && repositoryUrl) {
      const [repo] = await tx
        .insert(schema.repository)
        .values(
          owned(viewer.tenant, {
            provider: "git",
            externalId: repositoryUrl,
            owner: inspection.owner,
            name: inspection.name,
            defaultBranch: branch ?? inspection.defaultBranch,
            connectedByUserId: viewer.user.id,
          }),
        )
        .onConflictDoUpdate({
          target: [schema.repository.provider, schema.repository.externalId],
          set: { defaultBranch: branch ?? inspection.defaultBranch },
        })
        .returning({ id: schema.repository.id });
      repositoryId = repo?.id ?? null;
    }

    const detection = inspection?.detection;

    const [created] = await tx
      .insert(schema.server)
      .values(
        owned(viewer.tenant, {
          projectId: project.id,
          repositoryId,
          name,
          slug,
          transport,
          // "unknown" when nothing was inspected. It is honest — not a
          // placeholder we later pretend was detected.
          framework: detection?.framework ?? ("unknown" as const),
          runtime: detection?.runtime === "docker"
            ? ("docker" as const)
            : (detection?.runtime ?? ("node22" as const)),
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
      metadata: { name, slug, source, framework: inspection?.detection.framework },
    });

    return created.id;
  });

  revalidatePath("/app");
  revalidatePath("/app/servers");
  redirect(`/app/servers/${serverId}`);
}

/* --------------------------------------------------------------- deploying */

export interface DeployState {
  error?: string;
  deploymentId?: string;
}

/**
 * §11 — queues a deployment and returns immediately.
 *
 * The build runs in the background; the page that called this follows it over
 * SSE. Nothing here waits for a build to finish, because nothing should.
 */
export async function deployServerAction(
  _prev: DeployState,
  formData: FormData,
): Promise<DeployState> {
  const viewer = await requireViewer();

  try {
    requireRole(viewer.tenant, "developer");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const serverId = String(formData.get("serverId") ?? "");
  const environmentName = String(formData.get("environment") ?? "production");
  if (!serverId) return { error: "No server was specified." };

  let deploymentId: string;
  try {
    const started = await startDeployment(viewer.tenant, {
      serverId,
      environmentName,
      trigger: "manual",
    });
    deploymentId = started.id;
  } catch (e) {
    if (e instanceof DeployError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/app/servers/${serverId}`);
  redirect(`/app/servers/${serverId}/deployments/${deploymentId}`);
}

export async function cancelDeploymentAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const viewer = await requireViewer();

  try {
    requireRole(viewer.tenant, "developer");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const deploymentId = String(formData.get("deploymentId") ?? "");
  const serverId = String(formData.get("serverId") ?? "");

  // Ownership check before touching anything: the id came from a form.
  const rows = await db()
    .select({ id: schema.deployment.id })
    .from(schema.deployment)
    .where(
      scoped(
        viewer.tenant,
        schema.deployment,
        eq(schema.deployment.id, deploymentId),
      ),
    )
    .limit(1);

  if (!rows[0]) return { error: "No such deployment." };

  if (!cancelDeployment(deploymentId)) {
    return {
      error:
        "That deployment is not running in this process — it may have already finished.",
    };
  }

  revalidatePath(`/app/servers/${serverId}/deployments/${deploymentId}`);
  return {};
}


/* --------------------------------------------------------------- health */

export async function checkHealthAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const viewer = await requireViewer();
  const serverId = String(formData.get("serverId") ?? "");
  if (!serverId) return { error: "No server was specified." };

  // A liveness probe reads; a viewer may run one.
  await probeHealth(viewer.tenant, serverId);
  revalidatePath(`/app/servers/${serverId}`);
  revalidatePath("/app/servers");
  revalidatePath("/app");
  return {};
}
