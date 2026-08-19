"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button, cn } from "@mcpfy/ui";
import { Wordmark } from "./logo";

/**
 * A mega-menu, because the product has more surface than a row of links can
 * carry. Every destination here exists — sections that are still being built
 * are absent rather than linked into a 404 (§48).
 *
 * `raw` marks a target that is a document rather than a page (a route
 * handler), which Next's typed routes cannot verify and which should be a
 * plain anchor rather than a client navigation.
 */
type MenuItem =
  | { href: Route; label: string; blurb: string; raw?: false }
  | { href: string; label: string; blurb: string; raw: true };

interface Menu {
  id: string;
  label: string;
  columns: { title: string; items: MenuItem[] }[];
}

const MENUS: Menu[] = [
  {
    id: "platform",
    label: "Platform",
    columns: [
      {
        title: "Operate",
        items: [
          {
            href: "/#gateway",
            label: "Gateway",
            blurb: "One authenticated path between agents and your servers.",
          },
          {
            href: "/#inspector",
            label: "Inspector",
            blurb: "Execute tools and read the JSON-RPC underneath.",
          },
          {
            href: "/#observability",
            label: "Observability",
            blurb: "Traces, latency and errors indexed by trace id.",
          },
        ],
      },
      {
        title: "Ship",
        items: [
          {
            href: "/#deploy",
            label: "Deployments",
            blurb: "Build from a repository, health-check, go live.",
          },
          {
            href: "/#security",
            label: "Security",
            blurb: "Per-tool permissions, encrypted secrets, audit log.",
          },
          {
            href: "/docs#connect",
            label: "Distribution",
            blurb: "Generated config for Claude, Cursor and VS Code.",
          },
        ],
      },
    ],
  },
  {
    id: "developers",
    label: "Developers",
    columns: [
      {
        title: "Build",
        items: [
          {
            href: "/docs#quickstart",
            label: "Quickstart",
            blurb: "A working MCP server in one command.",
          },
          {
            href: "/docs#server",
            label: "SDK reference",
            blurb: "Tools, prompts, resources and widgets.",
          },
          {
            href: "/docs#telemetry",
            label: "Telemetry",
            blurb: "Drop-in metrics for any MCP server.",
          },
        ],
      },
      {
        title: "Open source",
        items: [
          {
            href: "/open-source",
            label: "Packages",
            blurb: "MIT licensed, developed in public.",
          },
          {
            href: "/prompt.md",
            label: "Prompt for agents",
            blurb: "Point your coding agent at MCPfy in one paste.",
            // A route handler, not a page: Next's typed routes cannot see it,
            // so it is linked as a plain document rather than a navigation.
            raw: true,
          },
        ],
      },
    ],
  },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A small delay on close, so crossing the gap between trigger and panel
  // does not snap the menu shut mid-movement.
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  };
  const cancelClose = () => clearTimeout(closeTimer.current);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-200",
        scrolled
          ? "border-b border-line bg-[color-mix(in_oklab,var(--bg-base)_82%,transparent)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
      onMouseLeave={scheduleClose}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-1 px-6 lg:px-8">
        <Link href="/" aria-label="MCPfy home" className="mr-4 shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center md:flex">
          {MENUS.map((menu) => (
            <div
              key={menu.id}
              onMouseEnter={() => {
                cancelClose();
                setOpen(menu.id);
              }}
            >
              <button
                type="button"
                aria-expanded={open === menu.id}
                onClick={() => setOpen(open === menu.id ? null : menu.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-base transition-colors",
                  open === menu.id
                    ? "text-hi"
                    : "text-muted hover:text-fg",
                )}
              >
                {menu.label}
                <svg
                  viewBox="0 0 10 6"
                  className={cn(
                    "size-2 transition-transform duration-200",
                    open === menu.id && "rotate-180",
                  )}
                  aria-hidden="true"
                >
                  <path
                    d="M1 1l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}

          <Link
            href="/docs"
            className="rounded-[var(--radius-sm)] px-3 py-1.5 text-base text-muted transition-colors hover:text-fg"
          >
            Docs
          </Link>
          <Link
            href="/open-source"
            className="rounded-[var(--radius-sm)] px-3 py-1.5 text-base text-muted transition-colors hover:text-fg"
          >
            Open source
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/mcpfyy/mcpfy"
            className="hidden items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-default px-2.5 py-1.5 font-mono text-2xs text-muted transition-colors hover:border-line-strong hover:text-fg sm:flex"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
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
                className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-base text-muted transition-colors hover:text-fg"
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

      {/* Panel */}
      {MENUS.map((menu) => (
        <div
          key={menu.id}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={cn(
            "absolute inset-x-0 top-full origin-top border-b border-line bg-[color-mix(in_oklab,var(--bg-raised)_96%,transparent)] backdrop-blur-xl transition-all duration-200",
            open === menu.id
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0",
          )}
          style={{ transitionTimingFunction: "var(--ease-out-expo)" }}
          hidden={open !== menu.id}
        >
          <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-7 md:grid-cols-2 lg:px-8">
            {menu.columns.map((column) => (
              <div key={column.title}>
                <p className="mb-3 text-2xs font-medium uppercase tracking-[0.14em] text-faint">
                  {column.title}
                </p>
                <ul className="flex flex-col gap-1">
                  {column.items.map((item) => {
                    const body = (
                      <>
                        <span className="flex items-center gap-1.5 text-base font-medium text-hi">
                          {item.label}
                          <span
                            aria-hidden="true"
                            className="translate-x-0 text-faint opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                          >
                            →
                          </span>
                        </span>
                        <span className="mt-0.5 block text-2xs leading-relaxed text-subtle">
                          {item.blurb}
                        </span>
                      </>
                    );
                    const className =
                      "group block rounded-[var(--radius-md)] px-3 py-2 transition-colors hover:bg-panel";

                    return (
                      <li key={item.href}>
                        {item.raw ? (
                          <a
                            href={item.href}
                            onClick={() => setOpen(null)}
                            className={className}
                          >
                            {body}
                          </a>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setOpen(null)}
                            className={className}
                          >
                            {body}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </header>
  );
}
