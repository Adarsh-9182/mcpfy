import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { hashApiKey } from "@mcpfy/db";
import type { GatewaySink, RequestRecord, Target } from "@mcpfy/gateway";

/**
 * §20 — resolving, authorising and recording gateway traffic.
 *
 * Everything here runs on a customer's production request path, so the
 * shape is dictated by two rules: do the least possible work before
 * forwarding, and never let a database write delay or fail the response.
 */

export interface ResolvedTarget extends Target {
  serverSlug: string;
  organizationSlug: string;
}

/**
 * Finds the server a gateway URL points at.
 *
 * The endpoint comes from the production environment, so a redeploy moves
 * traffic without the client's configuration changing — which is the whole
 * reason to route through a stable gateway URL rather than handing clients
 * the raw deployment endpoint.
 */
export async function resolveTarget(
  organizationSlug: string,
  serverSlug: string,
  environmentName = "production",
): Promise<ResolvedTarget | null> {
  const rows = await db()
    .select({
      serverId: schema.server.id,
      serverSlug: schema.server.slug,
      organizationId: schema.organization.id,
      organizationSlug: schema.organization.slug,
      environmentId: schema.environment.id,
      endpointUrl: schema.environment.endpointUrl,
    })
    .from(schema.server)
    .innerJoin(
      schema.organization,
      eq(schema.server.organizationId, schema.organization.id),
    )
    .leftJoin(
      schema.environment,
      and(
        eq(schema.environment.serverId, schema.server.id),
        eq(schema.environment.name, environmentName),
      ),
    )
    .where(
      and(
        eq(schema.organization.slug, organizationSlug),
        eq(schema.server.slug, serverSlug),
        isNull(schema.server.archivedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row?.endpointUrl) return null;

  return {
    serverId: row.serverId,
    serverSlug: row.serverSlug,
    organizationId: row.organizationId,
    organizationSlug: row.organizationSlug,
    environmentId: row.environmentId,
    endpointUrl: row.endpointUrl,
  };
}

export type GatewayAuth =
  | { ok: true; apiKeyId: string }
  | { ok: false; reason: string };

/**
 * Authorises a gateway request.
 *
 * MCP clients send `Authorization: Bearer …`, so that is where the key is
 * read from. The key must belong to the same organization as the server:
 * a valid key for one tenant must not open another tenant's gateway, and
 * that check happens here rather than being assumed from the URL.
 */
export async function authenticateGateway(
  request: Request,
  organizationId: string,
): Promise<GatewayAuth> {
  const header =
    request.headers.get("authorization") ?? request.headers.get("x-mcpfy-key");
  if (!header) {
    return { ok: false, reason: "Missing Authorization header." };
  }

  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) return { ok: false, reason: "Empty credential." };

  const rows = await db()
    .select({ id: schema.apiKey.id, organizationId: schema.apiKey.organizationId })
    .from(schema.apiKey)
    .where(
      and(
        eq(schema.apiKey.keyHash, hashApiKey(presented)),
        isNull(schema.apiKey.revokedAt),
        or(isNull(schema.apiKey.expiresAt), gt(schema.apiKey.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const key = rows[0];
  // Deliberately the same message for "no such key" and "key from another
  // organization": distinguishing them tells an attacker which of their
  // guesses was a real key.
  if (!key || key.organizationId !== organizationId) {
    return { ok: false, reason: "That API key is not valid for this server." };
  }

  return { ok: true, apiKeyId: key.id };
}

/**
 * Writes gateway records to Postgres, in batches, off the request path.
 *
 * Records are queued in memory and flushed on a timer. A request must never
 * wait on analytics, and a flush that fails must never escalate into a failed
 * request — the worst acceptable outcome is a missing row in a chart.
 */
const SINK_KEY = Symbol.for("mcpfy.gateway.sink");
type Global = typeof globalThis & { [SINK_KEY]?: BatchingSink };

const FLUSH_MS = 500;
const MAX_BATCH = 200;

class BatchingSink implements GatewaySink {
  private queue: RequestRecord[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> = Promise.resolve();

  record(entry: RequestRecord): void {
    this.queue.push(entry);
    if (this.queue.length >= MAX_BATCH) {
      void this.flush();
      return;
    }
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.queue.length === 0) return this.inFlight;

    const batch = this.queue;
    this.queue = [];

    this.inFlight = this.inFlight
      .then(() => persist(batch))
      .catch(() => {
        // Losing analytics is bad. Taking the gateway down to protect
        // analytics is worse.
      });
    return this.inFlight;
  }
}

export function gatewaySink(): BatchingSink {
  const g = globalThis as Global;
  g[SINK_KEY] ??= new BatchingSink();
  return g[SINK_KEY];
}

async function persist(batch: RequestRecord[]): Promise<void> {
  // Sessions first: request rows reference them.
  const sessionIds = await upsertSessions(batch);

  const requestRows = batch.map((entry) => ({
    organizationId: entry.organizationId,
    serverId: entry.serverId,
    environmentId: entry.environmentId,
    sessionId: entry.sessionKey ? (sessionIds.get(entry.sessionKey) ?? null) : null,
    traceId: entry.traceId,
    requestId: entry.requestId,
    method: entry.method,
    outcome: entry.outcome,
    statusCode: entry.statusCode,
    durationMs: entry.durationMs,
    requestBytes: entry.requestBytes,
    responseBytes: entry.responseBytes,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage?.slice(0, 2000) ?? null,
    at: entry.at,
  }));

  const inserted = await db()
    .insert(schema.requestLog)
    .values(requestRows)
    .returning({ id: schema.requestLog.id, traceId: schema.requestLog.traceId });

  const byTrace = new Map(inserted.map((row) => [row.traceId, row.id]));

  // Tool calls are denormalised out of request_log because §14 and §22 query
  // them by tool name far more often than by method.
  const toolRows = batch
    .filter((entry) => entry.toolName)
    .map((entry) => ({
      organizationId: entry.organizationId,
      serverId: entry.serverId,
      sessionId: entry.sessionKey ? (sessionIds.get(entry.sessionKey) ?? null) : null,
      requestLogId: byTrace.get(entry.traceId) ?? null,
      traceId: entry.traceId,
      toolName: entry.toolName!,
      argumentKeys: entry.argumentKeys,
      outcome: entry.outcome,
      durationMs: entry.durationMs,
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage?.slice(0, 2000) ?? null,
      at: entry.at,
    }));

  if (toolRows.length > 0) {
    await db().insert(schema.toolCall).values(toolRows);
  }
}

/**
 * Creates or updates one row per MCP session.
 *
 * The client's session id is only unique within a server, so the natural key
 * is (server, external id) — using the client's id alone would merge two
 * customers' conversations that happened to collide.
 */
async function upsertSessions(
  batch: RequestRecord[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  const keyed = batch.filter((entry) => entry.sessionKey);
  if (keyed.length === 0) return ids;

  const seen = new Map<string, RequestRecord>();
  for (const entry of keyed) {
    // Keep the richest sample: the handshake carries the client identity.
    const existing = seen.get(entry.sessionKey!);
    if (!existing || (!existing.clientName && entry.clientName)) {
      seen.set(entry.sessionKey!, entry);
    }
  }

  for (const [key, sample] of seen) {
    const errors = keyed.filter(
      (e) => e.sessionKey === key && e.outcome !== "ok",
    ).length;
    const requests = keyed.filter((e) => e.sessionKey === key).length;

    const [row] = await db()
      .insert(schema.mcpSession)
      .values({
        organizationId: sample.organizationId,
        serverId: sample.serverId,
        environmentId: sample.environmentId,
        externalId: key,
        clientName: sample.clientName,
        clientVersion: sample.clientVersion,
        protocolVersion: sample.protocolVersion,
        startedAt: sample.at,
        requestCount: requests,
        errorCount: errors,
      })
      .onConflictDoUpdate({
        target: [schema.mcpSession.serverId, schema.mcpSession.externalId],
        set: {
          requestCount: sql`${schema.mcpSession.requestCount} + ${requests}`,
          errorCount: sql`${schema.mcpSession.errorCount} + ${errors}`,
          // Only fill identity in; a later request must not blank it out.
          clientName: sql`coalesce(${schema.mcpSession.clientName}, excluded.client_name)`,
          clientVersion: sql`coalesce(${schema.mcpSession.clientVersion}, excluded.client_version)`,
          protocolVersion: sql`coalesce(${schema.mcpSession.protocolVersion}, excluded.protocol_version)`,
        },
      })
      .returning({ id: schema.mcpSession.id });

    if (row) ids.set(key, row.id);
  }

  return ids;
}
