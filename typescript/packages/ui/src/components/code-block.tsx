"use client";

import * as React from "react";
import { cn } from "../cn";

/**
 * A code surface with a copy button. Deliberately not a syntax highlighter —
 * highlighting arrives with the docs renderer in §31; shipping a half-working
 * tokeniser here would be worse than honest monospace.
 */
export function CodeBlock({
  code,
  language,
  filename,
  className,
  copyable = true,
}: {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded views.
      // Selecting the text still works, so failing quietly is correct here.
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-line bg-raised",
        className,
      )}
    >
      {(filename || language || copyable) && (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-panel px-3 py-1.5">
          <span className="font-mono text-2xs text-subtle">
            {filename ?? language}
          </span>
          {copyable ? (
            <button
              type="button"
              onClick={copy}
              className="rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-2xs text-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              {copied ? "copied" : "copy"}
              <span className="sr-only"> code to clipboard</span>
            </button>
          ) : null}
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-3">
        <code className="font-mono text-sm leading-relaxed text-fg">{code}</code>
      </pre>
    </div>
  );
}
