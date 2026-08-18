import { listCapabilities } from "@mcpfy/inspector";
import { sleep } from "./ports";
import {
  DeploymentError,
  type DiscoveredPrompt,
  type DiscoveredResource,
  type DiscoveredTool,
  type LogSink,
} from "./types";

/**
 * §11 HEALTH_CHECK and §44 — a deployment is not live because a port is open.
 *
 * The check is a real MCP handshake followed by a capability sweep, run
 * through the same client the Inspector uses. That matters twice over: it is
 * exactly what Claude or Cursor will do moments later, and it means the health
 * check and the Inspector can never disagree about whether a server works.
 *
 * Discovery falls out of the sweep, which is what fills the tool, resource and
 * prompt registries (§13, §14) instead of asking developers to retype their
 * own schemas.
 */

export interface HealthResult {
  ok: boolean;
  tools: DiscoveredTool[];
  resources: DiscoveredResource[];
  prompts: DiscoveredPrompt[];
  latencyMs: number;
  serverInfo?: { name?: string; version?: string };
  protocolVersion?: string;
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
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    signal?.throwIfAborted();

    log({
      stream: "system",
      message: `Health check ${attempt}/${attempts}: MCP handshake against ${endpointUrl}`,
    });

    const { result, info } = await listCapabilities({ endpointUrl, headers });

    if (info.ok) {
      log({
        stream: "system",
        message:
          `Handshake succeeded in ${info.operationMs ?? info.totalMs}ms ` +
          `(${info.protocolVersion ?? "unknown protocol"}); ` +
          `${result.tools.length} tool${result.tools.length === 1 ? "" : "s"}, ` +
          `${result.resources.length} resource${result.resources.length === 1 ? "" : "s"}, ` +
          `${result.prompts.length} prompt${result.prompts.length === 1 ? "" : "s"}.`,
      });

      if (result.unsupported.length > 0) {
        // Not a failure: plenty of servers expose tools and nothing else.
        log({
          stream: "system",
          message: `Not implemented by this server: ${result.unsupported.join(", ")}.`,
        });
      }

      return {
        ok: true,
        latencyMs: info.operationMs ?? info.totalMs,
        serverInfo: info.serverInfo,
        protocolVersion: info.protocolVersion,
        tools: result.tools.map(toTool),
        resources: result.resources.map(toResource),
        prompts: result.prompts.map(toPrompt),
        checks: [
          { name: "Transport", ok: true },
          { name: "Protocol handshake", ok: true, detail: info.protocolVersion },
          { name: "Tool discovery", ok: true, detail: `${result.tools.length} tools` },
        ],
      };
    }

    lastError = info.error?.message ?? "unknown error";
    log({
      stream: "system",
      message: `Health check ${attempt}/${attempts} failed: ${lastError}`,
    });

    if (attempt < attempts) {
      // Exponential backoff: a server still importing modules needs longer
      // than one that is already up.
      await sleep(initialDelayMs * 2 ** (attempt - 1), signal);
    }
  }

  throw new DeploymentError(
    "health_check_failed",
    "The server started but did not complete an MCP handshake.",
    lastError,
  );
}

function toTool(raw: unknown): DiscoveredTool {
  const t = raw as Record<string, unknown>;
  return {
    name: String(t.name ?? ""),
    title: typeof t.title === "string" ? t.title : null,
    description: typeof t.description === "string" ? t.description : null,
    inputSchema: (t.inputSchema as Record<string, unknown>) ?? null,
    outputSchema: (t.outputSchema as Record<string, unknown>) ?? null,
  };
}

function toResource(raw: unknown): DiscoveredResource {
  const r = raw as Record<string, unknown>;
  return {
    uri: String(r.uri ?? ""),
    name: typeof r.name === "string" ? r.name : null,
    description: typeof r.description === "string" ? r.description : null,
    mimeType: typeof r.mimeType === "string" ? r.mimeType : null,
  };
}

function toPrompt(raw: unknown): DiscoveredPrompt {
  const p = raw as Record<string, unknown>;
  return {
    name: String(p.name ?? ""),
    description: typeof p.description === "string" ? p.description : null,
    arguments: Array.isArray(p.arguments)
      ? (p.arguments as Record<string, unknown>[])
      : null,
  };
}
