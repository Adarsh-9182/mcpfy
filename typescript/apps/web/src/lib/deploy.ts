import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { unseal, IN_FLIGHT_STATUSES, type TenantContext } from "@mcpfy/db";
import { LocalRuntime, Orchestrator, runningHandles } from "@mcpfy/deployment";
import type { DeploymentSpec } from "@mcpfy/deployment";
import {
  DrizzleDeploymentStore,
  nextDeploymentNumber,
} from "./deployment-store";

/**
 * Starting a deployment and letting it run.
 *
 * The HTTP request that triggers a deployment returns as soon as the row
 * exists; the work continues in the background and the UI follows it over
 * SSE. That is the only shape that works — a build takes minutes and no
 * request should be held open for one.
 */

export class DeployError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeployError";
  }
}

/** In-flight deployments, so they can be cancelled or superseded. */
const RUNNING_KEY = Symbol.for("mcpfy.deployments.running");
type RunningMap = Map<string, AbortController>;
type Global = typeof globalThis & { [RUNNING_KEY]?: RunningMap };

function running(): RunningMap {
  const g = globalThis as Global;
  g[RUNNING_KEY] ??= new Map();
  return g[RUNNING_KEY];
}

export function isRunning(deploymentId: string): boolean {
  return running().has(deploymentId);
}

export function cancelDeployment(deploymentId: string): boolean {
  const controller = running().get(deploymentId);
  if (!controller) return false;
  controller.abort(new Error("Cancelled by user."));
  return true;
}

export interface StartOptions {
  serverId: string;
  environmentName?: string;
  branch?: string;
  commitSha?: string | null;
  trigger?: "manual" | "git_push" | "api" | "cli";
}

export interface StartedDeployment {
  id: string;
  number: number;
}

export async function startDeployment(
  ctx: TenantContext,
  options: StartOptions,
): Promise<StartedDeployment> {
  const server = await loadServer(ctx, options.serverId);

  if (!server.repository) {
    throw new DeployError(
      "no_repository",
      "This server has no connected repository, so there is nothing to build. " +
        "Connect one, or point the server at an endpoint you already run.",
    );
  }

  if (!server.startCommand) {
    throw new DeployError(
      "no_start_command",
      "This server has no start command. Detection could not determine one — " +
        "set it in the server's settings and deploy again.",
    );
  }

  const environmentName = options.environmentName ?? "production";
  const environment = server.environments.find(
    (e) => e.name === environmentName,
  );
  if (!environment) {
    throw new DeployError(
      "no_environment",
      `This server has no "${environmentName}" environment.`,
    );
  }

  // A newer deployment supersedes an older one to the same environment;
  // otherwise a slow build would block every push behind it.
  await supersedeInFlight(ctx, server.id, environment.id);

  const branch =
    options.branch ?? environment.branch ?? server.repository.defaultBranch;

  const number = await nextDeploymentNumber(ctx.organizationId, server.id);

  const [row] = await db()
    .insert(schema.deployment)
    .values({
      organizationId: ctx.organizationId,
      serverId: server.id,
      environmentId: environment.id,
      number,
      status: "queued",
      branch,
      commitSha: options.commitSha ?? null,
      triggeredByUserId: ctx.userId ?? null,
      trigger: options.trigger ?? "manual",
      queuedAt: new Date(),
    })
    .returning({ id: schema.deployment.id });

  if (!row) throw new DeployError("insert_failed", "The deployment could not be queued.");

  await db().insert(schema.auditLog).values({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    actorApiKeyId: ctx.apiKeyId,
    action: "deployment.started",
    targetType: "deployment",
    targetId: row.id,
    metadata: { serverId: server.id, environment: environmentName, branch, number },
  });

  const spec: DeploymentSpec = {
    deploymentId: row.id,
    organizationId: ctx.organizationId,
    serverId: server.id,
    serverSlug: server.slug,
    environmentId: environment.id,
    environmentName,
    repositoryUrl: repositoryUrl(server.repository),
    branch,
    commitSha: options.commitSha ?? null,
    rootDirectory: server.rootDirectory,
    installCommand: server.installCommand,
    buildCommand: server.buildCommand,
    startCommand: server.startCommand,
    runtime: server.runtime === "docker" ? "docker" : server.runtime,
    env: await environmentSecrets(ctx, server.id, environment.id),
  };

  launch(ctx, spec);

  return { id: row.id, number };
}

