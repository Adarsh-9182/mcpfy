import { describe, expect, it } from "vitest";
import { FrameLog, parseSseData } from "../src/cli/frames.js";

describe("FrameLog", () => {
  it("times a response against the request that caused it", async () => {
    const log = new FrameLog();
    log.record("request", { jsonrpc: "2.0", id: 1, method: "tools/call" });
    await new Promise((r) => setTimeout(r, 12));
    log.record("response", { jsonrpc: "2.0", id: 1, result: {} });

    const [request, response] = log.frames;
    expect(request?.durationMs).toBeNull();
    expect(response?.durationMs).toBeGreaterThanOrEqual(10);
    expect(response?.method).toBeNull();
  });

  it("expands a batch into one frame per message", () => {
    // A batch shown as a single row hides exactly what the inspector is for.
    const log = new FrameLog();
    log.record("request", [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "resources/list" },
    ]);
    expect(log.frames).toHaveLength(2);
    expect(log.frames.map((f) => f.method)).toEqual(["tools/list", "resources/list"]);
  });

  it("marks JSON-RPC errors", () => {
    const log = new FrameLog();
    log.record("response", { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "nope" } });
    expect(log.frames[0]?.isError).toBe(true);
  });

  it("handles a notification, which carries no id", () => {
    const log = new FrameLog();
    log.record("request", { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(log.frames[0]?.rpcId).toBeNull();
    expect(log.frames[0]?.method).toBe("notifications/initialized");
  });

  it("does not pair responses across different ids", () => {
    const log = new FrameLog();
    log.record("request", { jsonrpc: "2.0", id: "a", method: "x" });
    log.record("response", { jsonrpc: "2.0", id: "b", result: {} });
    // No matching request, so no invented duration.
    expect(log.frames[1]?.durationMs).toBeNull();
  });

  it("bounds memory over a long session", () => {
    const log = new FrameLog();
    for (let i = 0; i < 700; i++) {
      log.record("request", { jsonrpc: "2.0", id: i, method: "ping" });
    }
    expect(log.frames.length).toBeLessThanOrEqual(500);
    // The ring keeps the newest, not the oldest.
    expect(log.frames.at(-1)?.rpcId).toBe(699);
  });

  it("notifies subscribers and survives one that throws", () => {
    const log = new FrameLog();
    const seen: number[] = [];
    log.subscribe(() => {
      throw new Error("a broken listener must not take down the proxy");
    });
    log.subscribe((frame) => seen.push(frame.id));
    log.record("request", { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(seen).toHaveLength(1);
  });

  it("unsubscribes cleanly", () => {
    const log = new FrameLog();
    const seen: number[] = [];
    const off = log.subscribe((f) => seen.push(f.id));
    log.record("request", { jsonrpc: "2.0", id: 1, method: "a" });
    off();
    log.record("request", { jsonrpc: "2.0", id: 2, method: "b" });
    expect(seen).toHaveLength(1);
  });

  it("tolerates a payload that is not an object", () => {
    const log = new FrameLog();
    expect(() => log.record("response", null)).not.toThrow();
    expect(() => log.record("response", "oops")).not.toThrow();
    expect(log.frames).toHaveLength(2);
  });
});

describe("parseSseData", () => {
  it("pulls the JSON payloads out of an event stream", () => {
    // Streamable HTTP replies with text/event-stream for anything streaming,
    // so a proxy that only parsed JSON bodies would record nothing at all.
    const chunk = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    expect(parseSseData(chunk)).toEqual([
      { jsonrpc: "2.0", id: 1, result: { ok: true } },
    ]);
  });

  it("reads several events from one chunk", () => {
    const chunk = 'data: {"id":1}\n\ndata: {"id":2}\n\n';
    expect(parseSseData(chunk)).toHaveLength(2);
  });

  it("skips keepalives, [DONE] and partial frames rather than throwing", () => {
    const chunk = ': keepalive\ndata: [DONE]\ndata: {"id":1,\n\ndata: {"id":2}\n\n';
    expect(parseSseData(chunk)).toEqual([{ id: 2 }]);
  });

  it("handles CRLF line endings", () => {
    expect(parseSseData('data: {"id":9}\r\n\r\n')).toEqual([{ id: 9 }]);
  });
});
