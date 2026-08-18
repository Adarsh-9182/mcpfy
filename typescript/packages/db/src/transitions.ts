/**
 * §11 — the deployment state machine, in one place.
 *
 * Every status change goes through `assertTransition`. Keeping the legal
 * edges here (rather than scattered across the deploy service and the UI)
 * means a bug can produce a *failed* deployment but never an impossible one,
 * and §34's unit tests have a single thing to assert against.
 */

export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "health_check"
  | "live"
  | "failed"
  | "cancelled"
  | "rolled_back";

const EDGES: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  queued: ["building", "cancelled", "failed"],
  building: ["deploying", "failed", "cancelled"],
  deploying: ["health_check", "failed", "cancelled"],
  health_check: ["live", "failed"],
  // A live deployment stays live until a newer one replaces it, or it is
  // explicitly rolled back.
  live: ["rolled_back"],
  failed: [],
  cancelled: [],
  rolled_back: [],
};

export const TERMINAL_STATUSES = [
  "failed",
  "cancelled",
  "rolled_back",
] as const satisfies readonly DeploymentStatus[];

export const IN_FLIGHT_STATUSES = [
  "queued",
  "building",
  "deploying",
  "health_check",
] as const satisfies readonly DeploymentStatus[];

export function isTerminal(status: DeploymentStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isInFlight(status: DeploymentStatus): boolean {
  return (IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}

export function canTransition(
  from: DeploymentStatus,
  to: DeploymentStatus,
): boolean {
  return EDGES[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: DeploymentStatus,
    readonly to: DeploymentStatus,
  ) {
    super(`Deployment cannot move from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(
  from: DeploymentStatus,
  to: DeploymentStatus,
): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Human-facing copy, used by the dashboard and the CLI alike. */
export const STATUS_LABEL: Record<DeploymentStatus, string> = {
  queued: "Queued",
  building: "Building",
  deploying: "Deploying",
  health_check: "Health check",
  live: "Live",
  failed: "Failed",
  cancelled: "Cancelled",
  rolled_back: "Rolled back",
};

/** Ordered pipeline steps for the progress UI. */
export const PIPELINE_STEPS = [
  "queued",
  "building",
  "deploying",
  "health_check",
  "live",
] as const satisfies readonly DeploymentStatus[];
