import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { freePort, hostForUrl, waitForPort } from "./ports";
import {
  DeploymentError,
  type DeploymentSpec,
  type LogSink,
  type RuntimeAdapter,
  type RunningInstance,
} from "./types";

/**
 * Runs deployments as supervised child processes on the host.
 *
 * This is a real runtime, not a stand-in: it clones the repository at a
 * commit, runs the detected install and build commands, starts the server on
 * an allocated port, and keeps the process registered so it can be stopped or
 * rolled back. It is what self-hosted MCPfy runs on ("Deploy to your own
 * server" in ROADMAP.md), and it is the reference implementation that a
 * container or microVM adapter has to match.
 *
 * What it does not do is isolate tenants from each other or from the host.
 * Build and start commands come from a repository, so running someone else's
 * repository here is equivalent to running their code as your user. §25 is
 * explicit that tool execution must be sandboxed; that sandbox is a container
 * adapter, and until it exists this runtime refuses to start unless
 * MCPFY_ALLOW_LOCAL_RUNTIME is set, so it cannot be switched on in a hosted
 * deployment by accident.
 */
export class LocalRuntime implements RuntimeAdapter {
  readonly name = "local";

  private readonly root: string;

  constructor(options: { workspaceRoot?: string } = {}) {
    this.root =
      options.workspaceRoot ??
      process.env.MCPFY_WORKSPACE_ROOT ??
      join(homedir(), ".mcpfy", "deployments");
  }

  static assertEnabled(): void {
    if (process.env.MCPFY_ALLOW_LOCAL_RUNTIME !== "1") {
      throw new DeploymentError(
        "runtime_disabled",
        "The local runtime is disabled.",
        "It executes repository build and start commands directly on the host " +
          "with no sandbox. Set MCPFY_ALLOW_LOCAL_RUNTIME=1 to enable it for " +
          "self-hosted or development use.",
      );
    }
  }

  private workdir(spec: DeploymentSpec): string {
    return join(this.root, spec.serverId, spec.deploymentId);
  }

  async build(
    spec: DeploymentSpec,
    log: LogSink,
    signal: AbortSignal,
  ): Promise<void> {
    LocalRuntime.assertEnabled();

    const dir = this.workdir(spec);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    log({ stream: "system", message: `Runtime: local (${process.platform})` });
    log({ stream: "system", message: `Workspace: ${dir}` });

    // --depth 1 keeps clones small; a specific commit needs the branch tip
    // fetched first, which is what the second step does when a sha is pinned.
    await this.run(
      "git",
      ["clone", "--depth", "1", "--branch", spec.branch, spec.repositoryUrl, "."],
      dir,
      spec,
      log,
      signal,
      "clone_failed",
      "The repository could not be cloned.",
    );

    if (spec.commitSha) {
      await this.run(
        "git",
        ["fetch", "--depth", "1", "origin", spec.commitSha],
        dir,
        spec,
        log,
        signal,
        "fetch_failed",
        `Commit ${spec.commitSha.slice(0, 7)} could not be fetched.`,
      );
      await this.run(
        "git",
        ["checkout", spec.commitSha],
        dir,
        spec,
        log,
        signal,
        "checkout_failed",
        `Commit ${spec.commitSha.slice(0, 7)} could not be checked out.`,
      );
    }

    const projectDir = resolve(dir, spec.rootDirectory);

    if (spec.installCommand) {
      log({ stream: "system", message: `$ ${spec.installCommand}` });
      await this.shell(
        spec.installCommand,
        projectDir,
        spec,
        log,
        signal,
        "install_failed",
        "Dependency installation failed.",
      );
    }

    if (spec.buildCommand) {
      log({ stream: "system", message: `$ ${spec.buildCommand}` });
      await this.shell(
        spec.buildCommand,
        projectDir,
        spec,
        log,
        signal,
        "build_failed",
        "The build command failed.",
      );
    } else {
      log({ stream: "system", message: "No build command; skipping build." });
    }
  }

