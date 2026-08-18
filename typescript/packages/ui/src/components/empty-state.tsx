import * as React from "react";
import { cn } from "../cn";

/**
 * §36 — an empty state must answer three questions: what this is, why it is
 * empty, and what to do next. The props are named after those questions so a
 * caller cannot ship a bare "Nothing here".
 */
export function EmptyState({
  title,
  what,
  why,
  actions,
  icon,
  className,
}: {
  title: string;
  /** What this section is for. */
  what: string;
  /** Why it is currently empty. Omit only when it is self-evident. */
  why?: string;
  actions: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)]",
        "border border-dashed border-line-default bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? <div className="text-faint">{icon}</div> : null}
      <h3 className="text-lg font-medium text-hi">{title}</h3>
      <p className="max-w-sm text-base leading-relaxed text-muted">
        {what}
        {why ? <span className="text-subtle"> {why}</span> : null}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {actions}
      </div>
    </div>
  );
}
