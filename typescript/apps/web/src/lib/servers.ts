import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped, type TenantContext } from "@mcpfy/db";

/**
 * Tenant-scoped reads for servers and their rollups.
 *
 * Every query here goes through `scoped()`. §15's rule that analytics must
 * come from real data cuts both ways: when a server has never received a
 * request these functions return zero and the UI says "no traffic yet",
 * rather than inventing a sparkline.
 */

export interface ServerSummary {
  id: string;
  name: string;
  slug: string;
  framework: string;
  health: "healthy" | "degraded" | "unhealthy" | "unknown";
  endpointUrl: string | null;
  createdAt: Date;
  requests24h: number;
  errors24h: number;
  p95LatencyMs: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listServers(
  ctx: TenantContext,
): Promise<ServerSummary[]> {
  const since = new Date(Date.now() - DAY_MS);

  const rows = await db()
    .select({
      id: schema.server.id,
      name: schema.server.name,
      slug: schema.server.slug,
      framework: schema.server.framework,
      health: schema.server.health,
      createdAt: schema.server.createdAt,
      endpointUrl: schema.environment.endpointUrl,
    })
    .from(schema.server)
    .leftJoin(
      schema.environment,
      and(
        eq(schema.environment.serverId, schema.server.id),
        eq(schema.environment.kind, "production"),
      ),
    )
    .where(scoped(ctx, schema.server))
    .orderBy(desc(schema.server.createdAt));

  if (rows.length === 0) return [];

  // One grouped pass over the window rather than a query per server.
  const stats = await db()
    .select({
      serverId: schema.requestLog.serverId,
      requests: count(),
      errors: sql<number>`count(*) filter (where ${schema.requestLog.outcome} <> 'ok')`,
      p95: sql<
        number | null
      >`percentile_disc(0.95) within group (order by ${schema.requestLog.durationMs})`,
    })
    .from(schema.requestLog)
    .where(
      scoped(ctx, schema.requestLog, gte(schema.requestLog.at, since)),
    )
    .groupBy(schema.requestLog.serverId);

  const byServer = new Map(stats.map((s) => [s.serverId, s]));

  return rows.map((r) => {
    const s = byServer.get(r.id);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      framework: r.framework,
      health: r.health,
      endpointUrl: r.endpointUrl,
      createdAt: r.createdAt,
      requests24h: Number(s?.requests ?? 0),
      errors24h: Number(s?.errors ?? 0),
      p95LatencyMs: s?.p95 == null ? null : Math.round(Number(s.p95)),
    };
  });
}

export interface OrgOverview {
  serverCount: number;
  requests24h: number;
  errorRate24h: number | null;
  p95LatencyMs: number | null;
  /** True when no request has ever been recorded, so the UI can explain why. */
  neverReceivedTraffic: boolean;
}

export async function orgOverview(ctx: TenantContext): Promise<OrgOverview> {
  const since = new Date(Date.now() - DAY_MS);

  const [servers] = await db()
    .select({ n: count() })
    .from(schema.server)
    .where(scoped(ctx, schema.server));

  const [window] = await db()
    .select({
      requests: count(),
      errors: sql<number>`count(*) filter (where ${schema.requestLog.outcome} <> 'ok')`,
      p95: sql<
        number | null
      >`percentile_disc(0.95) within group (order by ${schema.requestLog.durationMs})`,
    })
    .from(schema.requestLog)
    .where(scoped(ctx, schema.requestLog, gte(schema.requestLog.at, since)));

  const [ever] = await db()
    .select({ n: count() })
    .from(schema.requestLog)
    .where(scoped(ctx, schema.requestLog));

  const requests = Number(window?.requests ?? 0);
  const errors = Number(window?.errors ?? 0);

  return {
    serverCount: Number(servers?.n ?? 0),
    requests24h: requests,
    errorRate24h: requests === 0 ? null : errors / requests,
    p95LatencyMs:
      window?.p95 == null ? null : Math.round(Number(window.p95)),
    neverReceivedTraffic: Number(ever?.n ?? 0) === 0,
  };
}

