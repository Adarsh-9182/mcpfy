import { MCPClient } from "mcpfy-sdk/client";
import { sleep } from "./ports";
import { DeploymentError, type DiscoveredTool, type LogSink } from "./types";

/**
 * §11 HEALTH_CHECK and §44 — a deployment is not live because a port is open.
 *
 * The check is a real MCP handshake through mcpfy-sdk's own client: connect,
 * initialize, and list tools. That is exactly what Claude or Cursor will do
 * moments later, so anything that fails here would have failed for a user.
 * Discovery comes free with it, which is what fills the tool registry (§14)
 * instead of asking developers to type their own schemas in.
 */

export interface HealthResult {
  ok: boolean;
  tools: DiscoveredTool[];
  latencyMs: number;
  checks: { name: string; ok: boolean; detail?: string }[];
}

export async function checkHealth(
  endpointUrl: string,
  log: LogSink,
  {
    attempts = 6,
    initialDelayMs = 400,
    signal,
    headers,
  }: {
    attempts?: number;
    initialDelayMs?: number;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<HealthResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    signal?.throwIfAborted();
    const startedAt = Date.now();

    const client = new MCPClient({
      mcpServers: { target: { url: endpointUrl, headers } },
    });

    try {
      log({
        stream: "system",
        message: `Health check ${attempt}/${attempts}: MCP handshake against ${endpointUrl}`,
      });

      const session = await client.createSession("target");
      const tools = await session.listTools();
      const latencyMs = Date.now() - startedAt;

      log({
        stream: "system",
        message: `Handshake succeeded in ${latencyMs}ms; ${tools.length} tool${tools.length === 1 ? "" : "s"} discovered.`,
      });

      await client.closeAllSessions().catch(() => {});

      return {
        ok: true,
        latencyMs,
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title ?? null,
          description: tool.description ?? null,
          inputSchema: (tool.inputSchema as Record<string, unknown>) ?? null,
          outputSchema: (tool.outputSchema as Record<string, unknown>) ?? null,
        })),
        checks: [
          { name: "Transport", ok: true },
          { name: "Protocol handshake", ok: true },
          { name: "Tool discovery", ok: true, detail: `${tools.length} tools` },
        ],
      };
    } catch (error) {
      lastError = error;
      await client.closeAllSessions().catch(() => {});

      const detail = error instanceof Error ? error.message : String(error);
      log({
        stream: "system",
        message: `Health check ${attempt}/${attempts} failed: ${detail}`,
      });

      if (attempt < attempts) {
        // Exponential backoff: a server that is still importing modules needs
        // longer than one that is already up.
        await sleep(initialDelayMs * 2 ** (attempt - 1), signal);
      }
    }
  }

  throw new DeploymentError(
    "health_check_failed",
    "The server started but did not complete an MCP handshake.",
    lastError instanceof Error ? lastError.message : String(lastError),
  );
}
