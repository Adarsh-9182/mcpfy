"use client";

import { useActionState } from "react";
import { Badge, StatusDot, cn, type Status } from "@mcpfy/ui";
import { checkHealthAction } from "../actions";

/**
 * Health, with the one thing a status badge usually omits: when it was last
 * verified. A green dot from an hour ago is not the same claim as a green dot
 * from four seconds ago, and only one of them is worth trusting.
 */
export function HealthBadge({
  serverId,
  health,
  detail,
  checkedAt,
  stale,
}: {
  serverId: string;
  health: Status;
  detail: string | null;
  checkedAt: string | null;
  stale: boolean;
}) {
  const [state, action, pending] = useActionState(checkHealthAction, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="serverId" value={serverId} />
      <StatusDot status={health} />
      {detail ? (
        <span className="text-2xs text-subtle">{detail}</span>
      ) : null}
      <span
        className={cn(
          "font-mono text-2xs",
          stale ? "text-warning" : "text-faint",
        )}
        title={checkedAt ?? undefined}
      >
        {checkedAt ? `checked ${ago(checkedAt)}` : "never checked"}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-xs)] border border-line-default px-1.5 py-0.5 font-mono text-2xs text-subtle transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
      >
        {pending ? "checking…" : "check now"}
      </button>
      {state.error ? (
        <Badge tone="danger">{state.error}</Badge>
      ) : null}
    </form>
  );
}

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