export async function getServer(ctx: TenantContext, id: string) {
  const rows = await db()
    .select()
    .from(schema.server)
    .where(scoped(ctx, schema.server, eq(schema.server.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getServerEnvironments(
  ctx: TenantContext,
  serverId: string,
) {
  return db()
    .select()
    .from(schema.environment)
    .where(
      scoped(ctx, schema.environment, eq(schema.environment.serverId, serverId)),
    )
    .orderBy(schema.environment.kind);
}

export async function getServerDeployments(
  ctx: TenantContext,
  serverId: string,
  limit = 10,
) {
  return db()
    .select()
    .from(schema.deployment)
    .where(
      scoped(ctx, schema.deployment, eq(schema.deployment.serverId, serverId)),
    )
    .orderBy(desc(schema.deployment.number))
    .limit(limit);
}

export async function getServerTools(ctx: TenantContext, serverId: string) {
  return db()
    .select()
    .from(schema.tool)
    .where(scoped(ctx, schema.tool, eq(schema.tool.serverId, serverId)))
    .orderBy(schema.tool.name);
}

export interface ServerTraffic {
  requests: number;
  toolCalls: number;
  errorRate: number | null;
  p95LatencyMs: number | null;
  /** True when this server has never been called through the gateway. */
  neverCalled: boolean;
}

/**
 * §22 — one server's traffic over the last 24 hours.
 *
 * Reads from what the gateway actually recorded. When nothing has been
 * recorded the caller is told so explicitly rather than being handed zeroes,
 * because "no traffic yet" and "traffic, all of it zero" are different facts
 * and only one of them is a problem.
 */
export async function serverTraffic(
  ctx: TenantContext,
  serverId: string,
): Promise<ServerTraffic> {
  const since = new Date(Date.now() - DAY_MS);

  const [window] = await db()
    .select({
      requests: count(),
      errors: sql<number>`count(*) filter (where ${schema.requestLog.outcome} <> 'ok')`,
      p95: sql<
        number | null
      >`percentile_disc(0.95) within group (order by ${schema.requestLog.durationMs})`,
    })
    .from(schema.requestLog)
    .where(
      scoped(
        ctx,
        schema.requestLog,
        and(eq(schema.requestLog.serverId, serverId), gte(schema.requestLog.at, since)),
      ),
    );

  const [tools] = await db()
    .select({ n: count() })
    .from(schema.toolCall)
    .where(
      scoped(
        ctx,
        schema.toolCall,
        and(eq(schema.toolCall.serverId, serverId), gte(schema.toolCall.at, since)),
      ),
    );

  const [ever] = await db()
    .select({ n: count() })
    .from(schema.requestLog)
    .where(scoped(ctx, schema.requestLog, eq(schema.requestLog.serverId, serverId)));

  const requests = Number(window?.requests ?? 0);

  return {
    requests,
    toolCalls: Number(tools?.n ?? 0),
    errorRate: requests === 0 ? null : Number(window?.errors ?? 0) / requests,
    p95LatencyMs: window?.p95 == null ? null : Math.round(Number(window.p95)),
    neverCalled: Number(ever?.n ?? 0) === 0,
  };
}

/** §22 — per-tool breakdown, which is what §14's registry page needs. */
export async function toolBreakdown(ctx: TenantContext, serverId: string) {
  const since = new Date(Date.now() - DAY_MS);
  return db()
    .select({
      toolName: schema.toolCall.toolName,
      calls: count(),
      errors: sql<number>`count(*) filter (where ${schema.toolCall.outcome} <> 'ok')`,
      p95: sql<
        number | null
      >`percentile_disc(0.95) within group (order by ${schema.toolCall.durationMs})`,
    })
    .from(schema.toolCall)
    .where(
      scoped(
        ctx,
        schema.toolCall,
        and(eq(schema.toolCall.serverId, serverId), gte(schema.toolCall.at, since)),
      ),
    )
    .groupBy(schema.toolCall.toolName)
    .orderBy(desc(count()));
}
