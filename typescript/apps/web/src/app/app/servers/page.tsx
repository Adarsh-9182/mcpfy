import type { Metadata } from "next";
import Link from "next/link";
import { Button, DataTable, EmptyState, StatusDot, type Column } from "@mcpfy/ui";
import { requireViewer } from "@/lib/session";
import { listServers, type ServerSummary } from "@/lib/servers";

export const metadata: Metadata = { title: "Servers" };

const nf = new Intl.NumberFormat("en", { notation: "compact" });

const COLUMNS: Column<ServerSummary>[] = [
  { key: "name", header: "Server", render: (s) => s.name, mono: true },
  {
    key: "status",
    header: "Status",
    render: (s) => <StatusDot status={s.health} />,
  },
  {
    key: "endpoint",
    header: "Endpoint",
    mono: true,
    render: (s) => (
      <span className="text-subtle">{s.endpointUrl ?? "not deployed"}</span>
    ),
  },
  {
    key: "requests",
    header: "Requests 24h",
    align: "right",
    mono: true,
    render: (s) => (s.requests24h === 0 ? "—" : nf.format(s.requests24h)),
  },
  {
    key: "p95",
    header: "p95",
    align: "right",
    mono: true,
    render: (s) => (s.p95LatencyMs === null ? "—" : `${s.p95LatencyMs}ms`),
  },
];

export default async function ServersPage() {
  const viewer = await requireViewer("/app/servers");
  const servers = await listServers(viewer.tenant);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-hi">Servers</h1>
          <p className="mt-1 text-base text-muted">
            {servers.length === 0
              ? "Nothing here yet."
              : `${servers.length} server${servers.length === 1 ? "" : "s"} in ${viewer.organization.name}.`}
          </p>
        </div>
        <Link href="/app/servers/new">
          <Button variant="primary" size="md">
            Create MCP server
          </Button>
        </Link>
      </div>

      <DataTable
        caption="MCP servers in this organization with their health and 24-hour traffic"
        columns={COLUMNS}
        rows={servers}
        rowKey={(s) => s.id}
        rowHref={(s) => `/app/servers/${s.id}`}
        empty={
          <EmptyState
            title="No MCP servers yet"
            what="A server is what you deploy, inspect and hand to an MCP client."
            why="Nothing has been created in this organization."
            actions={
              <>
                <Link href="/app/servers/new">
                  <Button variant="primary" size="md">
                    Create server
                  </Button>
                </Link>
                <Link href="/docs">
                  <Button variant="secondary" size="md">
                    Read the quickstart
                  </Button>
                </Link>
              </>
            }
          />
        }
      />
    </>
  );
}
