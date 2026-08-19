import { inspect, type ConnectOptions } from "@mcpfy/inspector";
import { score, type Report } from "@mcpfy/readiness";

export type { Report };

export interface AuditTarget {
  /** An MCP endpoint, e.g. https://example.com/mcp */
  url?: string;
  /** Or a command to run the server over stdio, e.g. "node dist/server.js". */
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  bearerToken?: string;
  timeoutMs?: number;
}

/**
 * Audits any MCP server.
 *
 * Deliberately account-free: it connects, reads what the server advertises,
 * and scores it. Nothing is uploaded and nothing is stored — the report is
 * printed and forgotten.
 *
 * Behaviour checks are skipped here by construction. Whether a tool actually
 * succeeds in production is not knowable from a single handshake, and the
 * scorer is explicit about that rather than guessing.
 */
export async function audit(target: AuditTarget): Promise<Report> {
  const connect: ConnectOptions = {
    endpointUrl: target.url,
    command: target.command,
    args: target.args,
    headers: target.headers,
    bearerToken: target.bearerToken,
    timeoutMs: target.timeoutMs ?? 20_000,
  };

  const tools = await inspect(connect, { method: "tools/list" });

  if (!tools.ok) {
    return score({
      connectivity: {
        handshakeOk: false,
        handshakeError: tools.error?.message ?? "The server did not respond.",
        unsupported: [],
      },
      tools: [],
      resources: [],
      prompts: [],
      traffic: [],
      totalRequests: 0,
    });
  }

  // Resources and prompts are optional in MCP. A server that does not
  // implement them answers with an error, which is not a failure — so each is
  // fetched separately and an error means "not offered", not "broken".
  const [resources, prompts] = await Promise.all([
    inspect(connect, { method: "resources/list" }),
    inspect(connect, { method: "prompts/list" }),
  ]);

  const unsupported: string[] = [];
  if (!resources.ok) unsupported.push("resources/list");
  if (!prompts.ok) unsupported.push("prompts/list");

  return score({
    connectivity: {
      handshakeOk: true,
      protocolVersion: tools.protocolVersion,
      unsupported,
    },
    tools: list(tools.result, "tools").map((t) => ({
      name: str(t.name),
      title: opt(t.title),
      description: opt(t.description),
      inputSchema: obj(t.inputSchema),
      outputSchema: obj(t.outputSchema),
      annotations: obj(t.annotations),
    })),
    resources: list(resources.result, "resources").map((r) => ({
      uri: str(r.uri),
      name: opt(r.name),
      description: opt(r.description),
      mimeType: opt(r.mimeType),
    })),
    prompts: list(prompts.result, "prompts").map((p) => ({
      name: str(p.name),
      description: opt(p.description),
      arguments: Array.isArray(p.arguments)
        ? (p.arguments as Record<string, unknown>[])
        : null,
    })),
    traffic: [],
    totalRequests: 0,
  });
}

/** Server info, for the report header. */
export async function identify(
  target: AuditTarget,
): Promise<{ name?: string; version?: string; protocolVersion?: string } | null> {
  const probe = await inspect(
    {
      endpointUrl: target.url,
      command: target.command,
      args: target.args,
      headers: target.headers,
      bearerToken: target.bearerToken,
      timeoutMs: target.timeoutMs ?? 20_000,
    },
    { method: "ping" },
  );
  if (!probe.ok) return null;
  return {
    name: probe.serverInfo?.name,
    version: probe.serverInfo?.version,
    protocolVersion: probe.protocolVersion,
  };
}

function list(result: unknown, key: string): Record<string, unknown>[] {
  const value = (result as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const opt = (v: unknown): string | null => (typeof v === "string" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;
