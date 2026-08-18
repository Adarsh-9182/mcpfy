import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { isTerminal, scoped, STATUS_LABEL } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { LiveLogs, type LogRow } from "../live-logs";
import { CancelButton } from "../cancel-button";

export const metadata: Metadata = { title: "Deployment" };

export default async function DeploymentPage({
  params,
}: {
  params: Promise<{ id: string; deploymentId: string }>;
}) {
  const viewer = await requireViewer();
  const { id, deploymentId } = await params;

  const rows = await db()
    .select({
      deployment: schema.deployment,
      serverName: schema.server.name,
      environmentName: schema.environment.name,
    })
    .from(schema.deployment)
    .innerJoin(schema.server, eq(schema.deployment.serverId, schema.server.id))
    .innerJoin(
      schema.environment,
      eq(schema.deployment.environmentId, schema.environment.id),
    )
    .where(
      scoped(
        viewer.tenant,
        schema.deployment,
        and(
          eq(schema.deployment.id, deploymentId),
          eq(schema.deployment.serverId, id),
        ),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const { deployment } = row;

  const logs: LogRow[] = await db()
    .select({
      seq: schema.buildLog.seq,
      stream: schema.buildLog.stream,
      message: schema.buildLog.message,
    })
    .from(schema.buildLog)
    .where(
      and(
        eq(schema.buildLog.organizationId, viewer.tenant.organizationId),
        eq(schema.buildLog.deploymentId, deploymentId),
      ),
    )
    .orderBy(asc(schema.buildLog.seq))
    .limit(2000);

  const done = isTerminal(deployment.status) || deployment.status === "live";
  const duration =
    deployment.endedAt && deployment.startedAt
      ? `${((deployment.endedAt.getTime() - deployment.startedAt.getTime()) / 1000).toFixed(1)}s`
      : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-2xs">
        <Link href={`/app/servers/${id}`} className="text-subtle hover:text-accent-text">
          {row.serverName}
        </Link>
        <span className="text-faint">/</span>
        <Link
          href={`/app/servers/${id}/deployments`}
          className="text-subtle hover:text-accent-text"
        >
          Deployments
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-medium text-hi">
            Deployment #{deployment.number}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge mono>{row.environmentName}</Badge>
            {deployment.branch ? <Badge mono>{deployment.branch}</Badge> : null}
            {deployment.commitSha ? (
              <Badge mono>{deployment.commitSha.slice(0, 7)}</Badge>
            ) : null}
            {duration ? <Badge mono>{duration}</Badge> : null}
          </div>
        </div>
        {!done ? (
          <CancelButton serverId={id} deploymentId={deploymentId} />
        ) : null}
      </div>

      {/*
        §35 — a failure states what happened, the exact error, and what to do.
        The message is whatever the runtime actually said, not a generic one.
      */}
      {deployment.status === "failed" ? (
        <div
          role="alert"
          className="mb-4 rounded-[var(--radius-lg)] border border-danger-border bg-danger-surface p-4"
        >
          <p className="text-base font-medium text-danger">
            {STATUS_LABEL[deployment.status]}
            {deployment.errorCode ? (
              <span className="ml-2 font-mono text-2xs opacity-80">
                {deployment.errorCode}
              </span>
            ) : null}
          </p>
          {deployment.errorMessage ? (
            <p className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-fg">
              {deployment.errorMessage}
            </p>
          ) : null}
          <p className="mt-2 text-2xs text-muted">
            The build log below carries the full output.
          </p>
        </div>
      ) : null}

      {deployment.status === "live" && deployment.endpointUrl ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Live endpoint</CardTitle>
            <Badge tone="success">Healthy</Badge>
          </CardHeader>
          <CardBody>
            <p className="break-all font-mono text-base text-hi">
              {deployment.endpointUrl}
            </p>
            <p className="mt-1.5 text-2xs text-muted">
              Client configuration for this endpoint is on the{" "}
              <Link
                href={`/app/servers/${id}`}
                className="text-accent-text hover:underline"
              >
                server page
              </Link>
              .
            </p>
          </CardBody>
        </Card>
      ) : null}

      <LiveLogs
        deploymentId={deploymentId}
        initialLines={logs}
        initialStatus={deployment.status}
      />
    </>
  );
}
