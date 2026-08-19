"use client";

import Link from "next/link";
import type { Route } from "next";
import { cn } from "@mcpfy/ui";

const RANGES = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
] as const;

/**
 * The range lives in the URL, not in component state, so a view can be
 * linked, bookmarked and shared. "Look at this spike" should be a URL.
 */
export function RangeTabs({
  serverId,
  range,
}: {
  serverId: string;
  range: string;
}) {
  return (
    <nav
      aria-label="Time range"
      className="flex items-center gap-px rounded-[var(--radius-md)] border border-line-default bg-panel p-0.5"
    >
      {RANGES.map((option) => (
        <Link
          key={option.value}
          href={
            `/app/servers/${serverId}/analytics?range=${option.value}` as Route
          }
          aria-current={range === option.value ? "page" : undefined}
          className={cn(
            "rounded-[var(--radius-sm)] px-2.5 py-1 font-mono text-2xs transition-colors",
            range === option.value
              ? "bg-elevated text-hi"
              : "text-subtle hover:text-fg",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
