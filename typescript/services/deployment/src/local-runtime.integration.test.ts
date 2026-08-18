import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { detect } from "@mcpfy/detection";
import { diskTree } from "./disk-tree";
import { LocalRuntime } from "./local-runtime";
import { Orchestrator } from "./orchestrator";
import type {
  DeploymentStatus,
  DeploymentStore,
  DiscoveredTool,
  LogLine,
} from "./types";

const run = promisify(execFile);

/**
 * §34 integration test: repository → deployment → live MCP endpoint → tools.
 *
 * It really clones, really installs from npm and really starts a process, so
 * it needs a network and takes tens of seconds. That makes it wrong to run on
 * every save, and right to run before shipping — hence the env gate rather
 * than deletion.
 *
 *     MCPFY_E2E=1 pnpm test
 */
const ENABLED = process.env.MCPFY_E2E === "1";

class RecordingStore implements DeploymentStore {
  status: DeploymentStatus = "queued";
  readonly transitions: DeploymentStatus[] = [];
  readonly logs: LogLine[] = [];
  promotedUrl: string | null = null;
  tools: DiscoveredTool[] = [];
  health: string | null = null;

  async getStatus() {
    return this.status;
  }
  async setStatus(_id: string, status: DeploymentStatus) {
    this.status = status;
    this.transitions.push(status);
  }
  async appendLogs(_id: string, lines: LogLine[]) {
    this.logs.push(...lines);
  }
  async promoteEnvironment(_e: string, _d: string, url: string) {
    this.promotedUrl = url;
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

/**
 * Scaffolds a real mcpfy server with create-mcpfy-app.
 *
 * The CLI is interactive, so the answers go in over stdin: project name, then
 * transport 2 (http — MCPfy deploys over HTTP, and the default of stdio would
 * produce a server no health check could ever reach), then auth 1 (none).
 */
function scaffoldRepository(dir: string): Promise<string> {
  const repo = join(dir, "demo-mcp");
  const scaffolder = join(
    import.meta.dirname,
    "../../../packages/create-mcpfy-app/dist/bin.js",
  );

  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [scaffolder], {
      cwd: dir,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.stdin?.end("demo-mcp\n2\n1\n");
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(repo);
      else reject(new Error(`create-mcpfy-app exited with ${code}: ${stderr}`));
    });
  });
}

describe("local runtime, end to end", { skip: !ENABLED }, () => {
  test("a scaffolded server reaches live with its tools discovered", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "mcpfy-e2e-"));
    t.after(() => rm(dir, { recursive: true, force: true }));

    // Scaffold, drop node_modules, and make it a git repository.
    const repo = await scaffoldRepository(dir);
    await rm(join(repo, "node_modules"), { recursive: true, force: true });
    await writeFile(join(repo, ".gitignore"), "node_modules/\ndist/\n");
    await run("git", ["init", "-q"], { cwd: repo });
    await run("git", ["add", "-A"], { cwd: repo });
    await run(
      "git",
      [
        "-c",
        "user.email=e2e@mcpfy.test",
        "-c",
        "user.name=e2e",
        "commit",
        "-qm",
        "scaffold",
      ],
      { cwd: repo },
    );

    // Detection decides how to build it — no hand-written commands.
    const detection = await detect(diskTree(repo));
    assert.equal(detection.framework, "mcpfy_sdk");
    assert.ok(detection.startCommand);

    process.env.MCPFY_ALLOW_LOCAL_RUNTIME = "1";
    const runtime = new LocalRuntime({ workspaceRoot: join(dir, "workspace") });
    const store = new RecordingStore();
    const orchestrator = new Orchestrator({ store, runtime, logFlushMs: 0 });

    const spec = {
      deploymentId: "dep_e2e",
      organizationId: "org_e2e",
      serverId: "srv_e2e",
      serverSlug: "demo-mcp",
      environmentId: "env_e2e",
      environmentName: "production",
      repositoryUrl: repo,
      branch: "main",
      rootDirectory: detection.rootDirectory,
      installCommand: detection.installCommand,
      buildCommand: detection.buildCommand,
      startCommand: detection.startCommand,
      runtime: detection.runtime,
      env: {},
    };

    const result = await orchestrator.run(spec, new AbortController().signal);
    t.after(async () => {
      for (const handle of (await import("./local-runtime")).runningHandles()) {
        await runtime.stop(handle);
      }
    });

    assert.equal(
      result.status,
      "live",
      `expected live, got ${result.status}: ${result.errorMessage}\n` +
        store.logs
          .slice(-15)
          .map((l) => `  ${l.stream}: ${l.message}`)
          .join("\n"),
    );
    assert.deepEqual(store.transitions, [
      "building",
      "deploying",
      "health_check",
      "live",
    ]);

    // The endpoint the environment was promoted to is the one that answered.
    assert.equal(store.promotedUrl, result.endpointUrl);
    assert.match(store.promotedUrl!, /^http:\/\/(\[::1\]|127\.0\.0\.1):\d+\/mcp$/);
    assert.equal(store.health, "healthy");

    // Discovery filled the registry from a real tools/list.
    const add = store.tools.find((tool) => tool.name === "add");
    assert.ok(add, `expected an "add" tool, got: ${store.tools.map((x) => x.name)}`);
    assert.match(String(add.description), /add/i);
    assert.ok(add.inputSchema, "the tool schema should be captured verbatim");

    // The scaffold ships one of each, so discovery must find all three.
    assert.equal(store.resources.length, 1, "expected the greeting resource");
    assert.equal(store.prompts.length, 1, "expected the greet prompt");
  });
});
