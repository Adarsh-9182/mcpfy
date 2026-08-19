import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped, STATUS_LABEL, type TenantContext } from "@mcpfy/db";
import type { Caller, Operations } from "@mcpfy/control-mcp";
import { startDeployment, DeployError } from "./deploy";
import { readinessReport } from "./readiness";
import {
  errorGroups,
  headline,
  parseRange,
  toolStats,
} from "./analytics";

/**
 * §28 — the control tools, implemented over MCPfy's own data.
 *
 * Every read goes through `scoped()`, exactly as the dashboard's do. An MCP
 * client holding an API key is just another caller; the fact that the request
 * arrived as JSON-RPC rather than as a page view changes nothing about which
 * rows it may see.
 */

function tenant(caller: Caller): TenantContext {
  return {
    organizationId: caller.organizationId,
    role: caller.role,
    apiKeyId: caller.apiKeyId,
  };
}

/** Resolves a slug to a server the caller owns, or explains that it does not. */
async function resolve(caller: Caller, slug: string) {
  const rows = await db()
    .select()
    .from(schema.server)
    .where(scoped(tenant(caller), schema.server, eq(schema.server.slug, slug)))
    .limit(1);

  if (!rows[0]) {
    // Names the alternatives rather than only refusing: an agent that gets a
    // bare "not found" usually guesses again, and guesses worse.
    const available = await db()
      .select({ slug: schema.server.slug })
      .from(schema.server)
      .where(scoped(tenant(caller), schema.server))
      .limit(20);
    throw new Error(
      `No server called "${slug}" in this organization.` +
        (available.length > 0
          ? ` Available: ${available.map((s) => s.slug).join(", ")}.`
          : " This organization has no servers yet."),
    );
  }

  return rows[0];
}

