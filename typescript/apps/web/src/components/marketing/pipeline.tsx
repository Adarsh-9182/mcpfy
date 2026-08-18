"use client";

import * as React from "react";
import { StatusDot } from "@mcpfy/ui";

/**
 * §6 — the product visualization under the hero.
 *
 * It walks the real pipeline stages in order and pauses on hover so a reader
 * can actually study a step. It is explicitly labelled as a simulation: it
 * animates on a timer rather than pretending to poll a deployment, which is
 * the line §48 draws between a demo and a fake dashboard.
 */

const STEPS = [
  { n: "01", label: "Connect repository", detail: "mcpfyy/customer-mcp" },
  { n: "02", label: "Detect MCP server", detail: "mcpfy-sdk · node 22" },
  { n: "03", label: "Build", detail: "pnpm build · 18s" },
  { n: "04", label: "Test tools", detail: "14/14 passing" },
  { n: "05", label: "Deploy", detail: "iad1 · streamable http" },
  { n: "06", label: "Receive traffic", detail: "Claude · Cursor" },
  { n: "07", label: "Observe", detail: "p95 81ms · 0 errors" },
] as const;

const STEP_MS = 900;

export function DeploymentPipeline() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // §29 — show the finished state instead of looping.
      setActive(STEPS.length - 1);
      return;
    }
    const id = setInterval(
      () => setActive((i) => (i + 1) % (STEPS.length + 1)),
      STEP_MS,
    );
    return () => clearInterval(id);
  }, [paused]);

  const done = (i: number) => i < active;
  const running = (i: number) => i === active;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-[var(--shadow-panel)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-2xs text-muted">
          <span className="text-hi">customer-mcp</span>
          <span className="text-faint">/</span>
          <span>main</span>
        </div>
        <StatusDot
          status={active >= STEPS.length ? "healthy" : "building"}
          label={active >= STEPS.length ? "Live" : "Deploying"}
        />
      </div>

      <ol className="divide-y divide-[var(--border-subtle)]">
        {STEPS.map((step, i) => (
          <li
            key={step.n}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors"
            style={{
              background: running(i)
                ? "color-mix(in oklab, var(--accent-surface) 60%, transparent)"
                : undefined,
            }}
          >
            <span className="w-6 font-mono text-2xs text-faint">{step.n}</span>
            <span
              className={
                done(i) || active >= STEPS.length
                  ? "flex-1 text-base text-fg"
                  : running(i)
                    ? "flex-1 text-base text-hi"
                    : "flex-1 text-base text-subtle"
              }
            >
              {step.label}
            </span>
            <span className="hidden font-mono text-2xs text-faint sm:block">
              {done(i) || active >= STEPS.length ? step.detail : ""}
            </span>
            <span className="w-4 text-right font-mono text-xs">
              {done(i) || active >= STEPS.length ? (
                <span className="text-success">✓</span>
              ) : running(i) ? (
                <span
                  className="inline-block size-1.5 rounded-full bg-info"
                  style={{ animation: "mcpfy-pulse 1s ease-in-out infinite" }}
                />
              ) : (
                <span className="text-faint">·</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-panel px-4 py-2.5">
        <span className="truncate font-mono text-2xs text-subtle">
          https://customer-mcp.mcpfy.app/mcp
        </span>
        <span className="shrink-0 font-mono text-2xs text-faint">
          Simulated · pauses on hover
        </span>
      </div>
    </div>
  );
}
