import {
  messagesFromSse,
  newTraceId,
  parseRequest,
  parseResponse,
  type Outcome,
  type ParsedRequest,
} from "./protocol";

/**
 * §20 — the gateway.
 *
 * Every MCP request enters here, is identified and authorised, is forwarded
 * to the deployed server, and is recorded on the way back. That last part is
 * the reason it exists: without a single path through, analytics, sessions
 * and error grouping have nothing to read, which is exactly the state MCPfy
 * was in before this.
 *
 * The design constraint that shapes everything: this sits on a customer's
 * production traffic. It must add as little latency as possible, must never
 * fail the request because recording failed, and must not become a place
 * where their users' data quietly accumulates.
 */

export interface Target {
  serverId: string;
  organizationId: string;
  environmentId: string | null;
  /** Where the deployed server actually listens. */
  endpointUrl: string;
  /** Headers MCPfy adds on the way upstream, e.g. an upstream auth token. */
  upstreamHeaders?: Record<string, string>;
}

export interface RequestRecord {
  organizationId: string;
  serverId: string;
  environmentId: string | null;
  sessionKey: string | null;
  traceId: string;
  requestId: string;
  method: string;
  outcome: Outcome;
  statusCode: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  errorCode: string | null;
  errorMessage: string | null;
  toolName: string | null;
  argumentKeys: string[];
  clientName: string | null;
  clientVersion: string | null;
  protocolVersion: string | null;
  at: Date;
}

/**
 * Where records go. Implemented over Drizzle by the app; a test passes an
 * array. Writes here must never be awaited on the request path.
 */
export interface GatewaySink {
  record(entry: RequestRecord): void;
}

