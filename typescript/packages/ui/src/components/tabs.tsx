"use client";

import * as React from "react";
import { cn } from "../cn";

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

/**
 * Roving-tabindex tabs per the WAI-ARIA pattern: one tab in the tab order,
 * arrow keys move between them, Home/End jump to the ends (§47).
 */
export function Tabs({
  items,
  value,
  onValueChange,
  className,
  label,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  label: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const current = items.findIndex((i) => i.value === value);
    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % items.length;
    else if (e.key === "ArrowLeft")
      next = (current - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;

    e.preventDefault();
    const target = items[next];
    if (target) {
      onValueChange(target.value);
      refs.current[next]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex items-center gap-1 border-b border-line", className)}
    >
      {items.map((item, i) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-base transition-colors",
              active
                ? "border-accent text-hi"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-[var(--radius-xs)] bg-panel px-1 font-mono text-2xs text-subtle">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
