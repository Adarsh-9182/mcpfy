import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Badge, EmptyState, DataTable, type Column } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { scoped, STATUS_LABEL, type DeploymentStatus } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { DeployButton } from "../deploy-button";

export const metadata: Metadata = { title: "Deployments" };

interface Row {
  id: string;
  number: number;
  status: DeploymentStatus;
  branch: string | null;
  commitSha: string | null;
  createdAt: Date;
  errorCode: string | null;
}

const TONE: Record<DeploymentStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  building: "accent",
  deploying: "accent",
  health_check: "accent",
  live: "success",
  failed: "danger",
  cancelled: "warning",
  rolled_back: "warning",
};

export default async function DeploymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;

  const server = (
    await db()
      .select({ id: schema.server.id, name: schema.server.name, repositoryId: schema.server.repositoryId })
      .from(schema.server)
      .where(scoped(viewer.tenant, schema.server, eq(schema.server.id, id)))
      .limit(1)
  )[0];

  if (!server) {
    return <p className="text-base text-muted">No such server.</p>;
  }

  const rows: Row[] = await db()
    .select({
      id: schema.deployment.id,
      number: schema.deployment.number,
      status: schema.deployment.status,
      branch: schema.deployment.branch,
      commitSha: schema.deployment.commitSha,
      createdAt: schema.deployment.createdAt,
      errorCode: schema.deployment.errorCode,
    })
    .from(schema.deployment)
    .where(scoped(viewer.tenant, schema.deployment, eq(schema.deployment.serverId, id)))
    .orderBy(desc(schema.deployment.number))
    .limit(50);

  const columns: Column<Row>[] = [
    { key: "number", header: "#", mono: true, width: "5rem", render: (r) => `#${r.number}` },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="flex items-center gap-2">
          <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          {r.errorCode ? (
            <span className="font-mono text-2xs text-faint">{r.errorCode}</span>
          ) : null}
        </span>
      ),
    },
    { key: "branch", header: "Branch", mono: true, render: (r) => r.branch ?? "—" },
    {
      key: "commit",
      header: "Commit",
      mono: true,
      render: (r) => (r.commitSha ? r.commitSha.slice(0, 7) : "—"),
    },
    {
      key: "when",
      header: "Created",
      align: "right",
      mono: true,
      render: (r) => r.createdAt.toISOString().replace("T", " ").slice(0, 16),
    },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link href={`/app/servers/${id}`} className="text-2xs text-subtle hover:text-accent-text">
          ← {server.name}
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-medium text-hi">Deployments</h1>
        <DeployButton serverId={id} connected={Boolean(server.repositoryId)} />
      </div>

      <DataTable
        caption="Deployments for this server, newest first"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/app/servers/${id}/deployments/${r.id}`}
        empty={
          <EmptyState
            title="No deployments yet"
            what="Every build, its logs and the endpoint it produced are recorded here."
            why={
              server.repositoryId
                ? "This server has not been deployed yet."
                : "This server has no connected repository, so there is nothing to build."
            }
            actions={<DeployButton serverId={id} connected={Boolean(server.repositoryId)} />}
          />
        }
      />
    </>
  );
}