export interface ProxyOptions {
  target: Target;
  sink: GatewaySink;
  /** Upstream timeout. A hung server must not hold a client socket forever. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Headers that belong to one hop and must not be forwarded. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/**
 * Headers carrying MCPfy's own credentials, which must never reach the
 * upstream server. The client authenticates to *MCPfy*; MCPfy authenticates
 * to the server separately. Forwarding the caller's API key upstream would
 * hand a customer's key to whatever their server's code does with headers.
 */
const STRIPPED = new Set(["authorization", "cookie", "x-mcpfy-key"]);

export async function proxy(
  request: Request,
  options: ProxyOptions,
): Promise<Response> {
  const { target, sink } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? 60_000;

  const traceId = newTraceId();
  const requestId = traceId.slice(0, 16);
  const startedAt = now();
  const at = new Date();

  const rawBody = await request.text();
  const requestBytes = new TextEncoder().encode(rawBody).length;

  let parsed: ParsedRequest;
  try {
    parsed = parseRequest(rawBody ? JSON.parse(rawBody) : null);
  } catch {
    parsed = parseRequest(null);
  }

  // The MCP session id is assigned by the upstream server and echoed by the
  // client, so it is the only stable thread through a conversation.
  const sessionKey =
    request.headers.get("mcp-session-id") ??
    request.headers.get("Mcp-Session-Id");

  const finish = (
    outcome: Outcome,
    statusCode: number,
    responseBytes: number,
    errorCode: string | null,
    errorMessage: string | null,
  ) => {
    // Recording is fire-and-forget by contract: a failure to write analytics
    // must never turn into a failed request for the customer.
    try {
      sink.record({
        organizationId: target.organizationId,
        serverId: target.serverId,
        environmentId: target.environmentId,
        sessionKey,
        traceId,
        requestId,
        method: parsed.method ?? "unknown",
        outcome,
        statusCode,
        durationMs: now() - startedAt,
        requestBytes,
        responseBytes,
        errorCode,
        errorMessage,
        toolName: parsed.toolName,
        argumentKeys: parsed.argumentKeys,
        clientName: parsed.clientName,
        clientVersion: parsed.clientVersion,
        protocolVersion: parsed.protocolVersion,
        at,
      });
    } catch {
      /* never surface a recording failure to the caller */
    }
  };

  const upstreamHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || STRIPPED.has(lower)) return;
    upstreamHeaders.set(key, value);
  });
  for (const [key, value] of Object.entries(target.upstreamHeaders ?? {})) {
    upstreamHeaders.set(key, value);
  }
  // Standard proxy provenance, plus our own id so a customer can correlate a
  // line in their logs with a row in ours.
  upstreamHeaders.set("x-mcpfy-request-id", requestId);
  upstreamHeaders.set("x-mcpfy-trace-id", traceId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let upstream: Response;
  try {
    upstream = await fetchImpl(target.endpointUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: rawBody || undefined,
      signal: controller.signal,
      redirect: "manual",
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = controller.signal.aborted;
    const message =
      error instanceof Error ? error.message : "The server could not be reached.";

    finish(
      aborted ? "timeout" : "error",
      502,
      0,
      aborted ? "upstream_timeout" : "upstream_unreachable",
      message,
    );

    return jsonRpcError(
      parsed.id,
      aborted ? -32001 : -32002,
      aborted
        ? `The server did not respond within ${Math.round(timeoutMs / 1000)}s.`
        : "The server could not be reached.",
      requestId,
      502,
    );
  }
  clearTimeout(timer);

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    responseHeaders.set(key, value);
  });
  responseHeaders.set("x-mcpfy-request-id", requestId);
  responseHeaders.set("x-mcpfy-trace-id", traceId);

  const contentType = upstream.headers.get("content-type") ?? "";
  const isStream = contentType.includes("text/event-stream");

  if (!isStream) {
    const text = await upstream.text();
    const responseBytes = new TextEncoder().encode(text).length;
    let outcome: Outcome = upstream.ok ? "ok" : "error";
    let errorCode: string | null = upstream.ok ? null : String(upstream.status);
    let errorMessage: string | null = null;

    if (text) {
      try {
        const result = parseResponse(JSON.parse(text));
        if (result.outcome !== "ok") {
          outcome = result.outcome;
          errorCode = result.errorCode ?? errorCode;
          errorMessage = result.errorMessage;
        }
      } catch {
        /* not JSON; the status code is all we know */
      }
    }

    if (upstream.status === 401 || upstream.status === 403) outcome = "unauthorized";
    if (upstream.status === 429) outcome = "rate_limited";

    finish(outcome, upstream.status, responseBytes, errorCode, errorMessage);

    return new Response(text || null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  /*
   * Streaming responses are passed straight through while a tee inspects
   * them. Buffering the stream to parse it first would defeat the point of
   * streaming — the client would wait for the whole answer before seeing any
   * of it, and MCPfy would have made every customer's server feel slower.
   */
  const [toClient, toRecorder] = (upstream.body ?? emptyStream()).tee();

  void (async () => {
    let seen = 0;
    let outcome: Outcome = upstream.ok ? "ok" : "error";
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      const reader = toRecorder.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        seen += value.byteLength;
        buffer += decoder.decode(value, { stream: true });
        // Keep only the trailing partial frame; parsed frames are discarded.
        const lastBreak = buffer.lastIndexOf("\n\n");
        if (lastBreak === -1) continue;
        for (const message of messagesFromSse(buffer.slice(0, lastBreak))) {
          const result = parseResponse(message);
          if (result.outcome !== "ok") {
            outcome = result.outcome;
            errorCode = result.errorCode;
            errorMessage = result.errorMessage;
          }
        }
        buffer = buffer.slice(lastBreak + 2);
      }
      for (const message of messagesFromSse(buffer)) {
        const result = parseResponse(message);
        if (result.outcome !== "ok") {
          outcome = result.outcome;
          errorCode = result.errorCode;
          errorMessage = result.errorMessage;
        }
      }
    } catch {
      outcome = "error";
      errorCode = "stream_interrupted";
    }

    finish(outcome, upstream.status, seen, errorCode, errorMessage);
  })();

  return new Response(toClient, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

/**
 * A gateway failure is reported in the protocol the caller is speaking, not
 * as an HTML error page an MCP client cannot read.
 */
export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  requestId: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message, data: { requestId } },
    }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "x-mcpfy-request-id": requestId,
        "cache-control": "no-store",
      },
    },
  );
}
