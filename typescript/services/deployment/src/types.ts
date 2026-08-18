import type { DeploymentStatus } from "@mcpfy/db";
import type { Detection } from "@mcpfy/detection";

export type { DeploymentStatus };

export type LogStream = "stdout" | "stderr" | "system";

export interface LogLine {
  stream: LogStream;
  message: string;
}

/** Everything a runtime needs in order to build and start one deployment. */
export interface DeploymentSpec {
  deploymentId: string;
  organizationId: string;
  serverId: string;
  serverSlug: string;
  environmentId: string;
  environmentName: string;
  /** git URL. Tokenised by the caller when the repository is private. */
  repositoryUrl: string;
  branch: string;
  commitSha?: string | null;
  rootDirectory: string;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  runtime: Detection["runtime"];
  /** Already decrypted. Never logged, never persisted from here. */
  env: Record<string, string>;
}

export interface RunningInstance {
  /** Opaque to the orchestrator; the adapter uses it to stop the instance. */
  handle: string;
  /** The base URL clients connect to, e.g. http://127.0.0.1:41234/mcp */
  endpointUrl: string;
}

/**
 * §11 — the boundary between "drive a deployment" and "actually run code".
 *
 * The orchestrator owns the state machine, the logs and the database; an
 * adapter owns compute. `LocalRuntime` runs the server as a supervised child
 * process, which is what self-hosted MCPfy needs; a Firecracker or container
 * adapter implements the same three methods without the orchestrator
 * changing.
 */
export interface RuntimeAdapter {
  readonly name: string;
  /** Fetch source and run install/build. Throws `BuildError` on failure. */
  build(spec: DeploymentSpec, log: LogSink, signal: AbortSignal): Promise<void>;
  /** Start the server and return where it listens. */
  start(
    spec: DeploymentSpec,
    log: LogSink,
    signal: AbortSignal,
  ): Promise<RunningInstance>;
  /** Stop a running instance. Must be idempotent. */
  stop(handle: string): Promise<void>;
}

export type LogSink = (line: LogLine) => void;

/** Persistence the orchestrator needs. Implemented over Drizzle by the app. */
export interface DeploymentStore {
  getStatus(deploymentId: string): Promise<DeploymentStatus | null>;
  setStatus(
    deploymentId: string,
    status: DeploymentStatus,
    patch?: {
      endpointUrl?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      startedAt?: Date;
      readyAt?: Date;
      endedAt?: Date;
    },
  ): Promise<void>;
  appendLogs(deploymentId: string, lines: LogLine[]): Promise<void>;
  /** Point an environment at a deployment. Called once it is healthy. */
  promoteEnvironment(
    environmentId: string,
    deploymentId: string,
    endpointUrl: string,
  ): Promise<void>;
  /**
   * Replace the tool, resource and prompt registries with what discovery
   * found. Implementations mark absent entries as removed rather than
   * deleting them, so historical calls still resolve to a name.
   */
  replaceCapabilities(
    serverId: string,
    organizationId: string,
    found: {
      tools: DiscoveredTool[];
      resources: DiscoveredResource[];
      prompts: DiscoveredPrompt[];
    },
  ): Promise<void>;
  setServerHealth(
    serverId: string,
    health: "healthy" | "degraded" | "unhealthy" | "unknown",
  ): Promise<void>;
}

export interface DiscoveredTool {
  name: string;
  title?: string | null;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
}

export interface DiscoveredResource {
  uri: string;
  name?: string | null;
  description?: string | null;
  mimeType?: string | null;
}

export interface DiscoveredPrompt {
  name: string;
  description?: string | null;
  arguments?: Record<string, unknown>[] | null;
}

/** A failure the developer can act on. `code` drives the §35 error UI. */
export class DeploymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "DeploymentError";
  }
}
