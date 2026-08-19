import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@mcpfy/ui";
import { requireViewer } from "@/lib/session";
import { isStale, probeHealth, reconcileOrphanedDeployments } from "@/lib/health";
import {
  getServer,
  getServerDeployments,
  getServerEnvironments,
  getServerTools,
  serverTraffic,
} from "@/lib/servers";

const nf = new Intl.NumberFormat("en", { notation: "compact" });
import { count, isNull } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped, STATUS_LABEL } from "@mcpfy/db";

/** The public origin clients will connect to. */
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
import { ConnectPanel } from "./connect-panel";
import { HealthBadge } from "./health-badge";
import { DeployButton } from "./deploy-button";
import { DetectionPanel } from "./detection-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const viewer = await requireViewer();
  const { id } = await params;
  const server = await getServer(viewer.tenant, id);
  return { title: server?.name ?? "Server" };
}

export default async function ServerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;

  const server = await getServer(viewer.tenant, id);
  // getServer is already tenant-scoped, so "belongs to another org" and
  // "does not exist" are the same 404 here — by design (§25).
  if (!server) notFound();

  // Resolve anything left mid-flight by a restart before rendering statuses,
  // otherwise this page confidently shows a build that stopped existing.
  await reconcileOrphanedDeployments(viewer.tenant);

  // Verify liveness rather than trusting what deployment wrote. The probe is
  // one ping, so it costs a few milliseconds and buys a status that is true.
  if (isStale(server.healthCheckedAt)) {
    await probeHealth(viewer.tenant, server.id).catch(() => {});
  }

  const [fresh, traffic, environments, deployments, tools] = await Promise.all([
    getServer(viewer.tenant, server.id),
    serverTraffic(viewer.tenant, server.id),
    getServerEnvironments(viewer.tenant, server.id),
    getServerDeployments(viewer.tenant, server.id),
    getServerTools(viewer.tenant, server.id),
  ]);

  const current = fresh ?? server;

  const production = environments.find((e) => e.kind === "production");
  const endpoint = production?.endpointUrl ?? null;

  const keyCounts = await db()
    .select({ count: count() })
    .from(schema.apiKey)
    .where(
      scoped(viewer.tenant, schema.apiKey, isNull(schema.apiKey.revokedAt)),
    );
  const apiKeyCount = Number(keyCounts[0]?.count ?? 0);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          href="/app/servers"
          className="text-2xs text-subtle transition-colors hover:text-accent-text"
        >
          ← Servers
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-mono text-xl font-medium text-hi">
            {server.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <HealthBadge
              serverId={server.id}
              health={current.health}
              detail={current.healthDetail}
              checkedAt={current.healthCheckedAt?.toISOString() ?? null}
              stale={isStale(current.healthCheckedAt)}
            />
            <Badge mono>{server.transport.replace("_", " ")}</Badge>
            <Badge mono>{server.runtime}</Badge>
            <Badge mono>{server.region}</Badge>
            {server.framework === "unknown" ? (
              <Badge tone="warning">framework not detected</Badge>
            ) : (
              <Badge mono>{server.framework}</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/servers/${server.id}/inspector`}
            className="rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-1.5 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Inspector
          </Link>
          <Link
            href={`/app/servers/${server.id}/tools`}
            className="rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-1.5 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Registry
          </Link>
          <Link
            href={`/app/servers/${server.id}/analytics`}
            className="rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-1.5 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Analytics
          </Link>
          <DeployButton
            serverId={server.id}
            connected={Boolean(server.repositoryId)}
          />
        </div>
      </div>

      <ConnectPanel
        serverName={server.slug}
        endpoint={endpoint}
        gatewayUrl={`${appUrl()}/g/${viewer.organization.slug}/${server.slug}/mcp`}
        hasApiKey={apiKeyCount > 0}
      />

      <DetectionPanel
        detection={server.detection}
        rootDirectory={server.rootDirectory}
        installCommand={server.installCommand}
        buildCommand={server.buildCommand}
        startCommand={server.startCommand}
      />

      {/*
        Real numbers now, from what the gateway recorded. When a server has
        never been called we say exactly that instead of printing zeroes —
        "no traffic yet" and "traffic, all of it zero" are different facts,
        and only one of them means something is wrong.
      */}
      {traffic.neverCalled ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3.5">
          <p className="text-base font-medium text-hi">No traffic yet</p>
          <p className="mt-1 text-2xs leading-relaxed text-muted">
            Requests, tool calls, latency and error rates appear here once a
            client connects through the gateway URL above.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Requests", value: nf.format(traffic.requests), tone: "" },
              { label: "Tool calls", value: nf.format(traffic.toolCalls), tone: "" },
              {
                label: "Error rate",
                value:
                  traffic.errorRate === null
                    ? "—"
                    : `${(traffic.errorRate * 100).toFixed(2)}%`,
                tone:
                  traffic.errorRate !== null && traffic.errorRate > 0.01
                    ? "text-danger"
                    : "text-success",
              },
              {
                label: "p95 latency",
                value:
                  traffic.p95LatencyMs === null
                    ? "—"
                    : `${traffic.p95LatencyMs}ms`,
                tone: "",
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-[var(--radius-lg)] border border-line bg-surface p-4"
              >
                <dt className="text-2xs font-medium uppercase tracking-wider text-subtle">
                  {metric.label}
                </dt>
                <dd
                  className={`mt-1 font-mono text-2xl tabular-nums ${metric.tone || "text-hi"}`}
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-2xs text-faint">
            Last 24 hours, via the gateway.{" "}
            <Link
              href={`/app/servers/${server.id}/analytics`}
              className="text-subtle transition-colors hover:text-accent-text"
            >
              Full analytics →
            </Link>
          </p>
        </>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Environments</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {environments.map((env) => (
                <li
                  key={env.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-base text-hi">{env.name}</p>
                    <p className="truncate font-mono text-2xs text-faint">
                      {env.endpointUrl ?? "no endpoint"}
                    </p>
                  </div>
                  <Badge mono tone={env.kind === "production" ? "accent" : "neutral"}>
                    {env.kind}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <Link
              href={`/app/servers/${server.id}/tools`}
              className="font-mono text-2xs text-subtle transition-colors hover:text-accent-text"
            >
              {tools.length} →
            </Link>
          </CardHeader>
          <CardBody>
            {tools.length === 0 ? (
              <p className="text-base leading-relaxed text-muted">
                No tools discovered yet.{" "}
                <span className="text-subtle">
                  Discovery runs <code className="font-mono">tools/list</code>{" "}
                  against the endpoint when a deployment passes its health
                  check, and records what it finds here.
                </span>
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {tools.map((tool) => (
                  <li key={tool.id} className={tool.removedAt ? "opacity-50" : ""}>
                    <p className="flex items-center gap-2 font-mono text-base text-hi">
                      {tool.name}
                      {tool.removedAt ? (
                        <Badge tone="warning">removed</Badge>
                      ) : null}
                    </p>
                    {tool.description ? (
                      <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                        {tool.description}
                      </p>
                    ) : null}
                    {tool.inputSchema ? (
                      <p className="mt-1 font-mono text-2xs text-faint">
                        {argumentSummary(tool.inputSchema)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-hi">Deployments</h2>
          {deployments.length > 0 ? (
            <Link
              href={`/app/servers/${server.id}/deployments`}
              className="text-2xs text-subtle transition-colors hover:text-accent-text"
            >
              View all →
            </Link>
          ) : null}
        </div>
        {deployments.length === 0 ? (
          <EmptyState
            title="No deployments"
            what="Deployments record every build, its logs and the endpoint it produced."
            why={
              server.repositoryId
                ? "This server has not been built yet."
                : "This server has no connected repository, so there is nothing to build."
            }
            actions={
              <DeployButton
                serverId={server.id}
                connected={Boolean(server.repositoryId)}
              />
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
            {deployments.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/app/servers/${server.id}/deployments/${d.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-panel"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-base text-hi">#{d.number}</p>
                    <p className="truncate text-2xs text-faint">
                      {d.errorMessage ??
                        d.commitMessage ??
                        d.branch ??
                        "manual deployment"}
                    </p>
                  </div>
                  <Badge
                    mono
                    tone={
                      d.status === "live"
                        ? "success"
                        : d.status === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {STATUS_LABEL[d.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** A one-line "name: type" summary of a tool's JSON Schema arguments. */
function argumentSummary(schema: Record<string, unknown>): string {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return "no arguments";
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const parts = Object.entries(properties as Record<string, { type?: string }>)
    .map(([name, prop]) => `${name}${required.has(name) ? "" : "?"}: ${prop.type ?? "any"}`)
    .slice(0, 6);
  return parts.length > 0 ? parts.join(", ") : "no arguments";
}
