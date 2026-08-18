"use client";

import * as React from "react";
import { cn } from "../cn";

/**
 * CSS-positioned tooltip that shows on hover *and* keyboard focus. It carries
 * the label via aria-describedby rather than title, so it is announced
 * predictably and does not fight the browser's own tooltip.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = React.useId();
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {React.cloneElement(children, { "aria-describedby": id })}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap",
          "rounded-[var(--radius-sm)] border border-line-default bg-elevated px-2 py-1",
          "text-2xs text-fg opacity-0 shadow-[var(--shadow-panel)] transition-opacity duration-100",
          "group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}