/**
 * Fire-and-forget, deliberately.
 *
 * The promise is not awaited and not returned: the caller is an HTTP request
 * that must not block on a build. Errors are already recorded on the
 * deployment row by the orchestrator, so the catch here only has to stop an
 * unhandled rejection from taking the process down.
 */
function launch(ctx: TenantContext, spec: DeploymentSpec): void {
  const controller = new AbortController();
  running().set(spec.deploymentId, controller);

  const store = new DrizzleDeploymentStore(ctx.organizationId, spec.deploymentId);
  const orchestrator = new Orchestrator({
    store,
    runtime: new LocalRuntime(),
  });

  void orchestrator
    .run(spec, controller.signal)
    .catch(() => {
      // The orchestrator resolves rather than rejects; this is belt and braces.
    })
    .finally(() => {
      running().delete(spec.deploymentId);
    });
}

async function supersedeInFlight(
  ctx: TenantContext,
  serverId: string,
  environmentId: string,
): Promise<void> {
  const inFlight = await db()
    .select({ id: schema.deployment.id })
    .from(schema.deployment)
    .where(
      and(
        eq(schema.deployment.organizationId, ctx.organizationId),
        eq(schema.deployment.serverId, serverId),
        eq(schema.deployment.environmentId, environmentId),
        inArray(schema.deployment.status, [...IN_FLIGHT_STATUSES]),
      ),
    );

  for (const deployment of inFlight) {
    if (!cancelDeployment(deployment.id)) {
      // Not running in this process — most likely a restart left it orphaned.
      // Mark it cancelled so it stops showing as in flight forever.
      await db()
        .update(schema.deployment)
        .set({
          status: "cancelled",
          errorCode: "superseded",
          errorMessage: "Superseded by a newer deployment.",
          endedAt: new Date(),
        })
        .where(eq(schema.deployment.id, deployment.id));
    }
  }
}

/** §25 — secrets are decrypted here and never leave the server process. */
async function environmentSecrets(
  ctx: TenantContext,
  serverId: string,
  environmentId: string,
): Promise<Record<string, string>> {
  const rows = await db()
    .select()
    .from(schema.secret)
    .where(
      and(
        eq(schema.secret.organizationId, ctx.organizationId),
        eq(schema.secret.serverId, serverId),
      ),
    );

  const env: Record<string, string> = {};
  // Server-wide secrets first, then environment-specific ones override them.
  for (const scope of [null, environmentId]) {
    for (const row of rows) {
      if (row.environmentId !== scope) continue;
      try {
        env[row.key] = unseal(row);
      } catch {
        // A secret we cannot decrypt is omitted rather than crashing the
        // deployment; the build will fail with a message about the missing
        // variable, which is far easier to act on than a crypto error.
      }
    }
  }
  return env;
}

/**
 * The URL git is actually given.
 *
 * For a repository connected by URL, `externalId` *is* the URL and must be
 * used verbatim — reconstructing one from owner/name silently rewrites a
 * self-hosted GitLab remote, or a local path, into a GitHub URL that does not
 * exist. Only the GitHub App case stores a numeric id instead of a URL, and
 * that is the only case worth building a URL for.
 */
function repositoryUrl(repository: {
  provider: string;
  externalId: string;
  owner: string;
  name: string;
}): string {
  if (repository.provider === "github" && /^\d+$/.test(repository.externalId)) {
    return `https://github.com/${repository.owner}/${repository.name}.git`;
  }
  return repository.externalId;
}

async function loadServer(ctx: TenantContext, serverId: string) {
  const rows = await db()
    .select()
    .from(schema.server)
    .where(
      and(
        eq(schema.server.id, serverId),
        eq(schema.server.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);

  const server = rows[0];
  if (!server) throw new DeployError("not_found", "No such server.");

  const environments = await db()
    .select()
    .from(schema.environment)
    .where(eq(schema.environment.serverId, serverId));

  const repository = server.repositoryId
    ? (
        await db()
          .select()
          .from(schema.repository)
          .where(eq(schema.repository.id, server.repositoryId))
          .limit(1)
      )[0]
    : undefined;

  return { ...server, environments, repository };
}

export { runningHandles };
