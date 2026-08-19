import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ToastProvider } from "@mcpfy/ui";
import { auth } from "@/lib/auth";
import { getViewer } from "@/lib/session";
import { Wordmark } from "@/components/marketing/logo";
import { CommandHint, DashboardCommands, DashboardNav } from "./nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "./account-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();

  if (!viewer) {
    // Distinguish "not signed in" from "signed in but no organization yet",
    // otherwise a new account bounces between /login and /app forever.
    const session = await auth.api.getSession({ headers: await headers() });
    redirect(session?.user ? "/onboarding" : "/login?next=/app");
  }

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-base text-fg">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-[var(--bg-raised)] lg:flex">
          <div className="flex h-12 shrink-0 items-center border-b border-line px-3">
            <Link href="/app" aria-label="MCPfy dashboard">
              <Wordmark />
            </Link>
          </div>
          <DashboardNav />
          <div className="border-t border-line px-3 py-2.5">
            <p className="truncate text-2xs text-faint">
              {viewer.organization.name}
            </p>
            <p className="mt-0.5 font-mono text-2xs text-faint">
              {viewer.tenant.role}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--bg-base)_86%,transparent)] px-4 backdrop-blur-md lg:px-6">
            <Link
              href="/app"
              className="flex items-center gap-2 lg:hidden"
              aria-label="MCPfy dashboard"
            >
              <Wordmark />
            </Link>
            <span className="hidden truncate text-base text-muted lg:block">
              {viewer.organization.name}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <CommandHint />
              <ThemeToggle className="hidden sm:flex" />
              <AccountMenu
                name={viewer.user.name}
                email={viewer.user.email}
              />
            </div>
          </header>

          <main id="main" className="min-w-0 flex-1 px-4 py-5 lg:px-6">
            {children}
          </main>
        </div>
      </div>
      <DashboardCommands />
    </ToastProvider>
  );
}
