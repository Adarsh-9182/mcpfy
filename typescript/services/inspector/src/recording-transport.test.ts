import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pairFrames, recordTransport, type Frame, type MinimalTransport } from "./recording-transport";

/** A transport that does nothing but let us drive both directions by hand. */
function fakeTransport() {
  const sent: unknown[] = [];
  const transport: MinimalTransport = {
    async start() {},
    async close() {},
    async send(message) {
      sent.push(message);
    },
  };
  return { transport, sent };
}

const frame = (over: Partial<Frame>): Frame => ({
  seq: 0,
  direction: "outgoing",
  at: 0,
  message: {},
  bytes: 0,
  ...over,
});

describe("recording transport", () => {
  test("records both directions and still delivers the message", async () => {
    const fake = fakeTransport();
    const { transport, frames } = recordTransport(fake.transport);

    const received: unknown[] = [];
    transport.onmessage = (m) => received.push(m);

    await transport.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    transport.onmessage?.({ jsonrpc: "2.0", id: 1, result: { tools: [] } });

    // The wrapper must be transparent: the real transport still sent it, and
    // the caller's handler still ran.
    assert.equal(fake.sent.length, 1);
    assert.equal(received.length, 1);

    assert.equal(frames.length, 2);
    assert.equal(frames[0]!.direction, "outgoing");
    assert.equal(frames[0]!.method, "tools/list");
    assert.equal(frames[1]!.direction, "incoming");
    assert.equal(frames[1]!.id, 1);
  });

  test("measures each frame's size", async () => {
    const { transport, frames } = recordTransport(fakeTransport().transport);
    await transport.send({ jsonrpc: "2.0", id: 1, method: "ping" });
    assert.ok(frames[0]!.bytes > 0);
  });

  test("survives a message that cannot be stringified", async () => {
    const { transport, frames } = recordTransport(fakeTransport().transport);
    const circular: Record<string, unknown> = { method: "weird" };
    circular.self = circular;

    await transport.send(circular);

    assert.equal(frames.length, 1);
    assert.equal(frames[0]!.method, "weird");
    assert.equal(frames[0]!.bytes, 0);
  });

  test("setting onmessage later still records", async () => {
    // The SDK assigns onmessage during connect, after the wrapper is built.
    const { transport, frames } = recordTransport(fakeTransport().transport);
    transport.onmessage = () => {};
    transport.onmessage?.({ jsonrpc: "2.0", id: 7, result: {} });
    assert.equal(frames.length, 1);
  });
});

describe("pairing frames into exchanges", () => {
  test("matches a response to its request by id", () => {
    const exchanges = pairFrames([
      frame({ seq: 0, direction: "outgoing", at: 0, method: "tools/list", id: 1 }),
      frame({ seq: 1, direction: "incoming", at: 12, id: 1 }),
    ]);

    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]!.method, "tools/list");
    assert.equal(exchanges[0]!.durationMs, 12);
  });

  test("pairs correctly when responses arrive out of order", () => {
    // JSON-RPC does not promise ordering, so matching by position would pin
    // the wrong duration onto the wrong call.
    const exchanges = pairFrames([
      frame({ seq: 0, direction: "outgoing", at: 0, method: "slow", id: 1 }),
      frame({ seq: 1, direction: "outgoing", at: 1, method: "fast", id: 2 }),
      frame({ seq: 2, direction: "incoming", at: 5, id: 2 }),
      frame({ seq: 3, direction: "incoming", at: 90, id: 1 }),
    ]);

    const slow = exchanges.find((e) => e.method === "slow")!;
    const fast = exchanges.find((e) => e.method === "fast")!;
    assert.equal(slow.durationMs, 90);
    assert.equal(fast.durationMs, 4);
  });

  test("notifications appear with no response and no duration", () => {
    const exchanges = pairFrames([
      frame({ seq: 0, direction: "outgoing", at: 0, method: "notifications/initialized" }),
    ]);
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]!.response, undefined);
    assert.equal(exchanges[0]!.durationMs, undefined);
  });

  test("an unanswered request is still shown", () => {
    // A timed-out call must not vanish from the protocol view — that is
    // precisely the exchange the developer is looking for.
    const exchanges = pairFrames([
      frame({ seq: 0, direction: "outgoing", at: 0, method: "tools/call", id: 1 }),
    ]);
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]!.response, undefined);
  });

  test("server-initiated requests are recorded too", () => {
    const exchanges = pairFrames([
      frame({ seq: 0, direction: "incoming", at: 3, method: "roots/list", id: 99 }),
    ]);
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]!.method, "roots/list");
  });

  test("keeps the full handshake in order", () => {
    const exchanges = pairFrames([
      frame({ seq: 0, direction: "outgoing", at: 0, method: "initialize", id: 0 }),
      frame({ seq: 1, direction: "incoming", at: 26, id: 0 }),
      frame({ seq: 2, direction: "outgoing", at: 27, method: "notifications/initialized" }),
      frame({ seq: 3, direction: "outgoing", at: 28, method: "tools/list", id: 1 }),
      frame({ seq: 4, direction: "incoming", at: 31, id: 1 }),
    ]);

    assert.deepEqual(
      exchanges.map((e) => e.method),
      ["initialize", "notifications/initialized", "tools/list"],
    );
  });
});
