import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/#deploy", label: "Deployments" },
      { href: "/#gateway", label: "Gateway" },
      { href: "/#inspector", label: "Inspector" },
      { href: "/#observability", label: "Observability" },
      { href: "/#security", label: "Security" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs#quickstart", label: "Quickstart" },
      { href: "/docs#connect", label: "Connect a client" },
      { href: "/docs#telemetry", label: "Telemetry" },
    ],
  },
  {
    title: "Open source",
    links: [
      { href: "/open-source", label: "Overview" },
      { href: "https://github.com/mcpfyy/mcpfy", label: "GitHub" },
      { href: "https://www.npmjs.com/package/mcpfy-sdk", label: "mcpfy-sdk" },
      {
        href: "https://github.com/mcpfyy/mcpfy/blob/main/ROADMAP.md",
        label: "Roadmap",
      },
      {
        href: "https://github.com/mcpfyy/mcpfy/blob/main/CONTRIBUTING.md",
        label: "Contributing",
      },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-[var(--bg-raised)]">
      <div className="mx-auto max-w-[1180px] px-6 lg:px-8">
        {/* Closing call to action, inside the footer rather than as its own
            section — the page has already made its case by this point. */}
        <div className="border-b border-line py-14 text-center">
          <h2
            className="mx-auto max-w-xl text-2xl font-semibold text-hi lg:text-4xl"
            style={{ lineHeight: "1.08", letterSpacing: "var(--tracking-display)" }}
          >
            Make your software reachable by agents.
          </h2>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-[var(--radius-md)] bg-accent px-4 py-2.5 text-base font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Start building
            </Link>
            <Link
              href="/docs"
              className="rounded-[var(--radius-md)] border border-line-default bg-panel px-4 py-2.5 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Read the docs
            </Link>
          </div>
        </div>

        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[15px] font-semibold tracking-tight text-hi">
                MCPfy
              </span>
            </div>
            <p className="mt-3 max-w-[17rem] text-base leading-relaxed text-subtle">
              Infrastructure for the agent ecosystem. The SDK is MIT licensed
              and built in the open.
            </p>
            <a
              href="/prompt.md"
              className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-default px-2.5 py-1.5 font-mono text-2xs text-subtle transition-colors hover:border-line-strong hover:text-fg"
            >
              /prompt.md
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-2xs font-medium uppercase tracking-[0.14em] text-faint">
                {column.title}
              </h2>
              <ul className="mt-3.5 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-base text-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5">
          <p className="font-mono text-2xs text-faint">
            © {new Date().getFullYear()} MCPfy · MIT
          </p>
          <p className="font-mono text-2xs text-faint">
            Built with mcpfy-sdk
          </p>
        </div>
      </div>
    </footer>
  );
}
