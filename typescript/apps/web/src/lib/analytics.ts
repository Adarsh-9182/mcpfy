import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped, type TenantContext } from "@mcpfy/db";

/**
 * §22 — analytics reads.
 *
 * Every function here aggregates in Postgres and returns at most a few dozen
 * rows. §42's rule — do not load a hundred thousand records into a browser
 * because pagination looked unappealing — is enforced by never selecting raw
 * rows in the first place: the database counts, buckets and computes
 * percentiles, and the page receives the answer.
 */

export type Range = "24h" | "7d" | "30d";

interface RangeSpec {
  since: Date;
  /** Postgres date_trunc unit for the buckets. */
  unit: "hour" | "day";
  /** Postgres interval matching the unit, for generate_series. */
  step: string;
  label: string;
}

export function rangeSpec(range: Range): RangeSpec {
  const now = Date.now();
  switch (range) {
    case "24h":
      return {
        since: new Date(now - 24 * 60 * 60 * 1000),
        unit: "hour",
        step: "1 hour",
        label: "Last 24 hours",
      };
    case "7d":
      return {
        since: new Date(now - 7 * 24 * 60 * 60 * 1000),
        unit: "day",
        step: "1 day",
        label: "Last 7 days",
      };
    case "30d":
      return {
        since: new Date(now - 30 * 24 * 60 * 60 * 1000),
        unit: "day",
        step: "1 day",
        label: "Last 30 days",
      };
  }
}

export function parseRange(value: string | undefined): Range {
  return value === "7d" || value === "30d" ? value : "24h";
}

/* ------------------------------------------------------------- headlines */

export interface Headline {
  requests: number;
  toolCalls: number;
  errors: number;
  errorRate: number | null;
  sessions: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  bytesIn: number;
  bytesOut: number;
}

