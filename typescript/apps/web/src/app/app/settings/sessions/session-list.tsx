"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, cn } from "@mcpfy/ui";
import { authClient } from "@/lib/auth-client";

interface Row {
  id: string;
  current: boolean;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

export function SessionList({ sessions }: { sessions: Row[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const others = sessions.filter((s) => !s.current).length;

  async function revokeOthers() {
    setPending(true);
    setError(null);

    // revokeOtherSessions, not revokeSessions: signing yourself out while
    // trying to secure an account is a confusing way to succeed.
    const result = await authClient.revokeOtherSessions();
    setPending(false);
    setConfirming(false);

    if (result.error) {
      setError(result.error.message ?? "The sessions could not be ended.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                session.current ? "bg-success" : "bg-faint",
              )}
            />
            <span className="text-base text-hi">{session.device}</span>
            {session.current ? <Badge tone="success">this browser</Badge> : null}
            <span className="ml-auto font-mono text-2xs text-faint">
              {session.ipAddress ?? "no ip"} · started{" "}
              {session.createdAt.replace("T", " ").slice(0, 16)}
            </span>
          </li>
        ))}
      </ul>

      {others > 0 ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-danger-border bg-danger-surface px-4 py-3">
            <p className="text-base text-danger">
              Sign out {others} other session{others === 1 ? "" : "s"}? This
              browser stays signed in.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button size="md" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={pending}
                onClick={revokeOthers}
              >
                Sign them out
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant="secondary" size="md" onClick={() => setConfirming(true)}>
              Sign out all other sessions
            </Button>
            {error ? (
              <p role="alert" className="mt-2 text-2xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        )
      ) : (
        <p className="text-2xs text-subtle">
          This is the only browser signed in.
        </p>
      )}
    </div>
  );
}
