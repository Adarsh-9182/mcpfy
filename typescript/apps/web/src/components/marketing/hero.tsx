import Link from "next/link";
import { Button } from "@mcpfy/ui";
import { NetworkDiagram } from "./network";
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

      <div className="relative mx-auto max-w-[1180px] px-6 pb-14 pt-14 lg:px-8 lg:pb-16 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
          {/* Copy and visual sit side by side so the animation is in view on
              load. Stacked vertically the diagram fell below the fold, which
              made the one interactive thing on the page invisible. */}
          <div className="text-center lg:text-left">
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
              className="mt-5 text-4xl font-semibold text-hi sm:text-5xl lg:text-6xl"
              style={{
                lineHeight: "var(--leading-display)",
                letterSpacing: "var(--tracking-display)",
              }}
            >
              Ship MCP servers,
              <br />
              <span className="text-muted">not infrastructure.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-md text-md leading-relaxed text-muted lg:mx-0">
              Deploy from a repository, watch the MCP handshake succeed, inspect
              every JSON-RPC frame, and hand the endpoint to Claude, Cursor or
              ChatGPT.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link href="/signup">
                <Button variant="primary" size="lg">
                  Start building
                </Button>
              </Link>
              <CopyPrompt />
            </div>

            <dl className="mt-9 flex flex-wrap items-start justify-center gap-x-9 gap-y-4 lg:justify-start">
              {STATS.map((stat) => (
                <div key={stat.label} className="text-center lg:text-left">
                  <dt className="font-mono text-lg text-hi tabular-nums">
                    {stat.value}
                  </dt>
                  <dd className="mt-0.5 text-2xs text-subtle">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <NetworkDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
