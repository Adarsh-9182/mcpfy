import Link from "next/link";
import { Button } from "@mcpfy/ui";
import { DeploymentPipeline } from "./pipeline";
import { CopyPrompt } from "./copy-prompt";

const STATS = [
  { value: "6s", label: "Repository to live endpoint" },
  { value: "MIT", label: "SDK, CLI and inspector" },
  { value: "0", label: "Config files to write" },
] as const;

/**
 * The hero carries the whole page's hierarchy.
 *
 * Everything below is set deliberately smaller so this reads first — the
 * previous version used near-identical sizes throughout, which left nothing
 * looking more important than anything else.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* A single accent wash and a faint grid — depth without decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-[0.14]"
        style={{
          background:
            "radial-gradient(52% 90% at 50% -10%, var(--violet-500), transparent 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(70% 55% at 50% 0%, #000 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(70% 55% at 50% 0%, #000 20%, transparent 78%)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="/docs#platform"
            className="inline-flex items-center gap-2 rounded-full border border-line-default bg-panel px-3 py-1 text-2xs text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            The MCP control plane
            <span aria-hidden="true" className="text-faint">
              →
            </span>
          </Link>

          <h1
            className="mt-6 text-5xl font-semibold text-hi sm:text-6xl lg:text-7xl"
            style={{
              lineHeight: "var(--leading-display)",
              letterSpacing: "var(--tracking-display)",
            }}
          >
            Ship MCP servers
            <br />
            <span className="text-muted">without shipping</span>
            <br />
            infrastructure.
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-md leading-relaxed text-muted lg:text-lg">
            Deploy from a repository, watch the MCP handshake succeed, inspect
            every JSON-RPC frame, and hand the endpoint to Claude, Cursor or
            ChatGPT. One control plane for the whole lifecycle.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button variant="primary" size="lg">
                Start building
              </Button>
            </Link>
            <CopyPrompt />
          </div>

          <dl className="mx-auto mt-12 flex max-w-lg flex-wrap items-start justify-center gap-x-10 gap-y-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <dt className="font-mono text-2xl text-hi tabular-nums">
                  {stat.value}
                </dt>
                <dd className="mt-0.5 text-2xs text-subtle">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto mt-16 max-w-4xl">
          {/* Lifts the panel off the page rather than letting it sit flat. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-8 -bottom-8 top-8 rounded-[var(--radius-xl)] opacity-40 blur-2xl"
            style={{
              background:
                "linear-gradient(160deg, var(--violet-800), transparent 60%)",
            }}
          />
          <div className="relative">
            <DeploymentPipeline />
          </div>
        </div>
      </div>
    </section>
  );
}
