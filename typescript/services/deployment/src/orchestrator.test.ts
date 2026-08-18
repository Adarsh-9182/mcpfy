import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Orchestrator } from "./orchestrator";
import {
  DeploymentError,
  type DeploymentSpec,
  type DeploymentStatus,
  type DeploymentStore,
  type DiscoveredTool,
  type LogLine,
  type RuntimeAdapter,
} from "./types";

/* ------------------------------------------------------------- test doubles */

class MemoryStore implements DeploymentStore {
  status: DeploymentStatus = "queued";
  readonly transitions: DeploymentStatus[] = [];
  readonly logs: LogLine[] = [];
  promoted: { environmentId: string; endpointUrl: string } | null = null;
  tools: DiscoveredTool[] = [];
  health: string | null = null;
  patches: Record<string, unknown>[] = [];

  async getStatus() {
    return this.status;
  }
  async setStatus(
    _id: string,
    status: DeploymentStatus,
    patch?: Record<string, unknown>,
  ) {
    this.status = status;
    this.transitions.push(status);
    if (patch) this.patches.push(patch);
  }
  async appendLogs(_id: string, lines: LogLine[]) {
    this.logs.push(...lines);
  }
  async promoteEnvironment(environmentId: string, _d: string, endpointUrl: string) {
    this.promoted = { environmentId, endpointUrl };
  }
  resources: unknown[] = [];
  prompts: unknown[] = [];
  async replaceCapabilities(
    _s: string,
    _o: string,
    found: { tools: DiscoveredTool[]; resources: unknown[]; prompts: unknown[] },
  ) {
    this.tools = found.tools;
    this.resources = found.resources;
    this.prompts = found.prompts;
  }
  async setServerHealth(_s: string, health: string) {
    this.health = health;
  }
}

/** A runtime that never touches the filesystem or the network. */
class FakeRuntime implements RuntimeAdapter {
  readonly name = "fake";
  stopped: string[] = [];
  started = 0;

  constructor(
    private readonly behaviour: {
      buildError?: Error;
      startError?: Error;
      endpointUrl?: string;
      onBuild?: () => void | Promise<void>;
    } = {},
  ) {}

  async build() {
    await this.behaviour.onBuild?.();
    if (this.behaviour.buildError) throw this.behaviour.buildError;
  }
  async start() {
    if (this.behaviour.startError) throw this.behaviour.startError;
    this.started += 1;
    return {
      handle: `fake:${this.started}`,
      endpointUrl: this.behaviour.endpointUrl ?? "http://127.0.0.1:1/mcp",
    };
  }
  async stop(handle: string) {
    this.stopped.push(handle);
  }
}

const spec = (): DeploymentSpec => ({
  deploymentId: "dep_1",
  organizationId: "org_1",
  serverId: "srv_1",
  serverSlug: "customer-mcp",
  environmentId: "env_1",
  environmentName: "production",
  repositoryUrl: "https://github.com/example/repo.git",
  branch: "main",
  rootDirectory: ".",
  installCommand: "npm ci",
  buildCommand: "npm run build",
  startCommand: "npm start",
  runtime: "node22",
  env: {},
});

/**
 * The orchestrator health-checks over a real MCP handshake, which these tests
 * do not want. Pointing at a closed port makes it fail fast and deterministically
 * — which is exactly the "started but never handshook" case worth covering.
 */
const CLOSED_PORT_ENDPOINT = "http://127.0.0.1:9/mcp";

function orchestrator(runtime: RuntimeAdapter, store: MemoryStore) {
  return new Orchestrator({
    store,
    runtime,
    logFlushMs: 0,
    // Two quick attempts: these tests care that the failure is handled, not
    // that the retry budget is spent.
    health: { attempts: 2, initialDelayMs: 1 },
  });
}

/* -------------------------------------------------------------------- tests */

