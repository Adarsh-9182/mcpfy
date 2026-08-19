import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { proxy, type GatewaySink, type RequestRecord, type Target } from "./proxy";
import { messagesFromSse, parseRequest, parseResponse } from "./protocol";

/* ------------------------------------------------------------- test doubles */

class ArraySink implements GatewaySink {
  readonly entries: RequestRecord[] = [];
  record(entry: RequestRecord) {
    this.entries.push(entry);
  }
}

const target: Target = {
  serverId: "srv_1",
  organizationId: "org_1",
  environmentId: "env_1",
  endpointUrl: "http://upstream.test/mcp",
};

function gatewayRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://mcpfy.test/g/acme/customer-mcp/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** A fetch that answers with JSON and remembers what it was called with. */
function jsonUpstream(body: unknown, status = 200) {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const CALL_ADD = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "add", arguments: { a: 2, b: 40 } },
};

/* -------------------------------------------------------------------- tests */

describe("forwarding", () => {
  test("passes the body through and returns the upstream response", async () => {
    const sink = new ArraySink();
    const upstream = jsonUpstream({ jsonrpc: "2.0", id: 1, result: { sum: 42 } });

    const response = await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink,
      fetchImpl: upstream.impl,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      jsonrpc: "2.0",
      id: 1,
      result: { sum: 42 },
    });
    assert.equal(upstream.calls[0]!.url, "http://upstream.test/mcp");
    assert.deepEqual(JSON.parse(upstream.calls[0]!.body), CALL_ADD);
  });

  test("never forwards the caller's credentials upstream", async () => {
    // The client authenticates to MCPfy; MCPfy authenticates to the server.
    // Passing the caller's key through would hand a customer's MCPfy
    // credential to whatever their server does with headers.
    const sink = new ArraySink();
    const upstream = jsonUpstream({ jsonrpc: "2.0", id: 1, result: {} });

    await proxy(
      gatewayRequest(CALL_ADD, {
        authorization: "Bearer mcpfy_live_secret",
        cookie: "session=abc",
      }),
      { target, sink, fetchImpl: upstream.impl },
    );

    const sent = upstream.calls[0]!.headers;
    assert.equal(sent.get("authorization"), null);
    assert.equal(sent.get("cookie"), null);
  });

  test("adds its own upstream credentials", async () => {
    const sink = new ArraySink();
    const upstream = jsonUpstream({ jsonrpc: "2.0", id: 1, result: {} });

    await proxy(gatewayRequest(CALL_ADD), {
      target: { ...target, upstreamHeaders: { authorization: "Bearer upstream" } },
      sink,
      fetchImpl: upstream.impl,
    });

    assert.equal(upstream.calls[0]!.headers.get("authorization"), "Bearer upstream");
  });

  test("stamps a request id the customer can correlate on", async () => {
    const sink = new ArraySink();
    const upstream = jsonUpstream({ jsonrpc: "2.0", id: 1, result: {} });

    const response = await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink,
      fetchImpl: upstream.impl,
    });

    const id = response.headers.get("x-mcpfy-request-id");
    assert.ok(id);
    assert.equal(upstream.calls[0]!.headers.get("x-mcpfy-request-id"), id);
    assert.equal(sink.entries[0]!.requestId, id);
  });
});

describe("recording", () => {
  test("records the method, tool and argument keys", async () => {
    const sink = new ArraySink();
    await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink,
      fetchImpl: jsonUpstream({ jsonrpc: "2.0", id: 1, result: {} }).impl,
    });

    const entry = sink.entries[0]!;
    assert.equal(entry.method, "tools/call");
    assert.equal(entry.toolName, "add");
    assert.deepEqual(entry.argumentKeys, ["a", "b"]);
    assert.equal(entry.outcome, "ok");
  });

  test("never records argument values", async () => {
    // The single most important property of this class. A gateway sits on
    // every request a customer's agents make; storing values would mean
    // storing their users' data by default.
    const sink = new ArraySink();
    await proxy(
      gatewayRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "create_customer",
          arguments: { email: "someone@private.example", ssn: "111-22-3333" },
        },
      }),
      { target, sink, fetchImpl: jsonUpstream({ result: {} }).impl },
    );

    const serialised = JSON.stringify(sink.entries[0]);
    assert.equal(serialised.includes("private.example"), false);
    assert.equal(serialised.includes("111-22-3333"), false);
    assert.deepEqual(sink.entries[0]!.argumentKeys, ["email", "ssn"]);
  });

  test("captures client identity from the handshake", async () => {
    const sink = new ArraySink();
    await proxy(
      gatewayRequest({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          clientInfo: { name: "claude-desktop", version: "1.4.0" },
        },
      }),
      { target, sink, fetchImpl: jsonUpstream({ result: {} }).impl },
    );

    const entry = sink.entries[0]!;
    assert.equal(entry.clientName, "claude-desktop");
    assert.equal(entry.clientVersion, "1.4.0");
    assert.equal(entry.protocolVersion, "2025-06-18");
  });

  test("threads the MCP session id through", async () => {
    const sink = new ArraySink();
    await proxy(gatewayRequest(CALL_ADD, { "mcp-session-id": "sess_abc" }), {
      target,
      sink,
      fetchImpl: jsonUpstream({ result: {} }).impl,
    });
    assert.equal(sink.entries[0]!.sessionKey, "sess_abc");
  });

  test("a malformed body is still recorded", async () => {
    const sink = new ArraySink();
    const request = new Request("https://mcpfy.test/g/a/b/mcp", {
      method: "POST",
      body: "{not json",
    });

    await proxy(request, {
      target,
      sink,
      fetchImpl: jsonUpstream({ result: {} }).impl,
    });

    assert.equal(sink.entries.length, 1);
    assert.equal(sink.entries[0]!.method, "unknown");
  });

  test("a sink that throws does not fail the request", async () => {
    const exploding: GatewaySink = {
      record() {
        throw new Error("analytics is down");
      },
    };

    const response = await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink: exploding,
      fetchImpl: jsonUpstream({ jsonrpc: "2.0", id: 1, result: {} }).impl,
    });

    assert.equal(response.status, 200);
  });
});

