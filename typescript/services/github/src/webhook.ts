import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * §33 — webhook signature verification.
 *
 * A webhook endpoint is a public URL that causes MCPfy to build and run code.
 * Without verification anyone who learns the URL can trigger a deployment of
 * any branch of any connected repository. This is the single check that stops
 * that, so it is written to be boring and total: constant-time comparison, no
 * early returns that leak, and a hard failure on anything unexpected.
 */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

export function verifySignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
): VerifyResult {
  if (!secret) {
    return { ok: false, reason: "No webhook secret is configured." };
  }
  if (!signatureHeader) {
    return { ok: false, reason: "Missing X-Hub-Signature-256 header." };
  }
  if (!signatureHeader.startsWith("sha256=")) {
    // GitHub also sends a legacy sha1 header. Accepting it would silently
    // downgrade the check, so only sha256 is honoured.
    return { ok: false, reason: "Signature is not sha256." };
  }

  const expected = `sha256=${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`;

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return { ok: false, reason: "Signature does not match." };
  }

  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "Signature does not match." };
}

/* ------------------------------------------------------------------ events */

export interface PushEvent {
  kind: "push";
  installationId: string;
  repositoryFullName: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  commitMessage: string | null;
  pusher: string | null;
  /** True for a branch or tag deletion, which must not trigger a build. */
  deleted: boolean;
}

export interface InstallationEvent {
  kind: "installation";
  action: string;
  installationId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
}

export interface IgnoredEvent {
  kind: "ignored";
  reason: string;
}

export type WebhookEvent = PushEvent | InstallationEvent | IgnoredEvent;

/**
 * Turns a verified payload into something worth acting on.
 *
 * Anything unrecognised becomes `ignored` rather than an error: GitHub sends
 * a wide range of events, and a webhook endpoint that 500s on the ones it does
 * not handle gets disabled by GitHub after enough failures.
 */
export function parseEvent(
  eventName: string | null,
  payload: unknown,
): WebhookEvent {
  const body = (payload ?? {}) as Record<string, any>;

  if (eventName === "ping") {
    return { kind: "ignored", reason: "ping" };
  }

  if (eventName === "push") {
    const ref = String(body.ref ?? "");
    if (!ref.startsWith("refs/heads/")) {
      return { kind: "ignored", reason: "not a branch push" };
    }
    return {
      kind: "push",
      installationId: String(body.installation?.id ?? ""),
      repositoryFullName: String(body.repository?.full_name ?? ""),
      repositoryId: String(body.repository?.id ?? ""),
      branch: ref.slice("refs/heads/".length),
      commitSha: String(body.after ?? ""),
      commitMessage:
        typeof body.head_commit?.message === "string"
          ? body.head_commit.message.split("\n")[0]!.slice(0, 200)
          : null,
      pusher: typeof body.pusher?.name === "string" ? body.pusher.name : null,
      deleted: body.deleted === true,
    };
  }

  if (eventName === "installation" || eventName === "installation_repositories") {
    return {
      kind: "installation",
      action: String(body.action ?? "unknown"),
      installationId: String(body.installation?.id ?? ""),
      accountLogin: String(body.installation?.account?.login ?? ""),
      accountType: String(body.installation?.account?.type ?? "User"),
      repositorySelection: String(body.installation?.repository_selection ?? "selected"),
    };
  }

  return { kind: "ignored", reason: eventName ?? "unknown event" };
}

/** Whether a push should start a build. */
export function shouldDeploy(
  event: PushEvent,
  productionBranch: string,
): { deploy: boolean; reason: string } {
  if (event.deleted) {
    return { deploy: false, reason: "Branch was deleted." };
  }
  // A push with no commit sha is a branch creation pointing at nothing new.
  if (!event.commitSha || /^0+$/.test(event.commitSha)) {
    return { deploy: false, reason: "No commit to build." };
  }
  if (event.branch !== productionBranch) {
    return {
      deploy: false,
      reason: `Push was to ${event.branch}, not ${productionBranch}.`,
    };
  }
  return { deploy: true, reason: `Push to ${productionBranch}.` };
}