export const controlOperations: Operations = {
  async listServers(caller) {
    const rows = await db()
      .select({
        slug: schema.server.slug,
        name: schema.server.name,
        health: schema.server.health,
        healthCheckedAt: schema.server.healthCheckedAt,
        framework: schema.server.framework,
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
      .where(scoped(tenant(caller), schema.server))
      .orderBy(desc(schema.server.createdAt));

    return {
      organization: caller.organizationSlug,
      servers: rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        health: row.health,
        // Health without its timestamp is a claim with no expiry date.
        health_checked_at: row.healthCheckedAt?.toISOString() ?? null,
        framework: row.framework,
        deployed: Boolean(row.endpointUrl),
      })),
    };
  },

  async getServer(caller, slug) {
    const server = await resolve(caller, slug);

    const environments = await db()
      .select({
        name: schema.environment.name,
        endpointUrl: schema.environment.endpointUrl,
      })
      .from(schema.environment)
      .where(
        scoped(
          tenant(caller),
          schema.environment,
          eq(schema.environment.serverId, server.id),
        ),
      );

    return {
      slug: server.slug,
      name: server.name,
      health: server.health,
      health_detail: server.healthDetail,
      health_checked_at: server.healthCheckedAt?.toISOString() ?? null,
      framework: server.framework,
      runtime: server.runtime,
      transport: server.transport,
      build: {
        root_directory: server.rootDirectory,
        install_command: server.installCommand,
        build_command: server.buildCommand,
        start_command: server.startCommand,
      },
      gateway_url: `${appUrl()}/g/${caller.organizationSlug}/${server.slug}/mcp`,
      environments: environments.map((e) => ({
        name: e.name,
        endpoint: e.endpointUrl,
      })),
    };
  },

  async listDeployments(caller, slug, limit) {
    const server = await resolve(caller, slug);
    const rows = await db()
      .select()
      .from(schema.deployment)
      .where(
        scoped(
          tenant(caller),
          schema.deployment,
          eq(schema.deployment.serverId, server.id),
        ),
      )
      .orderBy(desc(schema.deployment.number))
      .limit(limit);

    return {
      server: slug,
      deployments: rows.map((d) => ({
        number: d.number,
        status: STATUS_LABEL[d.status],
        branch: d.branch,
        commit: d.commitSha?.slice(0, 7) ?? null,
        endpoint: d.endpointUrl,
        error_code: d.errorCode,
        error_message: d.errorMessage,
        created_at: d.createdAt.toISOString(),
        duration_seconds:
          d.endedAt && d.startedAt
            ? Math.round((d.endedAt.getTime() - d.startedAt.getTime()) / 1000)
            : null,
      })),
    };
  },

  async getDeploymentLogs(caller, deploymentNumber, slug, tail) {
    const server = await resolve(caller, slug);

    const rows = await db()
      .select({ id: schema.deployment.id, status: schema.deployment.status })
      .from(schema.deployment)
      .where(
        scoped(
          tenant(caller),
          schema.deployment,
          and(
            eq(schema.deployment.serverId, server.id),
            eq(schema.deployment.number, deploymentNumber),
          ),
        ),
      )
      .limit(1);

    const deployment = rows[0];
    if (!deployment) {
      throw new Error(
        `${slug} has no deployment #${deploymentNumber}. Use list_deployments to see which exist.`,
      );
    }

    const lines = await db()
      .select({
        seq: schema.buildLog.seq,
        stream: schema.buildLog.stream,
        message: schema.buildLog.message,
      })
      .from(schema.buildLog)
      .where(
        and(
          eq(schema.buildLog.organizationId, caller.organizationId),
          eq(schema.buildLog.deploymentId, deployment.id),
        ),
      )
      .orderBy(asc(schema.buildLog.seq));

    // Tail rather than head: the reason a build failed is at the end.
    const tailed = lines.slice(-tail);

    return {
      server: slug,
      deployment: deploymentNumber,
      status: STATUS_LABEL[deployment.status],
      truncated: lines.length > tailed.length,
      total_lines: lines.length,
      log: tailed.map((l) => `${l.stream === "stderr" ? "! " : "  "}${l.message}`),
    };
  },

  async getAnalytics(caller, slug, range) {
    const server = await resolve(caller, slug);
    const parsed = parseRange(range);

    const [stats, tools, errors] = await Promise.all([
      headline(tenant(caller), server.id, parsed),
      toolStats(tenant(caller), server.id, parsed),
      errorGroups(tenant(caller), server.id, parsed),
    ]);

    return {
      server: slug,
      range: parsed,
      requests: stats.requests,
      tool_calls: stats.toolCalls,
      errors: stats.errors,
      error_rate:
        stats.errorRate === null ? null : Number((stats.errorRate * 100).toFixed(2)),
      latency_ms: { p50: stats.p50, p95: stats.p95, p99: stats.p99 },
      tools: tools.map((t) => ({
        name: t.toolName,
        calls: t.calls,
        errors: t.errors,
        error_rate: Number((t.errorRate * 100).toFixed(1)),
        p95_ms: t.p95,
      })),
      error_groups: errors.map((e) => ({
        code: e.errorCode,
        count: e.count,
        sample: e.sample,
      })),
    };
  },

  async getReadiness(caller, slug) {
    const server = await resolve(caller, slug);
    const report = await readinessReport(tenant(caller), server.id);

    return {
      server: slug,
      score: report.score,
      grade: report.grade,
      behaviour_checks_skipped: report.behaviourSkipped,
      failing: report.checks
        .filter((c) => !c.passed)
        .map((c) => ({
          check: c.title,
          severity: c.severity,
          category: c.category,
          detail: c.detail,
          remedy: c.remedy,
          subjects: c.subjects,
        })),
      passing: report.checks.filter((c) => c.passed).map((c) => c.title),
    };
  },

  async listServerTools(caller, slug) {
    const server = await resolve(caller, slug);

    const [tools, resources, prompts] = await Promise.all([
      db()
        .select()
        .from(schema.tool)
        .where(
          scoped(
            tenant(caller),
            schema.tool,
            and(eq(schema.tool.serverId, server.id), isNull(schema.tool.removedAt)),
          ),
        )
        .orderBy(asc(schema.tool.name)),
      db()
        .select()
        .from(schema.resource)
        .where(
          scoped(tenant(caller), schema.resource, eq(schema.resource.serverId, server.id)),
        ),
      db()
        .select()
        .from(schema.prompt)
        .where(
          scoped(tenant(caller), schema.prompt, eq(schema.prompt.serverId, server.id)),
        ),
    ]);

    return {
      server: slug,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
        output_schema: t.outputSchema,
      })),
      resources: resources.map((r) => ({ uri: r.uri, name: r.name, mime_type: r.mimeType })),
      prompts: prompts.map((p) => ({ name: p.name, description: p.description })),
    };
  },

  async deployServer(caller, slug) {
    const server = await resolve(caller, slug);

    try {
      const started = await startDeployment(tenant(caller), {
        serverId: server.id,
        trigger: "api",
      });
      return {
        server: slug,
        deployment: started.number,
        status: "queued",
        next: `Follow it with get_deployment_logs(server: "${slug}", deployment: ${started.number}).`,
      };
    } catch (e) {
      if (e instanceof DeployError) throw new Error(e.message);
      throw e;
    }
  },
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
