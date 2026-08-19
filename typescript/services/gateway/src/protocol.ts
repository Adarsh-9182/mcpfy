/**
 * Just enough JSON-RPC to record what happened.
 *
 * The gateway does not interpret MCP semantics — it forwards bytes. But to
 * record a useful row it has to know which method was called, which tool, and
 * whether the answer was an error. Everything here is defensive: a malformed
 * body must produce a recorded request, not a crashed gateway.
 */

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export type Outcome = "ok" | "error" | "timeout" | "unauthorized" | "rate_limited";

export interface ParsedRequest {
  /** The JSON-RPC method, e.g. "tools/call". Null when the body is not JSON-RPC. */
  method: string | null;
  /** For tools/call, the tool being invoked. */
  toolName: string | null;
  /** For resources/read, the URI being read. */
  resourceUri: string | null;
  /** For prompts/get, the prompt name. */
  promptName: string | null;
  /**
   * Argument *keys* only — never values.
   *
   * The same guarantee mcpfy-pulse makes. A gateway sits on every request a
   * customer's agents make; storing argument values would mean storing their
   * users' data by default, which is not a decision a proxy gets to make on
   * their behalf.
   */
  argumentKeys: string[];
  /** Client identity from an initialize call, when this is one. */
  clientName: string | null;
  clientVersion: string | null;
  protocolVersion: string | null;
  id: string | number | null;
  isNotification: boolean;
}

export function parseRequest(body: unknown): ParsedRequest {
  const empty: ParsedRequest = {
    method: null,
    toolName: null,
    resourceUri: null,
    promptName: null,
    argumentKeys: [],
    clientName: null,
    clientVersion: null,
    protocolVersion: null,
    id: null,
    isNotification: false,
  };

  // Batches are legal JSON-RPC. Record the first entry rather than dropping
  // the whole request on the floor.
  const message = Array.isArray(body) ? body[0] : body;
  if (!message || typeof message !== "object") return empty;

  const rpc = message as JsonRpcRequest;
  const method = typeof rpc.method === "string" ? rpc.method : null;
  const params = (rpc.params ?? {}) as Record<string, unknown>;

  const args = params.arguments;
  const argumentKeys =
    args && typeof args === "object" && !Array.isArray(args)
      ? Object.keys(args as Record<string, unknown>)
      : [];

  const clientInfo = params.clientInfo as
    | { name?: unknown; version?: unknown }
    | undefined;

  return {
    method,
    toolName:
      method === "tools/call" && typeof params.name === "string"
        ? params.name
        : null,
    resourceUri:
      method === "resources/read" && typeof params.uri === "string"
        ? params.uri
        : null,
    promptName:
      method === "prompts/get" && typeof params.name === "string"
        ? params.name
        : null,
    argumentKeys,
    clientName: typeof clientInfo?.name === "string" ? clientInfo.name : null,
    clientVersion:
      typeof clientInfo?.version === "string" ? clientInfo.version : null,
    protocolVersion:
      typeof params.protocolVersion === "string" ? params.protocolVersion : null,
    id: rpc.id ?? null,
    // A notification has no id and expects no response.
    isNotification: method !== null && rpc.id === undefined,
  };
}

export interface ParsedResponse {
  outcome: Outcome;
  errorCode: string | null;
  errorMessage: string | null;
  /** True when a tools/call succeeded but the tool itself reported failure. */
  isToolError: boolean;
}

/**
 * Works out whether the answer was a success.
 *
 * MCP has two failure channels and they mean different things: a JSON-RPC
 * `error` means the call never reached the tool, while `result.isError` means
 * the tool ran and refused. Recording both as "error" would make a healthy
 * server with a picky tool look broken.
 */
export function parseResponse(body: unknown): ParsedResponse {
  const ok: ParsedResponse = {
    outcome: "ok",
    errorCode: null,
    errorMessage: null,
    isToolError: false,
  };

  const message = Array.isArray(body) ? body[0] : body;
  if (!message || typeof message !== "object") return ok;

  const rpc = message as {
    error?: { code?: unknown; message?: unknown };
    result?: { isError?: unknown; content?: unknown };
  };

  if (rpc.error) {
    return {
      outcome: "error",
      errorCode: rpc.error.code !== undefined ? String(rpc.error.code) : null,
      errorMessage:
        typeof rpc.error.message === "string" ? rpc.error.message : null,
      isToolError: false,
    };
  }

  if (rpc.result?.isError === true) {
    return {
      outcome: "error",
      errorCode: "tool_error",
      errorMessage: firstText(rpc.result.content),
      isToolError: true,
    };
  }

  return ok;
}

function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      return ((part as { text: string }).text).slice(0, 500);
    }
  }
  return null;
}

/**
 * Pulls JSON-RPC messages out of a Server-Sent Events body.
 *
 * Streamable HTTP answers with `text/event-stream`, so the response is not
 * JSON — it is one or more `data:` lines. Without this the gateway would
 * record every streaming response as unparseable and every outcome as "ok".
 */
export function messagesFromSse(text: string): unknown[] {
  const messages: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // A partial frame at the end of a chunk; the next read completes it.
    }
  }
  return messages;
}

/** 16 hex characters, the same shape OpenTelemetry uses for a trace id. */
export function newTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
