import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CodeBlock,
  EmptyState,
  StatusDot,
} from "@mcpfy/ui";
import { requireViewer } from "@/lib/session";
import {
  getServer,
  getServerDeployments,
  getServerEnvironments,
  getServerTools,
} from "@/lib/servers";
import { STATUS_LABEL } from "@mcpfy/db";
import { ConnectPanel } from "./connect-panel";

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

  const [environments, deployments, tools] = await Promise.all([
    getServerEnvironments(viewer.tenant, server.id),
    getServerDeployments(viewer.tenant, server.id),
    getServerTools(viewer.tenant, server.id),
  ]);

  const production = environments.find((e) => e.kind === "production");
  const endpoint = production?.endpointUrl ?? null;

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
            <StatusDot status={server.health} />
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
      </div>

      <ConnectPanel serverName={server.slug} endpoint={endpoint} />

      {/*
        No metric tiles here yet. Tiles that link nowhere are exactly the dead
        UI §48 rules out, and the analytics routes they would point at arrive
        in Phase 4. Until traffic exists, saying so is the honest surface.
      */}
      <div className="mt-4 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3.5">
        <p className="text-base font-medium text-hi">No traffic recorded</p>
        <p className="mt-1 text-2xs leading-relaxed text-muted">
          Requests, tool calls, latency percentiles and error rates appear once
          MCP traffic reaches this server through the gateway. Nothing is
          routed through it yet.
        </p>
      </div>

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
            <span className="font-mono text-2xs text-faint">{tools.length}</span>
          </CardHeader>
          <CardBody>
            {tools.length === 0 ? (
              <p className="text-base leading-relaxed text-muted">
                No tools discovered yet.{" "}
                <span className="text-subtle">
                  Discovery runs a <code className="font-mono">tools/list</code>{" "}
                  against the endpoint after a deployment reaches its health
                  check. That step arrives with the deployment engine.
                </span>
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tools.map((tool) => (
                  <li key={tool.id}>
                    <p className="font-mono text-base text-hi">{tool.name}</p>
                    {tool.description ? (
                      <p className="text-2xs text-muted">{tool.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-medium text-hi">Deployments</h2>
        {deployments.length === 0 ? (
          <EmptyState
            title="No deployments"
            what="Deployments record every build, its logs and the endpoint it produced."
            why="This server has not been deployed through MCPfy."
            actions={
              <CodeBlock
                code={`mcpfy deploy --server ${server.slug}`}
                language="bash"
                className="text-left"
              />
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
            {deployments.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-base text-hi">#{d.number}</p>
                  <p className="truncate text-2xs text-faint">
                    {d.commitMessage ?? d.branch ?? "manual deployment"}
                  </p>
                </div>
                <Badge mono>{STATUS_LABEL[d.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
