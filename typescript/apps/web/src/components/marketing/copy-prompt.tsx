"use client";

import * as React from "react";
import { Button } from "@mcpfy/ui";

/**
 * Hands a coding agent everything it needs to build against MCPfy.
 *
 * The text is served from /prompt.md, so what gets pasted into Claude Code or
 * Cursor is the same document a person can read — one source, not a marketing
 * button with its own private copy that drifts.
 */
export function CopyPrompt() {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      const response = await fetch("/prompt.md");
      if (!response.ok) throw new Error("unavailable");
      await navigator.clipboard.writeText(await response.text());
      setState("copied");
    } catch {
      // Clipboard is blocked over plain HTTP and in some embedded views.
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2400);
  }

  return (
    <Button variant="secondary" size="lg" onClick={copy}>
      {state === "copied"
        ? "Copied — paste into your agent"
        : state === "failed"
          ? "Open /prompt.md instead"
          : "Copy prompt for agents"}
    </Button>
  );
}
