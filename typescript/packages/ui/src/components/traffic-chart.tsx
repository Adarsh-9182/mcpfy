"use client";

import * as React from "react";
import { cn } from "../cn";

export interface TrafficBucket {
  at: string;
  ok: number;
  errors: number;
  p95: number | null;
}

/**
 * Requests over time, stacked as volume and errors.
 *
 * Two series rather than one so a spike in failures is visible inside the
 * total instead of hiding behind it. They share a unit — requests — so they
 * share an axis; a second y-scale for latency would be the classic dual-axis
 * mistake, and latency gets its own row in the tooltip instead.
 */
export function TrafficChart({
  buckets,
  unit,
  className,
}: {
  buckets: TrafficBucket[];
  /** Bucket width, used to describe the axis in words. */
  unit: "hour" | "day";
  className?: string;
}) {
  const [active, setActive] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  const max = Math.max(1, ...buckets.map((b) => b.ok + b.errors));
  const total = buckets.reduce((sum, b) => sum + b.ok + b.errors, 0);

  if (buckets.length === 0 || total === 0) {
    return (
      <div
        className={cn(
          "flex h-48 items-center justify-center rounded-[var(--radius-lg)] border border-line bg-surface",
          className,
        )}
      >
        <p className="text-2xs text-subtle">
          No requests in this period.
        </p>
      </div>
    );
  }

  const shown = active !== null ? buckets[active] : undefined;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-hi">Requests</h3>
          <p className="mt-0.5 text-2xs text-subtle">
            per {unit} · {total.toLocaleString()} total
          </p>
        </div>
        {/* Legend is always present for two series: identity is never colour alone. */}
        <ul className="flex items-center gap-3.5">
          {[
            { label: "Succeeded", color: "var(--chart-volume)" },
            { label: "Failed", color: "var(--chart-error)" },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-[2px]"
                style={{ background: item.color }}
              />
              <span className="text-2xs text-muted">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        ref={ref}
        className="relative mt-4"
        onMouseLeave={() => setActive(null)}
      >
        <div className="flex h-40 items-end gap-[2px]">
          {buckets.map((bucket, i) => {
            const stack = bucket.ok + bucket.errors;
            const height = stack === 0 ? 0 : (stack / max) * 100;
            const errorShare = stack === 0 ? 0 : (bucket.errors / stack) * 100;

            return (
              <button
                key={bucket.at}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                aria-label={`${formatBucket(bucket.at, unit)}: ${bucket.ok} succeeded, ${bucket.errors} failed`}
                className={cn(
                  "group relative flex h-full flex-1 cursor-default flex-col justify-end",
                  "rounded-t-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]",
                )}
              >
                {/* Hover target spans the full height, not just the bar. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 rounded-t-[2px] transition-colors",
                    active === i && "bg-panel",
                  )}
                />
                {stack > 0 ? (
                  <span
                    aria-hidden="true"
                    className="relative flex w-full flex-col justify-end overflow-hidden rounded-t-[3px]"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  >
                    {bucket.errors > 0 ? (
                      <span
                        className="w-full shrink-0 rounded-t-[3px]"
                        style={{
                          height: `${errorShare}%`,
                          background: "var(--chart-error)",
                          // A hairline of surface between the segments so the
                          // boundary reads without relying on hue alone.
                          marginBottom: bucket.ok > 0 ? 2 : 0,
                        }}
                      />
                    ) : null}
                    {bucket.ok > 0 ? (
                      <span
                        className="w-full flex-1"
                        style={{ background: "var(--chart-volume)" }}
                      />
                    ) : null}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="relative h-px w-full"
                    style={{ background: "var(--chart-grid)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {shown ? (
          <div
            role="status"
            className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-[var(--radius-md)] border border-line-default bg-elevated px-2.5 py-2 shadow-[var(--shadow-overlay)]"
          >
            <p className="font-mono text-2xs text-subtle">
              {formatBucket(shown.at, unit)}
            </p>
            <dl className="mt-1 flex flex-col gap-0.5">
              <Row color="var(--chart-volume)" label="Succeeded" value={shown.ok} />
              <Row color="var(--chart-error)" label="Failed" value={shown.errors} />
              {shown.p95 !== null ? (
                <div className="mt-0.5 flex items-center gap-2 border-t border-line pt-1">
                  <dt className="text-2xs text-subtle">p95</dt>
                  <dd className="ml-auto font-mono text-2xs tabular-nums text-fg">
                    {shown.p95}ms
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between font-mono text-2xs text-faint">
        <span>{formatBucket(buckets[0]!.at, unit)}</span>
        <span>{formatBucket(buckets[buckets.length - 1]!.at, unit)}</span>
      </div>
    </div>
  );
}

function Row({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-[1px]"
        style={{ background: color }}
      />
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className="ml-auto font-mono text-2xs tabular-nums text-fg">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function formatBucket(iso: string, unit: "hour" | "day"): string {
  const date = new Date(iso);
  return unit === "hour"
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
      })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
