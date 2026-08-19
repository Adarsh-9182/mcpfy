import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped, type TenantContext } from "@mcpfy/db";
import { inspect } from "@mcpfy/inspector";
import { score, type Report } from "@mcpfy/readiness";

/**
 * §25/§44 — gathers everything the scorer needs and runs it.
 *
 * The registry supplies the schemas, the gateway supplies the behaviour, and
 * a live ping supplies connectivity. Scoring itself stays a pure function so
 * the rules can be tested without any of this.
 */
export async function readinessReport(
  ctx: TenantContext,
  serverId: string,
): Promise<Report> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [environments, tools, resources, prompts, traffic, totals] =
    await Promise.all([
      db()
        .select({ endpointUrl: schema.environment.endpointUrl })
        .from(schema.environment)
        .where(
          scoped(
            ctx,
            schema.environment,
            and(
              eq(schema.environment.serverId, serverId),
              eq(schema.environment.kind, "production"),
            ),
          ),
        )
        .limit(1),
      db()
        .select()
        .from(schema.tool)
        .where(
          scoped(
            ctx,
            schema.tool,
            and(eq(schema.tool.serverId, serverId), isNull(schema.tool.removedAt)),
          ),
        ),
      db()
        .select()
        .from(schema.resource)
        .where(scoped(ctx, schema.resource, eq(schema.resource.serverId, serverId))),
      db()
        .select()
        .from(schema.prompt)
        .where(scoped(ctx, schema.prompt, eq(schema.prompt.serverId, serverId))),
      db()
        .select({
          toolName: schema.toolCall.toolName,
          calls: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where ${schema.toolCall.outcome} <> 'ok')::int`,
          p95: sql<
            number | null
          >`percentile_disc(0.95) within group (order by ${schema.toolCall.durationMs})`,
        })
        .from(schema.toolCall)
        .where(
          scoped(
            ctx,
            schema.toolCall,
            and(
              eq(schema.toolCall.serverId, serverId),
              gte(schema.toolCall.at, since),
            ),
          ),
        )
        .groupBy(schema.toolCall.toolName),
      db()
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.requestLog)
        .where(
          scoped(
            ctx,
            schema.requestLog,
            and(
              eq(schema.requestLog.serverId, serverId),
              gte(schema.requestLog.at, since),
            ),
          ),
        ),
    ]);

  const endpointUrl = environments[0]?.endpointUrl ?? null;

  // One ping, not a capability sweep: the registry already holds the schemas,
  // so all this needs to establish is whether the server answers at all.
  const probe = endpointUrl
    ? await inspect({ endpointUrl, timeoutMs: 8_000 }, { method: "ping" })
    : null;

  return score({
    connectivity: {
      handshakeOk: probe?.ok ?? false,
      protocolVersion: probe?.protocolVersion ?? null,
      handshakeError: endpointUrl
        ? (probe?.error?.message ?? null)
        : "This server has no live endpoint yet.",
      unsupported: [],
    },
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
      annotations: t.annotations,
    })),
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
    prompts: prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
    traffic: traffic.map((t) => ({
      toolName: t.toolName,
      calls: Number(t.calls),
      errors: Number(t.errors),
      p95: t.p95 == null ? null : Math.round(Number(t.p95)),
    })),
    totalRequests: Number(totals[0]?.n ?? 0),
  });
}
