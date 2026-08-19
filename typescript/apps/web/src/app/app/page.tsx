import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, MetricCard, StatusDot } from "@mcpfy/ui";
import { requireViewer } from "@/lib/session";
import { listServers, orgOverview } from "@/lib/servers";

export const metadata: Metadata = { title: "Overview" };

const nf = new Intl.NumberFormat("en", { notation: "compact" });

export default async function OverviewPage() {
  const viewer = await requireViewer("/app");
  const [overview, servers] = await Promise.all([
    orgOverview(viewer.tenant),
    listServers(viewer.tenant),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-hi">Overview</h1>
          <p className="mt-1 text-base text-muted">
            {viewer.organization.name}
          </p>
        </div>
        <Link href="/app/servers/new">
          <Button variant="primary" size="md">
            Create MCP server
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          as={Link}
          label="Servers"
          value={overview.serverCount}
          hint="View all →"
          href="/app/servers"
        />
        <MetricCard
          label="Requests"
          value={
            overview.requests24h === 0 ? "—" : nf.format(overview.requests24h)
          }
          hint="Per server →"
          href="/app/servers"
          as={Link}
        />
        <MetricCard
          label="Error rate"
          value={
            overview.errorRate24h === null
              ? "—"
              : `${(overview.errorRate24h * 100).toFixed(2)}%`
          }
          tone={
            overview.errorRate24h !== null && overview.errorRate24h > 0.01
              ? "danger"
              : "default"
          }
          hint="Per server →"
          href="/app/servers"
          as={Link}
        />
        <MetricCard
          label="p95 latency"
          value={overview.p95LatencyMs ?? "—"}
          unit={overview.p95LatencyMs === null ? undefined : "ms"}
          hint="Per server →"
          href="/app/servers"
          as={Link}
        />
      </div>

      {overview.neverReceivedTraffic && overview.serverCount > 0 ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-2xs text-subtle">
          No requests recorded yet. Metrics fill in once a deployed server
          starts receiving MCP traffic through the gateway.
        </p>
      ) : null}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-hi">Servers</h2>
          {servers.length > 0 ? (
            <Link
              href="/app/servers"
              className="text-2xs text-subtle transition-colors hover:text-accent-text"
            >
              View all →
            </Link>
          ) : null}
        </div>

        {servers.length === 0 ? (
          <EmptyState
            title="No MCP servers yet"
            what="Servers are the unit you deploy, inspect and connect clients to."
            why="You have not created one in this organization."
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
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {servers.slice(0, 6).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/app/servers/${s.id}`}
                  className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-panel"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-base text-hi">
                      {s.name}
                    </span>
                    <StatusDot status={s.health} />
                  </div>
                  <p className="truncate font-mono text-2xs text-faint">
                    {s.endpointUrl ?? "Not deployed"}
                  </p>
                  <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3">
                    <div>
                      <dt className="text-2xs text-faint">Requests</dt>
                      <dd className="font-mono text-sm tabular-nums text-fg">
                        {s.requests24h === 0 ? "—" : nf.format(s.requests24h)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-2xs text-faint">Errors</dt>
                      <dd className="font-mono text-sm tabular-nums text-fg">
                        {s.requests24h === 0 ? "—" : s.errors24h}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-2xs text-faint">p95</dt>
                      <dd className="font-mono text-sm tabular-nums text-fg">
                        {s.p95LatencyMs === null ? "—" : `${s.p95LatencyMs}ms`}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
