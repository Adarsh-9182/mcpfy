import * as React from "react";
import { cn } from "../cn";

export type TerminalLine =
  | { kind: "command"; text: string }
  | { kind: "output"; text: string }
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | { kind: "muted"; text: string };

const TONE: Record<TerminalLine["kind"], string> = {
  command: "text-fg",
  output: "text-muted",
  success: "text-success",
  error: "text-danger",
  muted: "text-faint",
};

const GLYPH: Record<TerminalLine["kind"], string> = {
  command: "$",
  output: " ",
  success: "✓",
  error: "✕",
  muted: " ",
};

/** A terminal transcript. Static by design — animation is the caller's job. */
export function Terminal({
  lines,
  title,
  className,
}: {
  lines: TerminalLine[];
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--bg-sunken)]",
        className,
      )}
    >
      {title ? (
        <div className="flex items-center gap-1.5 border-b border-line bg-panel px-3 py-1.5">
          <span className="size-2 rounded-full bg-[var(--border-strong)]" />
          <span className="size-2 rounded-full bg-[var(--border-strong)]" />
          <span className="size-2 rounded-full bg-[var(--border-strong)]" />
          <span className="ml-1.5 font-mono text-2xs text-subtle">{title}</span>
        </div>
      ) : null}
      <div className="overflow-x-auto px-3 py-3 font-mono text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className={cn("flex gap-2 whitespace-pre", TONE[line.kind])}>
            <span aria-hidden="true" className="select-none text-faint">
              {GLYPH[line.kind]}
            </span>
            <span>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
