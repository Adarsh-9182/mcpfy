import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { BarList, Badge, EmptyState, TrafficChart } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { scoped } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import {
  clientStats,
  errorGroups,
  headline,
  methodStats,
  parseRange,
  rangeSpec,
  toolStats,
  trafficSeries,
} from "@/lib/analytics";
import { RangeTabs } from "./range-tabs";

export const metadata: Metadata = { title: "Analytics" };

const nf = new Intl.NumberFormat("en", { notation: "compact" });

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const spec = rangeSpec(range);

  const server = (
    await db()
      .select({ id: schema.server.id, name: schema.server.name, slug: schema.server.slug })
      .from(schema.server)
      .where(scoped(viewer.tenant, schema.server, eq(schema.server.id, id)))
      .limit(1)
  )[0];

  if (!server) notFound();

  // Every one of these aggregates in Postgres and returns at most a few dozen
  // rows — §42's rule enforced by never selecting raw rows in the first place.
  const [stats, series, tools, methods, clients, errors] = await Promise.all([
    headline(viewer.tenant, id, range),
    trafficSeries(viewer.tenant, id, range),
    toolStats(viewer.tenant, id, range),
    methodStats(viewer.tenant, id, range),
    clientStats(viewer.tenant, id, range),
    errorGroups(viewer.tenant, id, range),
  ]);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          href={`/app/servers/${id}`}
          className="text-2xs text-subtle transition-colors hover:text-accent-text"
        >
          ← {server.name}
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-hi">Analytics</h1>
          <p className="mt-1 text-base text-muted">
            {spec.label}, measured at the gateway.
          </p>
        </div>
        <RangeTabs serverId={id} range={range} />
      </div>

      {stats.requests === 0 ? (
        <EmptyState
          title="No traffic in this period"
          what="Analytics are built from requests that pass through the MCPfy gateway."
          why="Nothing has been recorded for this server in the selected range."
          actions={
            <Link
              href={`/app/servers/${id}`}
              className="rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-1.5 text-base text-muted transition-colors hover:text-fg"
            >
              Get the gateway URL
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Requests" value={nf.format(stats.requests)} />
            <Stat label="Tool calls" value={nf.format(stats.toolCalls)} />
            <Stat
              label="Error rate"
              value={
                stats.errorRate === null
                  ? "—"
                  : `${(stats.errorRate * 100).toFixed(2)}%`
              }
              tone={
                stats.errorRate !== null && stats.errorRate > 0.01
                  ? "danger"
                  : "default"
              }
              hint={`${stats.errors} failed`}
            />
            <Stat
              label="p95 latency"
              value={stats.p95 === null ? "—" : `${stats.p95}ms`}
              hint={
                stats.p50 !== null && stats.p99 !== null
                  ? `p50 ${stats.p50}ms · p99 ${stats.p99}ms`
                  : undefined
              }
            />
          </dl>

          <TrafficChart buckets={series} unit={spec.unit} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Tools"
              subtitle="By call volume. The red portion of a bar is failures."
            >
              <BarList
                items={tools.map((tool) => ({
                  label: tool.toolName,
                  value: tool.calls,
                  errors: tool.errors,
                }))}
                empty="No tool calls in this period."
              />
            </Panel>

            <Panel title="Latency by tool" subtitle="p95, worst first.">
              <BarList
                items={[...tools]
                  .filter((t) => t.p95 !== null)
                  .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))
                  .map((tool) => ({
                    label: tool.toolName,
                    value: tool.p95 ?? 0,
                    display: `${tool.p95}ms`,
                  }))}
                empty="No tool calls in this period."
              />
            </Panel>

            <Panel title="Methods" subtitle="Every JSON-RPC method seen.">
              <BarList
                items={methods.map((method) => ({
                  label: method.method,
                  value: method.calls,
                  errors: method.errors,
                }))}
              />
            </Panel>

            <Panel
              title="Clients"
              subtitle="From the handshake. Clients that send no identity are grouped."
            >
              <BarList
                items={clients.map((client) => ({
                  label: client.clientName,
                  value: client.sessions,
                  display: `${client.sessions} session${client.sessions === 1 ? "" : "s"}`,
                }))}
                empty="No identified sessions. This server does not issue session ids."
              />
            </Panel>
          </div>

          {/* §23 — grouped by cause. Four hundred rows saying the same thing
              are not actionable; one row with a count is. */}
          <Panel
            title="Errors"
            subtitle="Grouped by cause, most frequent first."
            right={
              errors.length > 0 ? (
                <Badge tone="danger">{stats.errors} total</Badge>
              ) : null
            }
          >
            {errors.length === 0 ? (
              <p className="px-1 py-6 text-center text-2xs text-subtle">
                No errors in this period.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
                {errors.map((group) => (
                  <li key={group.errorCode} className="flex gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-mono text-sm text-danger">
                      {group.errorCode}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-fg">
                        {group.sample ?? "No message recorded."}
                      </span>
                      <span className="mt-0.5 block font-mono text-2xs text-faint">
                        last seen {group.lastSeen.replace("T", " ").slice(0, 16)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted">
                      ×{group.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-2xs text-faint">
            {formatBytes(stats.bytesIn)} in · {formatBytes(stats.bytesOut)} out ·{" "}
            {stats.sessions} session{stats.sessions === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      <dt className="text-2xs font-medium uppercase tracking-wider text-subtle">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono text-2xl tabular-nums ${tone === "danger" ? "text-danger" : "text-hi"}`}
      >
        {value}
      </dd>
      {hint ? (
        <dd className="mt-1 font-mono text-2xs text-faint">{hint}</dd>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-hi">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-2xs text-subtle">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
