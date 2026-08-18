/**
 * Structural stand-in for the MCP SDK's Transport, matching the shape
 * `mcpfy-pulse` already uses. Kept local so this package does not care which
 * transport implementation it is handed.
 */
export interface MinimalTransport {
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: unknown, options?: unknown): Promise<void>;
  onmessage?: (message: unknown, extra?: unknown) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  sessionId?: string;
}

export type Direction = "outgoing" | "incoming";

export interface Frame {
  seq: number;
  direction: Direction;
  /** Milliseconds since the recording started. */
  at: number;
  /** JSON-RPC method for requests and notifications; absent on responses. */
  method?: string;
  /** JSON-RPC id, when the message carries one. */
  id?: string | number;
  message: unknown;
  bytes: number;
}

/**
 * Wraps a transport and records every JSON-RPC frame that crosses it.
 *
 * This is the deliberate opposite of `mcpfy-pulse`, which wraps the same seam
 * but never captures argument values or result content — because pulse ships
 * telemetry off the box. The Inspector records everything, because it is
 * showing a developer their own traffic, in their own session, at their own
 * request. Nothing recorded here is persisted or transmitted anywhere; it is
 * returned to the caller that asked for it and then discarded.
 */
export function recordTransport<T extends MinimalTransport>(
  transport: T,
): { transport: T; frames: Frame[] } {
  const frames: Frame[] = [];
  const startedAt = Date.now();
  let seq = 0;

  const record = (direction: Direction, message: unknown) => {
    let bytes = 0;
    try {
      bytes = Buffer.byteLength(JSON.stringify(message) ?? "");
    } catch {
      // A message that cannot be stringified is still worth recording;
      // its size just is not knowable.
    }
    const envelope = message as
      | { method?: unknown; id?: unknown }
      | null
      | undefined;

    frames.push({
      seq: seq++,
      direction,
      at: Date.now() - startedAt,
      method: typeof envelope?.method === "string" ? envelope.method : undefined,
      id:
        typeof envelope?.id === "string" || typeof envelope?.id === "number"
          ? envelope.id
          : undefined,
      message,
      bytes,
    });
  };

  const wrapped: MinimalTransport = {
    start: () => transport.start(),
    close: () => transport.close(),
    send: (message, options) => {
      record("outgoing", message);
      return transport.send(message, options);
    },
    get sessionId() {
      return transport.sessionId;
    },
    get onclose() {
      return transport.onclose;
    },
    set onclose(fn) {
      transport.onclose = fn;
    },
    get onerror() {
      return transport.onerror;
    },
    set onerror(fn) {
      transport.onerror = fn;
    },
    get onmessage() {
      return transport.onmessage;
    },
    set onmessage(handler) {
      transport.onmessage = (message, extra) => {
        record("incoming", message);
        handler?.(message, extra);
      };
    },
  };

  return { transport: wrapped as T, frames };
}

/**
 * Pairs each request with its response so the UI can show one exchange at a
 * time. Notifications have no response and are returned on their own.
 */
export interface Exchange {
  method: string;
  id?: string | number;
  request: Frame;
  response?: Frame;
  /** Round-trip time in milliseconds, when there was a response to wait for. */
  durationMs?: number;
}

export function pairFrames(frames: Frame[]): Exchange[] {
  const exchanges: Exchange[] = [];
  const pending = new Map<string | number, Exchange>();

  for (const frame of frames) {
    if (frame.direction === "outgoing" && frame.method) {
      const exchange: Exchange = {
        method: frame.method,
        id: frame.id,
        request: frame,
      };
      exchanges.push(exchange);
      if (frame.id !== undefined) pending.set(frame.id, exchange);
      continue;
    }

    if (frame.direction === "incoming" && frame.id !== undefined) {
      const exchange = pending.get(frame.id);
      if (exchange) {
        exchange.response = frame;
        exchange.durationMs = frame.at - exchange.request.at;
        pending.delete(frame.id);
        continue;
      }
    }

    // A server-initiated request or notification: no pairing to do.
    if (frame.direction === "incoming" && frame.method) {
      exchanges.push({ method: frame.method, id: frame.id, request: frame });
    }
  }

  return exchanges;
}