export async function headline(
  ctx: TenantContext,
  serverId: string,
  range: Range,
): Promise<Headline> {
  const { since } = rangeSpec(range);
  const where = scoped(
    ctx,
    schema.requestLog,
    and(eq(schema.requestLog.serverId, serverId), gte(schema.requestLog.at, since)),
  );

  const [row] = await db()
    .select({
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${schema.requestLog.outcome} <> 'ok')::int`,
      sessions: sql<number>`count(distinct ${schema.requestLog.sessionId})::int`,
      bytesIn: sql<number>`coalesce(sum(${schema.requestLog.requestBytes}), 0)::bigint`,
      bytesOut: sql<number>`coalesce(sum(${schema.requestLog.responseBytes}), 0)::bigint`,
      p50: sql<
        number | null
      >`percentile_disc(0.50) within group (order by ${schema.requestLog.durationMs})`,
      p95: sql<
        number | null
      >`percentile_disc(0.95) within group (order by ${schema.requestLog.durationMs})`,
      p99: sql<
        number | null
      >`percentile_disc(0.99) within group (order by ${schema.requestLog.durationMs})`,
    })
    .from(schema.requestLog)
    .where(where);

  const [tools] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.toolCall)
    .where(
      scoped(
        ctx,
        schema.toolCall,
        and(eq(schema.toolCall.serverId, serverId), gte(schema.toolCall.at, since)),
      ),
    );

  const requests = Number(row?.requests ?? 0);
  const errors = Number(row?.errors ?? 0);

  return {
    requests,
    toolCalls: Number(tools?.n ?? 0),
    errors,
    errorRate: requests === 0 ? null : errors / requests,
    sessions: Number(row?.sessions ?? 0),
    p50: round(row?.p50),
    p95: round(row?.p95),
    p99: round(row?.p99),
    bytesIn: Number(row?.bytesIn ?? 0),
    bytesOut: Number(row?.bytesOut ?? 0),
  };
}

/* ----------------------------------------------------------- time series */

export interface Bucket {
  at: string;
  ok: number;
  errors: number;
  p95: number | null;
}

/**
 * Requests per bucket, with empty buckets filled in.
 *
 * The gap fill matters: without it a quiet hour is simply missing, and a line
 * chart draws straight through it as though traffic continued. `generate_series`
 * produces the full axis and the join leaves zeroes where nothing happened.
 */
export async function trafficSeries(
  ctx: TenantContext,
  serverId: string,
  range: Range,
): Promise<Bucket[]> {
  const { since, unit, step } = rangeSpec(range);

  // The bound date is sent as an ISO string and cast in SQL: passing a JS
  // Date straight into a raw fragment reaches the driver as an object it
  // cannot serialise, and the query fails at execution time.
  const sinceIso = since.toISOString();

  const rows = await db().execute(sql`
    with axis as (
      select generate_series(
        date_trunc(${unit}, ${sinceIso}::timestamptz),
        date_trunc(${unit}, now()),
        ${step}::interval
      ) as bucket
    ),
    hits as (
      select
        date_trunc(${unit}, at) as bucket,
        count(*) filter (where outcome = 'ok')::int as ok,
        count(*) filter (where outcome <> 'ok')::int as errors,
        percentile_disc(0.95) within group (order by duration_ms) as p95
      from request_log
      where organization_id = ${ctx.organizationId}
        and server_id = ${serverId}
        and at >= ${sinceIso}::timestamptz
      group by 1
    )
    select
      axis.bucket as at,
      coalesce(hits.ok, 0) as ok,
      coalesce(hits.errors, 0) as errors,
      hits.p95 as p95
    from axis
    left join hits on hits.bucket = axis.bucket
    order by axis.bucket asc
  `);

  return (rows as unknown as Record<string, unknown>[]).map((row) => ({
    at: new Date(row.at as string).toISOString(),
    ok: Number(row.ok ?? 0),
    errors: Number(row.errors ?? 0),
    p95: row.p95 == null ? null : Math.round(Number(row.p95)),
  }));
}

/* ---------------------------------------------------------- by dimension */

export interface ToolStat {
  toolName: string;
  calls: number;
  errors: number;
  errorRate: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export async function toolStats(
  ctx: TenantContext,
  serverId: string,
  range: Range,
): Promise<ToolStat[]> {
  const { since } = rangeSpec(range);

  const rows = await db()
    .select({
      toolName: schema.toolCall.toolName,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${schema.toolCall.outcome} <> 'ok')::int`,
      p50: sql<
        number | null
      >`percentile_disc(0.50) within group (order by ${schema.toolCall.durationMs})`,
      p95: sql<
        number | null
      >`percentile_disc(0.95) within group (order by ${schema.toolCall.durationMs})`,
      p99: sql<
        number | null
      >`percentile_disc(0.99) within group (order by ${schema.toolCall.durationMs})`,
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
    .orderBy(sql`count(*) desc`)
    .limit(25);

  return rows.map((row) => ({
    toolName: row.toolName,
    calls: Number(row.calls),
    errors: Number(row.errors),
    errorRate: Number(row.calls) === 0 ? 0 : Number(row.errors) / Number(row.calls),
    p50: round(row.p50),
    p95: round(row.p95),
    p99: round(row.p99),
  }));
}

export interface MethodStat {
  method: string;
  calls: number;
  errors: number;
}

export async function methodStats(
  ctx: TenantContext,
  serverId: string,
  range: Range,
): Promise<MethodStat[]> {
  const { since } = rangeSpec(range);
  const rows = await db()
    .select({
      method: schema.requestLog.method,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${schema.requestLog.outcome} <> 'ok')::int`,
    })
    .from(schema.requestLog)
    .where(
      scoped(
        ctx,
        schema.requestLog,
        and(eq(schema.requestLog.serverId, serverId), gte(schema.requestLog.at, since)),
      ),
    )
    .groupBy(schema.requestLog.method)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  return rows.map((r) => ({
    method: r.method,
    calls: Number(r.calls),
    errors: Number(r.errors),
  }));
}

export interface ClientStat {
  clientName: string;
  sessions: number;
  requests: number;
}

/**
 * §22 client breakdown.
 *
 * Client identity only exists when a client sent `clientInfo` during the
 * handshake, which not every one does. Unidentified traffic is grouped as
 * "unidentified" rather than dropped — a breakdown that silently omits a
 * third of the traffic is worse than one that admits the gap.
 */
export async function clientStats(
  ctx: TenantContext,
  serverId: string,
  range: Range,
): Promise<ClientStat[]> {
  const { since } = rangeSpec(range);
  const rows = await db()
    .select({
      clientName: sql<string>`coalesce(${schema.mcpSession.clientName}, 'unidentified')`,
      sessions: sql<number>`count(*)::int`,
      requests: sql<number>`coalesce(sum(${schema.mcpSession.requestCount}), 0)::int`,
    })
    .from(schema.mcpSession)
    .where(
      scoped(
        ctx,
        schema.mcpSession,
        and(
          eq(schema.mcpSession.serverId, serverId),
          gte(schema.mcpSession.startedAt, since),
        ),
      ),
    )
    .groupBy(sql`coalesce(${schema.mcpSession.clientName}, 'unidentified')`)
    .orderBy(sql`count(*) desc`)
    .limit(12);

  return rows.map((r) => ({
    clientName: r.clientName,
    sessions: Number(r.sessions),
    requests: Number(r.requests),
  }));
}

export interface ErrorGroup {
  errorCode: string;
  count: number;
  sample: string | null;
  lastSeen: string;
}

/**
 * §23 — errors grouped by cause rather than listed one by one.
 *
 * "Database connection timeout ×412" is actionable. Four hundred and twelve
 * separate rows saying the same thing are not.
 */
export async function errorGroups(
  ctx: TenantContext,
  serverId: string,
  range: Range,
): Promise<ErrorGroup[]> {
  const { since } = rangeSpec(range);
  const rows = await db()
    .select({
      errorCode: sql<string>`coalesce(${schema.requestLog.errorCode}, 'unknown')`,
      count: sql<number>`count(*)::int`,
      sample: sql<string | null>`max(${schema.requestLog.errorMessage})`,
      lastSeen: sql<string>`max(${schema.requestLog.at})`,
    })
    .from(schema.requestLog)
    .where(
      scoped(
        ctx,
        schema.requestLog,
        and(
          eq(schema.requestLog.serverId, serverId),
          gte(schema.requestLog.at, since),
          sql`${schema.requestLog.outcome} <> 'ok'`,
        ),
      ),
    )
    .groupBy(sql`coalesce(${schema.requestLog.errorCode}, 'unknown')`)
    .orderBy(sql`count(*) desc`)
    .limit(12);

  return rows.map((r) => ({
    errorCode: r.errorCode,
    count: Number(r.count),
    sample: r.sample,
    lastSeen: new Date(r.lastSeen).toISOString(),
  }));
}

function round(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(Number(value));
}
