import "server-only";
import { and, eq, inArray, lt, or, isNull } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { IN_FLIGHT_STATUSES, scoped, type TenantContext } from "@mcpfy/db";
import { inspect } from "@mcpfy/inspector";
import { isRunning } from "./deploy";

/**
 * Health is a claim about right now, so it has to be re-verified.
 *
 * Writing "healthy" once when a deployment succeeds and never checking again
 * means a server whose process died an hour ago still shows a green dot. For
 * a product whose whole promise is observability, that is worse than showing
 * nothing: it is confidently wrong.
 *
 * There is no background scheduler in this deployment target yet, so the
 * probe runs on read when the last one has gone stale, and on demand from the
 * "Check now" button. Every surface shows *when* it was last verified, so a
 * stale reading is never mistaken for a fresh one.
 */

const STALE_AFTER_MS = 60_000;

export interface HealthProbe {
  health: "healthy" | "degraded" | "unhealthy" | "unknown";
  detail: string | null;
  checkedAt: Date;
  latencyMs?: number;
}

export function isStale(checkedAt: Date | null): boolean {
  return !checkedAt || Date.now() - checkedAt.getTime() > STALE_AFTER_MS;
}

/**
 * Pings a server's production endpoint and records the result.
 *
 * Deliberately cheap: `ping` is one round trip and does not run any tool, so
 * this is safe to do on page load. A full capability sweep belongs to the
 * readiness report, not to a liveness check.
 */
export async function probeHealth(
  ctx: TenantContext,
  serverId: string,
): Promise<HealthProbe> {
  const rows = await db()
    .select({
      endpointUrl: schema.environment.endpointUrl,
      transport: schema.server.transport,
    })
    .from(schema.server)
    .leftJoin(
      schema.environment,
      and(
        eq(schema.environment.serverId, schema.server.id),
        eq(schema.environment.kind, "production"),
      ),
    )
    .where(scoped(ctx, schema.server, eq(schema.server.id, serverId)))
    .limit(1);

  const row = rows[0];
  const checkedAt = new Date();

  if (!row) {
    return { health: "unknown", detail: "No such server.", checkedAt };
  }

  if (!row.endpointUrl) {
    return await record(ctx, serverId, {
      health: "unknown",
      detail: "No production endpoint yet.",
      checkedAt,
    });
  }

  const result = await inspect(
    {
      endpointUrl: row.endpointUrl,
      transport: row.transport === "sse" ? "sse" : "streamable_http",
      timeoutMs: 5_000,
    },
    { method: "ping" },
  );

  if (result.ok) {
    const latencyMs = result.operationMs ?? result.totalMs;
    return await record(ctx, serverId, {
      health: latencyMs > 2000 ? "degraded" : "healthy",
      detail:
        latencyMs > 2000
          ? `Responding, but slowly (${latencyMs}ms).`
          : `Responded in ${latencyMs}ms.`,
      checkedAt,
      latencyMs,
    });
  }

  return await record(ctx, serverId, {
    health: "unhealthy",
    detail: result.error?.message ?? "The server did not respond.",
    checkedAt,
  });
}

async function record(
  ctx: TenantContext,
  serverId: string,
  probe: HealthProbe,
): Promise<HealthProbe> {
  await db()
    .update(schema.server)
    .set({
      health: probe.health,
      healthDetail: probe.detail,
      healthCheckedAt: probe.checkedAt,
    })
    .where(scoped(ctx, schema.server, eq(schema.server.id, serverId)));
  return probe;
}

/**
 * Resolves deployments that were in flight when the process died.
 *
 * Deployment state lives in memory — the abort controller, the child process
 * handle — so a restart orphans anything mid-build. Without this, a server
 * restarted at the wrong moment shows "Building" forever and refuses new
 * deployments because it thinks one is already running.
 *
 * Runs once per process, lazily, on the first dashboard read.
 */
const RECONCILED = Symbol.for("mcpfy.deployments.reconciled");
type Global = typeof globalThis & { [RECONCILED]?: boolean };

export async function reconcileOrphanedDeployments(
  ctx: TenantContext,
): Promise<void> {
  const g = globalThis as Global;
  if (g[RECONCILED]) return;
  g[RECONCILED] = true;

  const inFlight = await db()
    .select({ id: schema.deployment.id })
    .from(schema.deployment)
    .where(
      scoped(
        ctx,
        schema.deployment,
        inArray(schema.deployment.status, [...IN_FLIGHT_STATUSES]),
      ),
    );

  const orphans = inFlight.filter((d) => !isRunning(d.id));
  if (orphans.length === 0) return;

  await db()
    .update(schema.deployment)
    .set({
      status: "failed",
      errorCode: "interrupted",
      errorMessage:
        "MCPfy restarted while this deployment was running, so it could not be " +
        "completed or resumed. Deploy again to retry.",
      endedAt: new Date(),
    })
    .where(
      inArray(
        schema.deployment.id,
        orphans.map((o) => o.id),
      ),
    );
}

/** Servers whose health has not been verified recently. */
export async function staleServerIds(
  ctx: TenantContext,
  limit = 20,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const rows = await db()
    .select({ id: schema.server.id })
    .from(schema.server)
    .where(
      scoped(
        ctx,
        schema.server,
        or(
          isNull(schema.server.healthCheckedAt),
          lt(schema.server.healthCheckedAt, cutoff),
        ),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}
