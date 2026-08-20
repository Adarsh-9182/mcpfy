/**
 * The recording that makes `mcpfy dev` an inspector rather than a proxy.
 *
 * Every JSON-RPC message crossing the dev proxy is kept in a ring buffer in
 * memory. Nothing is written to disk and nothing leaves the machine — this is
 * a developer's own server on their own laptop, and a dev tool that quietly
 * persisted request bodies would be a liability the first time someone typed a
 * real credential into a tool argument.
 *
 * Unlike the hosted gateway, argument *values* are kept. The tradeoff is
 * different here: the gateway records other people's traffic, where storing
 * values would mean storing their users' data; this records your own traffic,
 * where not storing values would make the inspector useless.
 */

export interface Frame {
  id: number;
  /** Which way it was going. */
  direction: "request" | "response";
  at: number;
  /** JSON-RPC method, or null for a response (which carries only an id). */
  method: string | null;
  /** JSON-RPC id, when the message has one. Notifications do not. */
  rpcId: string | number | null;
  /** Milliseconds from request to response. Only set on a response. */
  durationMs: number | null;
  /** True when the payload was a JSON-RPC error. */
  isError: boolean;
  payload: unknown;
}

const MAX_FRAMES = 500;

export class FrameLog {
  #frames: Frame[] = [];
  #nextId = 1;
  /** rpcId -> request timestamp, so a response can be timed against its call. */
  #pending = new Map<string, number>();
  #listeners = new Set<(frame: Frame) => void>();

  get frames(): readonly Frame[] {
    return this.#frames;
  }

  subscribe(listener: (frame: Frame) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    this.#frames = [];
    this.#pending.clear();
  }

  /**
   * Records one JSON-RPC message.
   *
   * A batch (a JSON array, which the protocol permits) is recorded as its
   * individual messages: an inspector showing one row for five calls is
   * hiding exactly the thing someone opened it to see.
   */
  record(direction: "request" | "response", payload: unknown): void {
    if (Array.isArray(payload)) {
      for (const item of payload) this.#one(direction, item);
      return;
    }
    this.#one(direction, payload);
  }

  #one(direction: "request" | "response", payload: unknown): void {
    const message = (payload ?? {}) as Record<string, unknown>;
    const rpcId =
      typeof message.id === "string" || typeof message.id === "number"
        ? (message.id as string | number)
        : null;
    const method = typeof message.method === "string" ? message.method : null;

    let durationMs: number | null = null;
    const key = rpcId === null ? null : String(rpcId);

    if (direction === "request" && key !== null) {
      this.#pending.set(key, Date.now());
    } else if (direction === "response" && key !== null) {
      const started = this.#pending.get(key);
      if (started !== undefined) {
        durationMs = Date.now() - started;
        this.#pending.delete(key);
      }
    }

    const frame: Frame = {
      id: this.#nextId++,
      direction,
      at: Date.now(),
      method,
      rpcId,
      durationMs,
      isError: message.error !== undefined,
      payload,
    };

    this.#frames.push(frame);
    // Ring buffer: a long dev session must not grow until the process dies.
    if (this.#frames.length > MAX_FRAMES) this.#frames.shift();

    for (const listener of this.#listeners) {
      // One bad subscriber must not take down the proxy.
      try {
        listener(frame);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Splits an SSE body into the JSON payloads it carries.
 *
 * Streamable HTTP replies with `text/event-stream` for anything that streams,
 * so a proxy that only parsed JSON bodies would record nothing at all for the
 * responses that matter most.
 */
export function parseSseData(chunk: string): unknown[] {
  const out: unknown[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* a partial frame across chunk boundaries — skip rather than crash */
    }
  }
  return out;
}