describe("deployment orchestration", () => {
  test("a build failure ends in failed, not stuck in building", async () => {
    const store = new MemoryStore();
    const runtime = new FakeRuntime({
      buildError: new DeploymentError(
        "build_failed",
        "The build command failed.",
        'Module "@mcpfy/server" could not be resolved.',
      ),
    });

    const result = await orchestrator(runtime, store).run(
      spec(),
      new AbortController().signal,
    );

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "build_failed");
    assert.deepEqual(store.transitions, ["building", "failed"]);
    assert.equal(store.promoted, null);
  });

  test("the failure message keeps the detail a developer needs", async () => {
    const store = new MemoryStore();
    const runtime = new FakeRuntime({
      buildError: new DeploymentError(
        "build_failed",
        "The build command failed.",
        'Module "@mcpfy/server" could not be resolved.',
      ),
    });

    await orchestrator(runtime, store).run(spec(), new AbortController().signal);

    const patch = store.patches.at(-1)!;
    assert.match(String(patch.errorMessage), /could not be resolved/);
  });

  test("a server that starts but never handshakes fails the health check", async () => {
    const store = new MemoryStore();
    const runtime = new FakeRuntime({ endpointUrl: CLOSED_PORT_ENDPOINT });

    const result = await orchestrator(runtime, store).run(
      spec(),
      new AbortController().signal,
    );

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "health_check_failed");
    assert.deepEqual(store.transitions, [
      "building",
      "deploying",
      "health_check",
      "failed",
    ]);
  });

  test("a failed deployment never promotes its environment", async () => {
    const store = new MemoryStore();
    const runtime = new FakeRuntime({ endpointUrl: CLOSED_PORT_ENDPOINT });

    await orchestrator(runtime, store).run(spec(), new AbortController().signal);

    assert.equal(store.promoted, null);
    assert.equal(store.health, "unhealthy");
  });

  test("a half-started instance is always stopped", async () => {
    // The single most expensive bug this class can have is leaking processes.
    const store = new MemoryStore();
    const runtime = new FakeRuntime({ endpointUrl: CLOSED_PORT_ENDPOINT });

    await orchestrator(runtime, store).run(spec(), new AbortController().signal);

    assert.equal(runtime.stopped.length, 1);
  });

  test("cancellation lands in cancelled, not failed", async () => {
    const store = new MemoryStore();
    const controller = new AbortController();
    const runtime = new FakeRuntime({
      onBuild: () => {
        controller.abort();
        throw new Error("aborted mid-build");
      },
    });

    const result = await orchestrator(runtime, store).run(
      spec(),
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.deepEqual(store.transitions, ["building", "cancelled"]);
    // A cancelled deployment says nothing about whether the server is healthy.
    assert.equal(store.health, null);
  });

  test("a start failure never reaches health_check", async () => {
    const store = new MemoryStore();
    const runtime = new FakeRuntime({
      startError: new DeploymentError(
        "start_failed",
        "The server exited before it started listening (code 1).",
      ),
    });

    const result = await orchestrator(runtime, store).run(
      spec(),
      new AbortController().signal,
    );

    assert.equal(result.status, "failed");
    assert.deepEqual(store.transitions, ["building", "deploying", "failed"]);
  });

  test("a deployment cancelled while building is not resurrected", async () => {
    // The build finishes a moment after the cancel lands. Reading the status
    // back before each write is what stops it from marching on to deploying.
    const store = new MemoryStore();
    const runtime = new FakeRuntime({
      onBuild: () => {
        store.status = "cancelled";
      },
    });

    const result = await orchestrator(runtime, store).run(
      spec(),
      new AbortController().signal,
    );

    // The cancel stands; the finished build does not overturn it.
    assert.equal(result.status, "cancelled");
    // And it never claimed to be deploying after being cancelled.
    assert.equal(store.transitions.includes("deploying"), false);
  });

  test("logs are captured and flushed even when the deployment fails", async () => {
    const store = new MemoryStore();
    const runtime = new FakeRuntime({
      buildError: new DeploymentError("build_failed", "The build command failed."),
    });

    await orchestrator(runtime, store).run(spec(), new AbortController().signal);

    assert.ok(store.logs.length > 0);
    assert.ok(store.logs.some((l) => /Building customer-mcp/.test(l.message)));
    assert.ok(store.logs.some((l) => /build command failed/i.test(l.message)));
  });

  test("a cancel arriving during health_check is recorded as failed", async () => {
    // health_check has no legal edge to cancelled — the instance is already
    // being probed — so the terminal write falls back to failed rather than
    // throwing out of the failure path.
    const store = new MemoryStore();
    const runtime = new FakeRuntime({ endpointUrl: CLOSED_PORT_ENDPOINT });
    const controller = new AbortController();

    const original = store.setStatus.bind(store);
    store.setStatus = async (id, status, patch) => {
      await original(id, status, patch);
      if (status === "health_check") controller.abort();
    };

    const result = await orchestrator(runtime, store).run(
      spec(),
      controller.signal,
    );

    assert.equal(result.status, "failed");
    assert.equal(store.status, "failed");
  });

  test("a vanished deployment record fails instead of throwing upward", async () => {
    const store = new MemoryStore();
    // @ts-expect-error — deliberately simulating a deleted row
    store.getStatus = async () => null;

    const result = await orchestrator(new FakeRuntime(), store).run(
      spec(),
      new AbortController().signal,
    );

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "deployment_missing");
  });
});
