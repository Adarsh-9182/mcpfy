import * as React from "react";
import { cn } from "../cn";

/**
 * §9 — a metric tile. Every tile takes an `href`: the design brief's rule is
 * "every metric leads somewhere", so a tile that goes nowhere is a bug, and
 * making the prop required is how that stays true.
 */
export function MetricCard({
  label,
  value,
  unit,
  hint,
  href,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** The link text, e.g. "Last 24h →". */
  hint: string;
  href: string;
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
}) {
  const valueTone = {
    default: "text-hi",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <a
      href={href}
      className={cn(
        "group flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4",
        "transition-colors hover:border-line-strong hover:bg-panel",
        className,
      )}
    >
      <span className="text-2xs font-medium uppercase tracking-wider text-subtle">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn("font-mono text-2xl leading-none tabular-nums", valueTone)}
        >
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-xs text-subtle">{unit}</span>
        ) : null}
      </span>
      <span className="text-2xs text-faint transition-colors group-hover:text-accent-text">
        {hint}
      </span>
    </a>
  );
}