describe("failure classification", () => {
  test("separates a tool error from a protocol error", async () => {
    // These mean different things: one means the call never reached the tool,
    // the other means the tool ran and refused. Recording both as "error"
    // makes a healthy server with a picky tool look broken.
    const protocolError = new ArraySink();
    await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink: protocolError,
      fetchImpl: jsonUpstream({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "Method not found" },
      }).impl,
    });

    const toolError = new ArraySink();
    await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink: toolError,
      fetchImpl: jsonUpstream({
        jsonrpc: "2.0",
        id: 1,
        result: { isError: true, content: [{ type: "text", text: "not found" }] },
      }).impl,
    });

    assert.equal(protocolError.entries[0]!.errorCode, "-32601");
    assert.equal(toolError.entries[0]!.errorCode, "tool_error");
    assert.match(String(toolError.entries[0]!.errorMessage), /not found/);
  });

  test("an unreachable server becomes a JSON-RPC error, not an HTML page", async () => {
    // An MCP client cannot read an HTML error page. Answering in the protocol
    // the caller is speaking is the difference between a usable error and a
    // parse failure on their side.
    const sink = new ArraySink();
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const response = await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink,
      fetchImpl: failing,
    });

    assert.equal(response.status, 502);
    const body = (await response.json()) as { error: { code: number }; id: number };
    assert.equal(body.id, 1);
    assert.equal(body.error.code, -32002);
    assert.equal(sink.entries[0]!.outcome, "error");
    assert.equal(sink.entries[0]!.errorCode, "upstream_unreachable");
  });

  test("classifies auth and rate-limit responses distinctly", async () => {
    for (const [status, expected] of [
      [401, "unauthorized"],
      [429, "rate_limited"],
      [500, "error"],
    ] as const) {
      const sink = new ArraySink();
      await proxy(gatewayRequest(CALL_ADD), {
        target,
        sink,
        fetchImpl: jsonUpstream({}, status).impl,
      });
      assert.equal(sink.entries[0]!.outcome, expected, `status ${status}`);
    }
  });
});

describe("streaming", () => {
  test("passes an SSE body through and still classifies it", async () => {
    const sink = new ArraySink();
    const sse =
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"isError":true,' +
      '"content":[{"type":"text","text":"boom"}]}}\n\n';

    const streaming = (async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as unknown as typeof fetch;

    const response = await proxy(gatewayRequest(CALL_ADD), {
      target,
      sink,
      fetchImpl: streaming,
    });

    assert.equal(await response.text(), sse);

    // The recorder runs behind the tee, so give it a turn to drain.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sink.entries[0]!.outcome, "error");
    assert.equal(sink.entries[0]!.errorCode, "tool_error");
  });
});

describe("protocol parsing", () => {
  test("reads messages out of an SSE frame", () => {
    const messages = messagesFromSse(
      'event: message\ndata: {"a":1}\n\nevent: message\ndata: {"b":2}\n\n',
    );
    assert.deepEqual(messages, [{ a: 1 }, { b: 2 }]);
  });

  test("ignores a partial trailing frame instead of throwing", () => {
    assert.deepEqual(messagesFromSse('data: {"a":1}\n\ndata: {"b":'), [{ a: 1 }]);
  });

  test("records the first message of a batch rather than dropping it", () => {
    const parsed = parseRequest([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ]);
    assert.equal(parsed.method, "tools/list");
  });

  test("a notification is recognised by having no id", () => {
    assert.equal(
      parseRequest({ jsonrpc: "2.0", method: "notifications/initialized" })
        .isNotification,
      true,
    );
    assert.equal(
      parseRequest({ jsonrpc: "2.0", id: 1, method: "ping" }).isNotification,
      false,
    );
  });

  test("a plain result is ok", () => {
    assert.equal(parseResponse({ jsonrpc: "2.0", id: 1, result: {} }).outcome, "ok");
  });
});
