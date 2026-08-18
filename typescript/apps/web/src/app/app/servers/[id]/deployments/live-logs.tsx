"use client";

import * as React from "react";
import { Badge, Button, cn } from "@mcpfy/ui";
import type { DeploymentStatus } from "@mcpfy/db";

export interface LogRow {
  seq: number;
  stream: "stdout" | "stderr" | "system" | string;
  message: string;
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  building: "accent",
  deploying: "accent",
  health_check: "accent",
  live: "success",
  failed: "danger",
  cancelled: "warning",
  rolled_back: "warning",
};

const LABEL: Record<string, string> = {
  queued: "Queued",
  building: "Building",
  deploying: "Deploying",
  health_check: "Health check",
  live: "Live",
  failed: "Failed",
  cancelled: "Cancelled",
  rolled_back: "Rolled back",
};

const TERMINAL = new Set(["live", "failed", "cancelled", "rolled_back"]);

/**
 * §11 — the live log viewer.
 *
 * It subscribes to the SSE stream and appends as lines arrive. Two details
 * matter more than they look: the connection is only opened while the
 * deployment is in flight, and auto-scroll switches off the moment the reader
 * scrolls up — a log that yanks itself back to the bottom while you are
 * reading the error is worse than no log at all.
 */
export function LiveLogs({
  deploymentId,
  initialLines,
  initialStatus,
}: {
  deploymentId: string;
  initialLines: LogRow[];
  initialStatus: DeploymentStatus;
}) {
  const [lines, setLines] = React.useState<LogRow[]>(initialLines);
  const [status, setStatus] = React.useState<string>(initialStatus);
  const [connected, setConnected] = React.useState(false);
  const [follow, setFollow] = React.useState(true);

  const boxRef = React.useRef<HTMLDivElement>(null);
  const lastSeq = React.useRef(
    initialLines.length > 0 ? initialLines[initialLines.length - 1]!.seq : -1,
  );

  React.useEffect(() => {
    if (TERMINAL.has(initialStatus)) return;

    const source = new EventSource(
      `/api/v1/deployments/${deploymentId}/logs?stream=1&after=${lastSeq.current}`,
    );

    source.addEventListener("open", () => setConnected(true));
    source.onopen = () => setConnected(true);

    source.addEventListener("logs", (event) => {
      const batch = JSON.parse((event as MessageEvent).data) as LogRow[];
      if (batch.length === 0) return;
      lastSeq.current = batch[batch.length - 1]!.seq;
      setLines((prev) => [...prev, ...batch]);
    });

    source.addEventListener("status", (event) => {
      setStatus((JSON.parse((event as MessageEvent).data) as { status: string }).status);
    });

    source.addEventListener("done", () => {
      setConnected(false);
      source.close();
      // Pull the server-rendered page back in sync (endpoint URL, timings).
      window.setTimeout(() => window.location.reload(), 400);
    });

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, [deploymentId, initialStatus]);

  React.useEffect(() => {
    if (!follow) return;
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines, follow]);

  function onScroll() {
    const box = boxRef.current;
    if (!box) return;
    const atBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    setFollow(atBottom);
  }

  const inFlight = !TERMINAL.has(status);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>
            {LABEL[status] ?? status}
          </Badge>
          <span className="font-mono text-2xs text-faint">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {inFlight ? (
            <span className="flex items-center gap-1.5 font-mono text-2xs text-subtle">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connected ? "bg-success" : "bg-warning",
                )}
                aria-hidden="true"
              />
              {connected ? "streaming" : "reconnecting"}
            </span>
          ) : null}
          {!follow ? (
            <Button
              size="sm"
              onClick={() => {
                setFollow(true);
                const box = boxRef.current;
                if (box) box.scrollTop = box.scrollHeight;
              }}
            >
              Jump to end
            </Button>
          ) : null}
        </div>
      </div>

      <div
        ref={boxRef}
        onScroll={onScroll}
        // A log region is scrollable, so it must be reachable by keyboard.
        tabIndex={0}
        role="log"
        aria-label="Deployment log"
        aria-live={inFlight ? "polite" : "off"}
        className="max-h-[26rem] overflow-y-auto bg-[var(--bg-sunken)] px-3 py-2.5 font-mono text-sm leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-faint">Waiting for output…</p>
        ) : (
          lines.map((line) => (
            <div
              key={line.seq}
              className={cn(
                "flex gap-2 whitespace-pre-wrap break-all",
                line.stream === "system"
                  ? "text-accent-text"
                  : line.stream === "stderr"
                    ? "text-warning"
                    : "text-muted",
              )}
            >
              <span className="select-none text-faint" aria-hidden="true">
                {String(line.seq).padStart(4, " ")}
              </span>
              <span>{line.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
