import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  pairFrames,
  recordTransport,
  type Exchange,
  type Frame,
  type MinimalTransport,
} from "./recording-transport";

const CLIENT_INFO = { name: "mcpfy-inspector", version: "0.1.0" };

export type Transport = "streamable_http" | "sse" | "stdio";

export interface ConnectOptions {
  /** For HTTP transports. Ignored when `command` is given. */
  endpointUrl?: string;
  transport?: Transport;
  headers?: Record<string, string>;
  /** Sent as `Authorization: Bearer …`. Kept separate so it can be redacted. */
  bearerToken?: string;
  timeoutMs?: number;
  /**
   * Run a local server over stdio instead of connecting over HTTP.
   *
   * Most MCP servers people actually write are stdio — it is what Claude
   * Desktop's config expects — so an inspector that only speaks HTTP cannot
   * look at the majority of them.
   */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/** Anything the Inspector can ask a server to do. */
export type Operation =
  | { method: "tools/list" }
  | { method: "tools/call"; name: string; arguments?: Record<string, unknown> }
  | { method: "resources/list" }
  | { method: "resources/read"; uri: string }
  | { method: "prompts/list" }
  | { method: "prompts/get"; name: string; arguments?: Record<string, string> }
  | { method: "ping" };

export interface InspectResult {
  /**
   * Whether the *call* succeeded — connected, handshook, and got a response.
   *
   * A tool that runs and reports a failure is still `ok: true`; see
   * `isToolError`. Collapsing the two would tell a developer their transport
   * is broken when in fact their tool said no, which sends them debugging
   * entirely the wrong layer.
   */
  ok: boolean;
  /** The operation's result, exactly as the server returned it. */
  result?: unknown;
  /**
   * True when a tools/call returned `isError`. The call worked; the tool
   * reported a problem, and the message is inside `result.content`.
   */
  isToolError?: boolean;
  error?: { code?: number; message: string };
  /** Total wall time including connect and handshake. */
  totalMs: number;
  /** Time spent on the operation itself, excluding connect. */
  operationMs?: number;
  serverInfo?: { name?: string; version?: string; title?: string };
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  /** Every JSON-RPC frame, in order. */
  frames: Frame[];
  /** The same frames paired into request/response exchanges. */
  exchanges: Exchange[];
}

/**
 * §13 — connect, run one operation, record the whole exchange, disconnect.
 *
 * A session per operation rather than a pooled connection: the Inspector is
 * driven from stateless HTTP requests, and a connection that outlives the
 * request it was made for is a resource leak waiting for a page refresh. The
 * cost is one handshake per call, which the timings report separately so it
 * is never mistaken for the tool's own latency.
 */
export async function inspect(
  connect: ConnectOptions,
  operation: Operation,
): Promise<InspectResult> {
  const startedAt = Date.now();
  const timeoutMs = connect.timeoutMs ?? 30_000;

  const headers: Record<string, string> = { ...connect.headers };
  if (connect.bearerToken) {
    headers.Authorization = `Bearer ${connect.bearerToken}`;
  }

  const base = await createTransport(connect, headers);

  const { transport, frames } = recordTransport(
    base as unknown as MinimalTransport,
  );

  const client = new Client(CLIENT_INFO, { capabilities: {} });

  try {
    await withTimeout(
      client.connect(transport as never),
      timeoutMs,
      "The server did not complete the MCP handshake in time.",
    );

    const operationStartedAt = Date.now();
    const result = await withTimeout(
      run(client, operation),
      timeoutMs,
      "The operation timed out.",
    );
    const operationMs = Date.now() - operationStartedAt;

    const info = client.getServerVersion();

    return {
      ok: true,
      result,
      isToolError:
        operation.method === "tools/call" &&
        (result as { isError?: boolean } | undefined)?.isError === true,
      totalMs: Date.now() - startedAt,
      operationMs,
      serverInfo: info
        ? { name: info.name, version: info.version, title: info.title }
        : undefined,
      capabilities: client.getServerCapabilities() as
        | Record<string, unknown>
        | undefined,
      protocolVersion: protocolVersionFrom(frames),
      frames,
      exchanges: pairFrames(frames),
    };
  } catch (error) {
    const err = error as Error & { code?: number };
    return {
      ok: false,
      error: { code: err.code, message: err.message || String(error) },
      totalMs: Date.now() - startedAt,
      frames,
      exchanges: pairFrames(frames),
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function createTransport(
  connect: ConnectOptions,
  headers: Record<string, string>,
) {
  if (connect.command) {
    const { StdioClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/stdio.js"
    );
    return new StdioClientTransport({
      command: connect.command,
      args: connect.args ?? [],
      cwd: connect.cwd,
      // Inherit the caller's environment so a server can read the API keys it
      // needs, plus anything explicitly passed.
      env: { ...(process.env as Record<string, string>), ...(connect.env ?? {}) },
      stderr: "pipe",
    });
  }

  if (!connect.endpointUrl) {
    throw new Error("Give either an endpoint URL or a command to run.");
  }

  const url = new URL(connect.endpointUrl);
  return connect.transport === "sse"
    ? new SSEClientTransport(url, { requestInit: { headers } })
    : new StreamableHTTPClientTransport(url, { requestInit: { headers } });
}

function run(client: Client, operation: Operation): Promise<unknown> {
  switch (operation.method) {
    case "tools/list":
      return client.listTools();
    case "tools/call":
      return client.callTool({
        name: operation.name,
        arguments: operation.arguments ?? {},
      });
    case "resources/list":
      return client.listResources();
    case "resources/read":
      return client.readResource({ uri: operation.uri });
    case "prompts/list":
      return client.listPrompts();
    case "prompts/get":
      return client.getPrompt({
        name: operation.name,
        arguments: operation.arguments ?? {},
      });
    case "ping":
      return client.ping();
  }
}

/** Reads the negotiated protocol version out of the recorded handshake. */
function protocolVersionFrom(frames: Frame[]): string | undefined {
  for (const frame of frames) {
    if (frame.direction !== "incoming") continue;
    const result = (frame.message as { result?: { protocolVersion?: unknown } })
      ?.result;
    if (typeof result?.protocolVersion === "string") {
      return result.protocolVersion;
    }
  }
  return undefined;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * A full capability sweep: tools, resources and prompts in one connection.
 *
 * Used by discovery after a deployment goes healthy, and by the Inspector's
 * refresh button. Servers that do not implement a capability answer with a
 * method-not-found error rather than an empty list, so each is caught
 * individually — one unsupported capability must not blank out the others.
 */
export interface Capabilities {
  tools: unknown[];
  resources: unknown[];
  prompts: unknown[];
  unsupported: string[];
}

export async function listCapabilities(
  connect: ConnectOptions,
): Promise<{ result: Capabilities; info: InspectResult }> {
  const [tools, resources, prompts] = await Promise.all([
    inspect(connect, { method: "tools/list" }),
    inspect(connect, { method: "resources/list" }),
    inspect(connect, { method: "prompts/list" }),
  ]);

  const unsupported: string[] = [];
  const pick = (r: InspectResult, key: string, method: string): unknown[] => {
    if (!r.ok) {
      unsupported.push(method);
      return [];
    }
    const value = (r.result as Record<string, unknown> | undefined)?.[key];
    return Array.isArray(value) ? value : [];
  };

  return {
    result: {
      tools: pick(tools, "tools", "tools/list"),
      resources: pick(resources, "resources", "resources/list"),
      prompts: pick(prompts, "prompts", "prompts/list"),
      unsupported,
    },
    info: tools,
  };
}
