import "server-only";
import { and, eq, isNull, max, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import type {
  DeploymentStatus,
  DeploymentStore,
  DiscoveredPrompt,
  DiscoveredResource,
  DiscoveredTool,
  LogLine,
} from "@mcpfy/deployment";

/**
 * The orchestrator's DeploymentStore, backed by Drizzle.
 *
 * It is constructed per deployment and closes over the ids it is allowed to
 * touch, so nothing it writes can reach another tenant even though it runs
 * outside a request and therefore outside `scoped()`.
 */
export class DrizzleDeploymentStore implements DeploymentStore {
  private seq = 0;

  constructor(
    private readonly organizationId: string,
    private readonly deploymentId: string,
  ) {}

  async getStatus(deploymentId: string): Promise<DeploymentStatus | null> {
    const rows = await db()
      .select({ status: schema.deployment.status })
      .from(schema.deployment)
      .where(
        and(
          eq(schema.deployment.id, deploymentId),
          eq(schema.deployment.organizationId, this.organizationId),
        ),
      )
      .limit(1);
    return rows[0]?.status ?? null;
  }

  async setStatus(
    deploymentId: string,
    status: DeploymentStatus,
    patch: Parameters<DeploymentStore["setStatus"]>[2] = {},
  ): Promise<void> {
    await db()
      .update(schema.deployment)
      .set({
        status,
        ...(patch.endpointUrl !== undefined
          ? { endpointUrl: patch.endpointUrl }
          : {}),
        ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
        ...(patch.errorMessage !== undefined
          ? { errorMessage: patch.errorMessage }
          : {}),
        ...(patch.startedAt ? { startedAt: patch.startedAt } : {}),
        ...(patch.readyAt ? { readyAt: patch.readyAt } : {}),
        ...(patch.endedAt ? { endedAt: patch.endedAt } : {}),
      })
      .where(
        and(
          eq(schema.deployment.id, deploymentId),
          eq(schema.deployment.organizationId, this.organizationId),
        ),
      );
  }

  async appendLogs(deploymentId: string, lines: LogLine[]): Promise<void> {
    if (lines.length === 0) return;
    await db()
      .insert(schema.buildLog)
      .values(
        lines.map((line) => ({
          organizationId: this.organizationId,
          deploymentId,
          seq: this.seq++,
          stream: line.stream,
          // Postgres rejects NUL bytes in text; build output occasionally
          // carries them and would otherwise fail the whole batch.
          message: line.message.replace(/\0/g, "").slice(0, 8000),
        })),
      )
      .onConflictDoNothing();
  }

  async promoteEnvironment(
    environmentId: string,
    deploymentId: string,
    endpointUrl: string,
  ): Promise<void> {
    await db()
      .update(schema.environment)
      .set({ endpointUrl, currentDeploymentId: deploymentId })
      .where(
        and(
          eq(schema.environment.id, environmentId),
          eq(schema.environment.organizationId, this.organizationId),
        ),
      );
  }

  /**
   * Records what discovery found for tools, resources and prompts.
   *
   * Entries are upserted rather than deleted and reinserted: tool_call rows
   * reference tools by name for history, so a tool that disappears is marked
   * `removed_at` instead of being erased and old calls still resolve.
   */
  async replaceCapabilities(
    serverId: string,
    organizationId: string,
    found: {
      tools: DiscoveredTool[];
      resources: DiscoveredResource[];
      prompts: DiscoveredPrompt[];
    },
  ): Promise<void> {
    const now = new Date();

    if (found.tools.length > 0) {
      await db()
        .insert(schema.tool)
        .values(
          found.tools.map((tool) => ({
            organizationId,
            serverId,
            name: tool.name,
            title: tool.title ?? null,
            description: tool.description ?? null,
            inputSchema: tool.inputSchema ?? null,
            outputSchema: tool.outputSchema ?? null,
            removedAt: null,
          })),
        )
        .onConflictDoUpdate({
          target: [schema.tool.serverId, schema.tool.name],
          set: {
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            inputSchema: sql`excluded.input_schema`,
            outputSchema: sql`excluded.output_schema`,
            removedAt: null,
            updatedAt: now,
          },
        });
    }

    // Anything the server no longer advertises is marked removed. Use
    // notInArray rather than hand-written `<> all(...)`: the raw form does not
    // bind a JS array as a Postgres array, so it fails at execution time with
    // the whole discovery pass already done.
    const toolNames = found.tools.map((t) => t.name);
    await db()
      .update(schema.tool)
      .set({ removedAt: now })
      .where(
        and(
          eq(schema.tool.serverId, serverId),
          eq(schema.tool.organizationId, organizationId),
          isNull(schema.tool.removedAt),
          ...(toolNames.length > 0
            ? [notInArray(schema.tool.name, toolNames)]
            : []),
        ),
      );

    if (found.resources.length > 0) {
      await db()
        .insert(schema.resource)
        .values(
          found.resources.map((resource) => ({
            organizationId,
            serverId,
            uri: resource.uri,
            name: resource.name ?? null,
            description: resource.description ?? null,
            mimeType: resource.mimeType ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: [schema.resource.serverId, schema.resource.uri],
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            mimeType: sql`excluded.mime_type`,
            updatedAt: now,
          },
        });
    }

    // Resources and prompts carry no historical references, so entries that
    // vanish are deleted outright rather than tombstoned.
    const uris = found.resources.map((r) => r.uri);
    await db()
      .delete(schema.resource)
      .where(
        and(
          eq(schema.resource.serverId, serverId),
          eq(schema.resource.organizationId, organizationId),
          ...(uris.length > 0 ? [notInArray(schema.resource.uri, uris)] : []),
        ),
      );

    if (found.prompts.length > 0) {
      await db()
        .insert(schema.prompt)
        .values(
          found.prompts.map((prompt) => ({
            organizationId,
            serverId,
            name: prompt.name,
            description: prompt.description ?? null,
            arguments: prompt.arguments ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: [schema.prompt.serverId, schema.prompt.name],
          set: {
            description: sql`excluded.description`,
            arguments: sql`excluded.arguments`,
            updatedAt: now,
          },
        });
    }

    const promptNames = found.prompts.map((p) => p.name);
    await db()
      .delete(schema.prompt)
      .where(
        and(
          eq(schema.prompt.serverId, serverId),
          eq(schema.prompt.organizationId, organizationId),
          ...(promptNames.length > 0
            ? [notInArray(schema.prompt.name, promptNames)]
            : []),
        ),
      );
  }

  async setServerHealth(
    serverId: string,
    health: "healthy" | "degraded" | "unhealthy" | "unknown",
  ): Promise<void> {
    await db()
      .update(schema.server)
      .set({ health })
      .where(
        and(
          eq(schema.server.id, serverId),
          eq(schema.server.organizationId, this.organizationId),
        ),
      );
  }
}

/** Next deployment number for a server. Monotonic, per server. */
export async function nextDeploymentNumber(
  organizationId: string,
  serverId: string,
): Promise<number> {
  const rows = await db()
    .select({ highest: max(schema.deployment.number) })
    .from(schema.deployment)
    .where(
      and(
        eq(schema.deployment.serverId, serverId),
        eq(schema.deployment.organizationId, organizationId),
      ),
    );
  return (rows[0]?.highest ?? 0) + 1;
}
