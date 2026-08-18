import Link from "next/link";
import { Button } from "@mcpfy/ui";
import { Wordmark } from "./logo";

/**
 * Only routes that exist are linked. §48 forbids dead buttons, and a nav
 * entry that 404s is the most visible kind. Sections still being built are
 * absent rather than stubbed.
 */
const NAV = [
  { href: "/#inspector", label: "Inspector" },
  { href: "/#observability", label: "Observability" },
  { href: "/#security", label: "Security" },
  { href: "/docs", label: "Docs" },
  { href: "/open-source", label: "Open source" },
] as const;

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--bg-base)_86%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-15 max-w-[1240px] items-center gap-7 px-6 lg:px-8">
        <Link href="/" aria-label="MCPfy home">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-base text-muted transition-colors hover:bg-panel hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/mcpfyy/mcpfy"
            className="hidden rounded-[var(--radius-sm)] px-2.5 py-1.5 text-base text-muted transition-colors hover:bg-panel hover:text-fg sm:block"
          >
            GitHub
          </a>
          {signedIn ? (
            <Link href="/app">
              <Button variant="primary" size="md">
                Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-base text-muted transition-colors hover:bg-panel hover:text-fg"
              >
                Log in
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="md">
                  Start building
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
