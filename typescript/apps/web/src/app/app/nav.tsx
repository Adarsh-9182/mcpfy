"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CommandMenu, cn, type Command } from "@mcpfy/ui";
import { authClient } from "@/lib/auth-client";

/**
 * §8 — the sidebar, grouped by where a task sits in the server lifecycle.
 *
 * The full information architecture is shown so the shape of the product is
 * legible, but only sections that exist are links. The rest are rendered as
 * disabled with the phase that delivers them, which is honest about what is
 * built without hiding where it is going (§48: no dead buttons).
 */
type NavItem =
  | {
      href:
        | "/app"
        | "/app/servers"
        | "/app/settings/api-keys"
        | "/app/settings/sessions";
      label: string;
      exact?: boolean;
    }
  | { label: string; phase: string };

/** Features that exist but only inside a server, so there is no org-wide page. */
const PER_SERVER = "per server";

const SECTIONS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: "/app", label: "Overview", exact: true }],
  },
  {
    label: "Build",
    items: [
      { href: "/app/servers", label: "Servers" },
      { label: "Templates", phase: "Phase 5" },
      { label: "Registry", phase: "Phase 5" },
    ],
  },
  {
    label: "Develop",
    items: [
      // Both exist. They live under a server rather than the organization,
      // because inspecting or listing tools without one is meaningless.
      { label: "Inspector", phase: PER_SERVER },
      { label: "Registry", phase: PER_SERVER },
    ],
  },
  {
    label: "Operate",
    items: [
      { label: "Deployments", phase: PER_SERVER },
      { label: "Analytics", phase: PER_SERVER },
      { label: "Logs", phase: "Phase 5" },
      { label: "Sessions", phase: "Phase 5" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/app/settings/api-keys", label: "API keys" },
      { href: "/app/settings/sessions", label: "Sessions" },
      { label: "Team", phase: "Phase 7" },
    ],
  },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex flex-1 flex-col overflow-y-auto py-1">
      {SECTIONS.map((section, i) => (
        <div key={section.label ?? `root-${i}`} className="px-2 py-1.5">
          {section.label ? (
            <p className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wider text-faint">
              {section.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-px">
            {section.items.map((item) => {
              if (!("href" in item)) {
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled="true"
                      title={
                        item.phase === PER_SERVER
                          ? "Open a server to use this"
                          : `Arrives in ${item.phase}`
                      }
                      className="flex cursor-not-allowed items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-base text-faint"
                    >
                      {item.label}
                      <span className="ml-auto font-mono text-2xs text-faint/70">
                        {item.phase}
                      </span>
                    </span>
                  </li>
                );
              }
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-base transition-colors",
                      active
                        ? "bg-panel text-hi"
                        : "text-muted hover:bg-panel hover:text-fg",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * §30 — the palette. Commands that need a specific server are not listed
 * here; they are contributed by the server pages themselves once one is
 * selected, rather than being listed and then failing.
 */
export function DashboardCommands() {
  const router = useRouter();

  const commands: Command[] = [
    {
      id: "create-server",
      label: "Create MCP server",
      group: "Build",
      keywords: "new add deploy",
      run: () => router.push("/app/servers/new"),
    },
    {
      id: "servers",
      label: "Go to servers",
      group: "Navigate",
      run: () => router.push("/app/servers"),
    },
    {
      id: "overview",
      label: "Go to overview",
      group: "Navigate",
      run: () => router.push("/app"),
    },
    {
      id: "api-keys",
      label: "Manage API keys",
      group: "Settings",
      keywords: "token credential gateway",
      run: () => router.push("/app/settings/api-keys"),
    },
    {
      id: "docs",
      label: "Open documentation",
      group: "Help",
      run: () => router.push("/docs"),
    },
    {
      id: "sign-out",
      label: "Sign out",
      group: "Account",
      run: async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      },
    },
  ];

  return <CommandMenu commands={commands} />;
}

export function CommandHint() {
  return (
    <span className="hidden items-center gap-1 rounded-[var(--radius-sm)] border border-line-default px-1.5 py-0.5 font-mono text-2xs text-faint sm:flex">
      ⌘K
    </span>
  );
}
