import {
  assertTransition,
  canTransition,
  isTerminal,
  type DeploymentStatus,
} from "@mcpfy/db";
import { checkHealth } from "./health";
import {
  DeploymentError,
  type DeploymentSpec,
  type DeploymentStore,
  type LogLine,
  type RuntimeAdapter,
} from "./types";

/**
 * §11 — drives one deployment from QUEUED to LIVE, or to a state that
 * explains why it did not get there.
 *
 * Every status change goes through `assertTransition`, so a bug here can
 * produce a failed deployment but never an impossible one. The orchestrator
 * owns state, logs and the database; it never runs code itself — that is the
 * runtime adapter's job, which is what makes both halves testable in
 * isolation.
 */

export interface RunResult {
  status: DeploymentStatus;
  endpointUrl?: string;
  toolCount?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface OrchestratorOptions {
  store: DeploymentStore;
  runtime: RuntimeAdapter;
  /** Flushed in batches; log writes must not dominate a deployment's time. */
  logFlushMs?: number;
  /**
   * How patient the health check is. A cold Python import needs longer than a
   * warm Node process, and a test needs neither, so the budget is a parameter
   * rather than a constant.
   */
  health?: { attempts?: number; initialDelayMs?: number };
  now?: () => Date;
}

export class Orchestrator {
  private readonly store: DeploymentStore;
  private readonly runtime: RuntimeAdapter;
  private readonly logFlushMs: number;
  private readonly health: { attempts?: number; initialDelayMs?: number };
  private readonly now: () => Date;

  constructor(options: OrchestratorOptions) {
    this.store = options.store;
    this.runtime = options.runtime;
    this.logFlushMs = options.logFlushMs ?? 250;
    this.health = options.health ?? {};
    this.now = options.now ?? (() => new Date());
  }

  async run(spec: DeploymentSpec, signal: AbortSignal): Promise<RunResult> {
    const logs = new LogBuffer(
      (lines) => this.store.appendLogs(spec.deploymentId, lines),
      this.logFlushMs,
    );
    const log = logs.write;

    let handle: string | undefined;

    try {
      await this.transition(spec.deploymentId, "building", {
        startedAt: this.now(),
      });
      log({
        stream: "system",
        message: `Building ${spec.serverSlug} (${spec.environmentName}) from ${spec.branch}`,
      });
      await this.runtime.build(spec, log, signal);

      await this.transition(spec.deploymentId, "deploying");
      const instance = await this.runtime.start(spec, log, signal);
      handle = instance.handle;

      await this.transition(spec.deploymentId, "health_check", {
        endpointUrl: instance.endpointUrl,
      });
      const health = await checkHealth(instance.endpointUrl, log, {
        ...this.health,
        signal,
      });

      await this.store.replaceCapabilities(spec.serverId, spec.organizationId, {
        tools: health.tools,
        resources: health.resources,
        prompts: health.prompts,
      });
      await this.store.promoteEnvironment(
        spec.environmentId,
        spec.deploymentId,
        instance.endpointUrl,
      );
      await this.store.setServerHealth(spec.serverId, "healthy");

      await this.transition(spec.deploymentId, "live", {
        endpointUrl: instance.endpointUrl,
        readyAt: this.now(),
        endedAt: this.now(),
      });

      log({
        stream: "system",
        message: `Live at ${instance.endpointUrl}`,
      });
      await logs.flush();

      return {
        status: "live",
        endpointUrl: instance.endpointUrl,
        toolCount: health.tools.length,
      };
    } catch (error) {
      // The instance may be half-started; never leave a process behind.
      if (handle) await this.runtime.stop(handle).catch(() => {});

      const cancelled = signal.aborted;
      const failure = toDeploymentError(error);

      log({
        stream: "system",
        message: cancelled
          ? "Deployment cancelled."
          : `${failure.message}${failure.detail ? ` — ${failure.detail}` : ""}`,
      });
      await logs.flush();

      const finalStatus = await this.finalize(
        spec.deploymentId,
        cancelled ? "cancelled" : "failed",
        {
          errorCode: cancelled ? "cancelled" : failure.code,
          errorMessage: cancelled
            ? "The deployment was cancelled."
            : failure.detail
              ? `${failure.message} ${failure.detail}`
              : failure.message,
          endedAt: this.now(),
        },
      );

      if (finalStatus === "failed") {
        // Health is a statement about the server, not about this attempt, so
        // a cancelled or superseded deployment leaves it alone.
        await this.store
          .setServerHealth(spec.serverId, "unhealthy")
          .catch(() => {});
      }

      return {
        status: finalStatus,
        errorCode: failure.code,
        errorMessage: failure.message,
      };
    }
  }

  /**
   * Reads the current status before writing the next one, so a deployment
   * that was cancelled while a build was running does not get resurrected by
   * the build finishing a moment later.
   */
  private async finalize(
    deploymentId: string,
    desired: "failed" | "cancelled",
    patch: Parameters<DeploymentStore["setStatus"]>[2],
  ): Promise<DeploymentStatus> {
    let from: DeploymentStatus | null;
    try {
      from = await this.store.getStatus(deploymentId);
    } catch {
      return desired;
    }

    // The record is gone. There is nothing to write and nothing to fix.
    if (from === null) return desired;

    // Someone already resolved it — a cancel that landed while we were
    // building, or a competing attempt. Their answer stands.
    if (isTerminal(from)) return from;

    if (canTransition(from, desired)) {
      await this.store.setStatus(deploymentId, desired, patch).catch(() => {});
      return desired;
    }

    // health_check cannot be cancelled (the instance is already taking
    // traffic checks), so a cancel arriving there is recorded as a failure.
    if (canTransition(from, "failed")) {
      await this.store.setStatus(deploymentId, "failed", patch).catch(() => {});
      return "failed";
    }

    return from;
  }

  private async transition(
    deploymentId: string,
    to: DeploymentStatus,
    patch?: Parameters<DeploymentStore["setStatus"]>[2],
  ): Promise<void> {
    const from = await this.store.getStatus(deploymentId);
    if (from === null) {
      throw new DeploymentError(
        "deployment_missing",
        "The deployment record disappeared while it was running.",
      );
    }
    if (from === to) return;
    assertTransition(from, to);
    await this.store.setStatus(deploymentId, to, patch);
  }
}

function toDeploymentError(error: unknown): DeploymentError {
  if (error instanceof DeploymentError) return error;
  if (error instanceof Error) {
    return new DeploymentError("internal_error", error.message);
  }
  return new DeploymentError("internal_error", String(error));
}

/**
 * Batches log lines.
 *
 * A build emits thousands of lines; one insert each would make the database
 * the slowest part of a deployment and starve the SSE stream behind it.
 */
class LogBuffer {
  private pending: LogLine[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly sink: (lines: LogLine[]) => Promise<void>,
    private readonly flushMs: number,
  ) {}

  write = (line: LogLine): void => {
    this.pending.push(line);
    this.timer ??= setTimeout(() => void this.flush(), this.flushMs);
  };

  flush = async (): Promise<void> => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.length === 0) return this.inFlight;

    const batch = this.pending;
    this.pending = [];
    // Chain writes so batches land in order even if one is slow.
    this.inFlight = this.inFlight.then(() =>
      this.sink(batch).catch(() => {
        // A dropped log line must never fail a deployment that is otherwise
        // healthy; the failure itself surfaces through the status.
      }),
    );
    return this.inFlight;
  };
}
