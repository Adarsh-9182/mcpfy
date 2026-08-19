/**
 * The open-source stage.
 *
 * The other sections that used to live here were replaced by lifecycle.tsx,
 * comparison.tsx and faq.tsx, which vary their shape rather than repeating
 * one layout down the page.
 *
 * Note what this section does *not* have: download counters or star counts.
 * MCPfy's numbers are small, and a metrics row is a claim about traction —
 * making that claim with small numbers reads worse than not making it. What
 * is true and worth saying is that the primitives are MIT and standalone.
 */
const PACKAGES = [
  {
    name: "mcpfy-sdk",
    version: "0.2.3",
    blurb:
      "Tools, prompts, resources and widgets over HTTP and stdio, with the official SDK underneath whenever you need it.",
    href: "https://www.npmjs.com/package/mcpfy-sdk",
  },
  {
    name: "create-mcpfy-app",
    version: "0.2.2",
    blurb:
      "A working MCP server — one tool, one prompt, one resource, TypeScript configured — in a single command.",
    href: "https://www.npmjs.com/package/create-mcpfy-app",
  },
  {
    name: "mcpfy-pulse",
    version: "0.1.2",
    blurb:
      "Drop-in telemetry for any MCP server. Records method, duration and outcome; never argument values.",
    href: "https://www.npmjs.com/package/mcpfy-pulse",
  },
] as const;

export function OpenSource() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <span className="font-mono text-2xs uppercase tracking-[0.16em] text-accent-text">
              Open source
            </span>
            <h2
              className="mt-4 text-3xl font-semibold text-hi lg:text-4xl"
              style={{
                lineHeight: "1.08",
                letterSpacing: "var(--tracking-display)",
              }}
            >
              The parts that run on your machine are yours.
            </h2>
            <p className="mt-3 text-md leading-relaxed text-muted">
              The SDK, the scaffolder and the telemetry proxy are MIT licensed
              and work standalone — no account required. The hosted control
              plane is what you pay for. That is the whole rule.
            </p>
          </div>
          <a
            href="https://github.com/mcpfyy/mcpfy"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-2 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            View on GitHub
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        <ul className="mt-9 grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-line bg-[var(--border-subtle)] sm:grid-cols-3">
          {PACKAGES.map((pkg) => (
            <li key={pkg.name} className="bg-surface">
              <a
                href={pkg.href}
                className="group flex h-full flex-col p-5 transition-colors hover:bg-panel"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-base text-hi">{pkg.name}</span>
                  <span className="font-mono text-2xs text-faint">
                    v{pkg.version}
                  </span>
                </span>
                <span className="mt-2 flex-1 text-2xs leading-relaxed text-muted">
                  {pkg.blurb}
                </span>
                <span className="mt-4 text-2xs text-faint transition-colors group-hover:text-accent-text">
                  npm ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
