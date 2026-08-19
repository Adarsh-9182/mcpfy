import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { handle, handleBody, toolsFor } from "./server";
import { CONTROL_TOOLS } from "./tools";
import type { Caller, Operations, Role } from "./types";

const caller = (role: Role = "developer"): Caller => ({
  organizationId: "org_1",
  organizationSlug: "acme",
  role,
});

function operations(over: Partial<Operations> = {}): Operations {
  const notCalled = async () => {
    throw new Error("should not have been called");
  };
  return {
    listServers: async () => ({ servers: [{ slug: "customer-mcp" }] }),
    getServer: async (_c, slug) => ({ slug }),
    listDeployments: async (_c, slug, limit) => ({ slug, limit }),
    getDeploymentLogs: async (_c, n, slug, tail) => ({ n, slug, tail }),
    getAnalytics: async (_c, slug, range) => ({ slug, range }),
    getReadiness: async (_c, slug) => ({ slug, score: 87 }),
    listServerTools: notCalled,
    deployServer: async (_c, slug) => ({ slug, deployment: 14 }),
    ...over,
  };
}

const call = (name: string, args: Record<string, unknown> = {}, role?: Role) =>
  handle(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    caller(role),
    operations(),
  );

describe("protocol", () => {
  test("initialize returns a dated protocol version and instructions", async () => {
    const res = await handle({ jsonrpc: "2.0", id: 0, method: "initialize" }, caller(), operations());
    const result = res!.result as {
      protocolVersion: string;
      serverInfo: { name: string };
      instructions: string;
    };
    assert.match(result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(result.serverInfo.name, "mcpfy-control");
    assert.ok(result.instructions.length > 40);
  });

  test("a notification gets no response", async () => {
    // Answering one is a protocol violation and confuses strict clients.
    const res = await handle(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      caller(),
      operations(),
    );
    assert.equal(res, null);
  });

  test("unimplemented capabilities answer empty rather than erroring", async () => {
    // A client that asks for resources and gets a hard error often abandons
    // the whole connection.
    for (const method of ["resources/list", "prompts/list"]) {
      const res = await handle({ jsonrpc: "2.0", id: 1, method }, caller(), operations());
      assert.ok(res!.result, method);
      assert.equal(res!.error, undefined, method);
    }
  });

  test("an unknown method is a proper JSON-RPC error", async () => {
    const res = await handle({ jsonrpc: "2.0", id: 1, method: "nope" }, caller(), operations());
    assert.equal(res!.error!.code, -32601);
  });

  test("a batch answers each message and drops notifications", async () => {
    const res = await handleBody(
      [
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ],
      caller(),
      operations(),
    );
    assert.equal((res as unknown[]).length, 2);
  });
});

describe("authorization", () => {
  test("a viewer is not shown tools it cannot call", async () => {
    // Listing a tool a caller cannot use invites it to try and fail.
    const names = toolsFor(caller("viewer")).map((t) => t.name);
    assert.equal(names.includes("deploy_server"), false);
    assert.ok(names.includes("list_servers"));
  });

  test("a developer sees the deploy tool", async () => {
    assert.ok(toolsFor(caller("developer")).map((t) => t.name).includes("deploy_server"));
  });

  test("guessing a hidden tool name does not get further than seeing it", async () => {
    const res = await call("deploy_server", { server: "customer-mcp" }, "viewer");
    assert.ok(res!.error, "expected an authorization error");
    assert.match(res!.error!.message, /developer/);
  });

  test("a viewer can still read", async () => {
    const res = await call("get_readiness", { server: "customer-mcp" }, "viewer");
    assert.equal(res!.error, undefined);
  });
});

describe("tool calls", () => {
  test("a result comes back as text and as structured content", async () => {
    const res = await call("get_readiness", { server: "customer-mcp" });
    const result = res!.result as {
      content: { text: string }[];
      structuredContent: { score: number };
    };
    assert.equal(result.structuredContent.score, 87);
    assert.match(result.content[0]!.text, /87/);
  });

  test("a missing required argument is an in-band tool error", async () => {
    // The call reached the tool; the caller needs to see why it refused,
    // not a protocol error suggesting the transport is broken.
    const res = await call("get_server", {});
    const result = res!.result as { isError: boolean; content: { text: string }[] };
    assert.equal(res!.error, undefined);
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /server/);
  });

  test("an operation that throws becomes a tool error, not a crash", async () => {
    const res = await handle(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_server", arguments: { server: "ghost" } },
      },
      caller(),
      operations({
        getServer: async () => {
          throw new Error("No such server.");
        },
      }),
    );
    const result = res!.result as { isError: boolean; content: { text: string }[] };
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /No such server/);
  });

  test("numeric arguments are clamped to their documented range", async () => {
    const res = await call("list_deployments", { server: "x", limit: 9999 });
    const result = res!.result as { structuredContent: { limit: number } };
    assert.equal(result.structuredContent.limit, 50);
  });

  test("an unparseable numeric argument falls back to the default", async () => {
    const res = await call("list_deployments", { server: "x", limit: "lots" });
    const result = res!.result as { structuredContent: { limit: number } };
    assert.equal(result.structuredContent.limit, 10);
  });

  test("an unknown tool name is rejected", async () => {
    const res = await call("drop_database", {});
    assert.ok(res!.error);
  });
});

describe("the control plane passes its own readiness rules", () => {
  test("every tool is described in more than a label", async () => {
    for (const tool of CONTROL_TOOLS) {
      assert.ok(tool.description.length >= 25, `${tool.name}: ${tool.description}`);
    }
  });

  test("every argument is described", async () => {
    for (const tool of CONTROL_TOOLS) {
      for (const [name, prop] of Object.entries(tool.inputSchema.properties)) {
        const description = (prop as { description?: string }).description;
        assert.ok(description, `${tool.name}.${name} has no description`);
      }
    }
  });

  test("tool names follow the convention the audit enforces", async () => {
    for (const tool of CONTROL_TOOLS) {
      assert.match(tool.name, /^[a-z][a-z0-9_]*$/, tool.name);
    }
  });

  test("no destructive tool is exposed at all", async () => {
    // §18: an agent must never have unrestricted destructive access. The
    // honest way to honour that in v1 is not to hand it the verbs.
    const destructive = /^(delete|remove|drop|destroy|purge|revoke|rotate)_/;
    for (const tool of CONTROL_TOOLS) {
      assert.equal(destructive.test(tool.name), false, tool.name);
    }
  });

  test("read-only tools say so, so clients can skip confirmation", async () => {
    const reads = CONTROL_TOOLS.filter((t) => t.name.startsWith("get_") || t.name.startsWith("list_"));
    for (const tool of reads) {
      assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    }
    const deploy = CONTROL_TOOLS.find((t) => t.name === "deploy_server")!;
    assert.equal(deploy.annotations?.readOnlyHint, false);
  });
});
