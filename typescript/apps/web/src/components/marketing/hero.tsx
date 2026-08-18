import Link from "next/link";
import { Button, Terminal, type TerminalLine } from "@mcpfy/ui";
import { DeploymentPipeline } from "./pipeline";

/**
 * The command is the one that actually exists on npm. §6 sketched
 * `create-mcpfy`; the published package is `create-mcpfy-app`, and printing a
 * command that 404s on the busiest line of the site is not a detail worth
 * losing to a spec typo.
 */
const BOOTSTRAP: TerminalLine[] = [
  { kind: "command", text: "npx create-mcpfy-app@latest my-server" },
  { kind: "success", text: "MCP server created" },
  { kind: "success", text: "4 tools detected" },
  { kind: "success", text: "Inspector ready" },
  { kind: "success", text: "Deployment ready" },
  { kind: "muted", text: "" },
  { kind: "command", text: "cd my-server && mcpfy deploy" },
];

const STATS = [
  { value: "1.42M", label: "Requests routed" },
  { value: "184ms", label: "p95 latency" },
  { value: "0.12%", label: "Error rate" },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Single soft accent wash — restrained, per §28. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.16]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, var(--violet-500), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1240px] px-6 pb-16 pt-20 lg:px-8 lg:pb-20 lg:pt-24">
        <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent-text">
          MCP control plane
        </p>

        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-hi lg:text-5xl">
          Build MCP.
          <br />
          Ship everywhere.
        </h1>

        <p className="mt-5 max-w-xl text-md leading-relaxed text-muted">
          Build, deploy, test, secure and observe Model Context Protocol
          servers from one developer platform — then connect them to Claude,
          ChatGPT, Cursor or any MCP client.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/signup">
            <Button variant="primary" size="lg">
              Start building
            </Button>
          </Link>
          <a href="https://github.com/mcpfyy/mcpfy">
            <Button variant="secondary" size="lg">
              View on GitHub
            </Button>
          </a>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="flex flex-col gap-6">
            <Terminal
              title="my-server"
              lines={BOOTSTRAP}
              className="shadow-[var(--shadow-panel)]"
            />
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--border-subtle)]">
              {STATS.map((s) => (
                <div key={s.label} className="bg-surface px-4 py-3.5">
                  <dt className="text-2xs text-subtle">{s.label}</dt>
                  <dd className="mt-1 font-mono text-lg tabular-nums text-hi">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <DeploymentPipeline />
        </div>
      </div>
    </section>
  );
}
