import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#inspector", label: "Inspector" },
      { href: "/#observability", label: "Observability" },
      { href: "/#security", label: "Security" },
      { href: "/signup", label: "Get started" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs#quickstart", label: "Quickstart" },
      { href: "/docs#telemetry", label: "Telemetry" },
      {
        href: "https://github.com/mcpfyy/mcpfy/blob/main/ROADMAP.md",
        label: "Roadmap",
      },
    ],
  },
  {
    title: "Open source",
    links: [
      { href: "/open-source", label: "Overview" },
      { href: "https://github.com/mcpfyy/mcpfy", label: "GitHub" },
      { href: "https://www.npmjs.com/package/mcpfy-sdk", label: "mcpfy-sdk" },
      {
        href: "https://www.npmjs.com/package/mcpfy-pulse",
        label: "mcpfy-pulse",
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
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-hi">
              MCPfy
            </span>
          </div>
          <p className="mt-3 max-w-[15rem] text-base leading-relaxed text-subtle">
            Infrastructure for the agent ecosystem. MIT licensed, built in the
            open.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-2xs font-medium uppercase tracking-wider text-faint">
              {col.title}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {col.links.map((link) => (
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
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-4 lg:px-8">
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
