import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/session";
import { githubConfigured } from "@/lib/env";
import { hasRole } from "@mcpfy/db";
import { CreateServerForm } from "./form";

export const metadata: Metadata = { title: "Create MCP server" };

export default async function NewServerPage() {
  const viewer = await requireViewer("/app/servers/new");
  const canCreate = hasRole(viewer.tenant, "developer");

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          href="/app/servers"
          className="text-2xs text-subtle transition-colors hover:text-accent-text"
        >
          ← Servers
        </Link>
      </nav>

      <h1 className="text-xl font-medium text-hi">Create MCP server</h1>
      <p className="mt-1.5 text-base leading-relaxed text-muted">
        Connect a server you already run, or create an empty one and deploy
        into it from the CLI.
      </p>

      {canCreate ? (
        <div className="mt-6">
          <CreateServerForm githubReady={githubConfigured} />
        </div>
      ) : (
        <p
          role="alert"
          className="mt-6 rounded-[var(--radius-md)] border border-warning-border bg-warning-surface px-3 py-2.5 text-base text-warning"
        >
          Your role in {viewer.organization.name} is{" "}
          <span className="font-mono">{viewer.tenant.role}</span>, which cannot
          create servers. Ask an admin to grant you the developer role.
        </p>
      )}
    </div>
  );
}