  async start(
    spec: DeploymentSpec,
    log: LogSink,
    signal: AbortSignal,
  ): Promise<RunningInstance> {
    LocalRuntime.assertEnabled();

    if (!spec.startCommand) {
      throw new DeploymentError(
        "no_start_command",
        "This server has no start command.",
        "Detection could not find one. Set it in the server's settings and deploy again.",
      );
    }

    const projectDir = resolve(this.workdir(spec), spec.rootDirectory);
    const port = await freePort();

    log({ stream: "system", message: `$ ${spec.startCommand}` });
    log({ stream: "system", message: `Listening on port ${port}` });

    const child = spawn(spec.startCommand, {
      cwd: projectDir,
      shell: true,
      env: {
        ...process.env,
        ...spec.env,
        // The contract every MCPfy deployment honours.
        PORT: String(port),
        HOST: "127.0.0.1",
        MCP_TRANSPORT: "http",
        NODE_ENV: "production",
        MCPFY_DEPLOYMENT_ID: spec.deploymentId,
        MCPFY_ENVIRONMENT: spec.environmentName,
      },
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handle = registerProcess(spec.deploymentId, child);
    pipeOutput(child, log);

    // If the process dies during startup we want that error, not a timeout.
    const exited = new Promise<never>((_, reject) => {
      child.once("exit", (code, sig) => {
        reject(
          new DeploymentError(
            "start_failed",
            `The server exited before it started listening (${sig ?? `code ${code}`}).`,
            "The last lines of the runtime log usually say why.",
          ),
        );
      });
    });

    let boundHost: string;
    try {
      boundHost = await Promise.race([
        waitForPort(port, { timeoutMs: 30_000, signal }),
        exited,
      ]);
    } catch (error) {
      await this.stop(handle);
      throw error instanceof DeploymentError
        ? error
        : new DeploymentError(
            "start_timeout",
            "The server did not start listening within 30 seconds.",
            error instanceof Error ? error.message : undefined,
          );
    }

    log({ stream: "system", message: `Bound on ${boundHost}:${port}` });
    return {
      handle,
      endpointUrl: `http://${hostForUrl(boundHost)}:${port}/mcp`,
    };
  }

  async stop(handle: string): Promise<void> {
    await stopProcess(handle);
  }

  /** Removes a deployment's workspace once nothing references it. */
  async cleanup(spec: DeploymentSpec): Promise<void> {
    await rm(this.workdir(spec), { recursive: true, force: true });
  }

  private shell(
    command: string,
    cwd: string,
    spec: DeploymentSpec,
    log: LogSink,
    signal: AbortSignal,
    code: string,
    message: string,
  ) {
    return this.exec(command, [], cwd, spec, log, signal, code, message, true);
  }

  private run(
    file: string,
    args: string[],
    cwd: string,
    spec: DeploymentSpec,
    log: LogSink,
    signal: AbortSignal,
    code: string,
    message: string,
  ) {
    return this.exec(file, args, cwd, spec, log, signal, code, message, false);
  }

  private exec(
    file: string,
    args: string[],
    cwd: string,
    spec: DeploymentSpec,
    log: LogSink,
    signal: AbortSignal,
    code: string,
    message: string,
    useShell: boolean,
  ): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(file, args, {
        cwd,
        shell: useShell,
        env: {
          ...process.env,
          ...spec.env,
          CI: "1",
          // Deliberately *not* NODE_ENV=production. npm omits
          // devDependencies under that flag, so the very tools a build needs
          // — typescript, esbuild, the bundler — go missing and the build
          // dies with "tsc: command not found". Production is a property of
          // the running server, which `start` sets; a build needs everything.
          NODE_ENV: "development",
          NPM_CONFIG_PRODUCTION: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      pipeOutput(child, log);

      const onAbort = () => child.kill("SIGTERM");
      signal.addEventListener("abort", onAbort, { once: true });

      child.once("error", (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(new DeploymentError(code, message, error.message));
      });

      child.once("exit", (exitCode, exitSignal) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(new DeploymentError("cancelled", "The deployment was cancelled."));
        } else if (exitCode === 0) {
          resolvePromise();
        } else {
          reject(
            new DeploymentError(
              code,
              message,
              `${file} exited with ${exitSignal ?? `code ${exitCode}`}.`,
            ),
          );
        }
      });
    });
  }
}

/* --------------------------------------------------------- process registry */

interface Registered {
  child: ChildProcess;
  deploymentId: string;
}

/**
 * On globalThis for the same reason the database client is: Next reloads
 * server modules on edit, and a module-level map would orphan every process
 * started before the reload.
 */
const REGISTRY_KEY = Symbol.for("mcpfy.deployment.processes");
type Registry = typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, Registered>;
};

function registry(): Map<string, Registered> {
  const g = globalThis as Registry;
  g[REGISTRY_KEY] ??= new Map();
  return g[REGISTRY_KEY];
}

function registerProcess(deploymentId: string, child: ChildProcess): string {
  const handle = `local:${deploymentId}:${child.pid ?? "unknown"}`;
  registry().set(handle, { child, deploymentId });
  child.once("exit", () => registry().delete(handle));
  return handle;
}

async function stopProcess(handle: string): Promise<void> {
  const entry = registry().get(handle);
  if (!entry) return;

  const { child } = entry;
  registry().delete(handle);
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGTERM");

  // Give it a moment to shut down cleanly before insisting.
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

export function runningHandles(): string[] {
  return [...registry().keys()];
}

function pipeOutput(child: ChildProcess, log: LogSink): void {
  const emit = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      const message = line.replace(/\s+$/, "");
      if (message) log({ stream, message });
    }
  };
  child.stdout?.on("data", emit("stdout"));
  child.stderr?.on("data", emit("stderr"));
}
