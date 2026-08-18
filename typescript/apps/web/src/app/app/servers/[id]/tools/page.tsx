import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { scoped } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { SchemaTable } from "./schema-table";

export const metadata: Metadata = { title: "Tools" };

/**
 * §14 — the tool registry.
 *
 * Rows here are written by discovery, never by hand. Per-tool call counts and
 * latency are part of this screen in the specification; they are absent
 * because no traffic is recorded yet, and the page says so rather than
 * showing zeroes dressed up as measurements.
 */
export default async function ToolsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;

  const server = (
    await db()
      .select({ id: schema.server.id, name: schema.server.name })
      .from(schema.server)
      .where(scoped(viewer.tenant, schema.server, eq(schema.server.id, id)))
      .limit(1)
  )[0];

  if (!server) notFound();

  const [tools, resources, prompts] = await Promise.all([
    db()
      .select()
      .from(schema.tool)
      .where(scoped(viewer.tenant, schema.tool, eq(schema.tool.serverId, id)))
      .orderBy(asc(schema.tool.name)),
    db()
      .select()
      .from(schema.resource)
      .where(scoped(viewer.tenant, schema.resource, eq(schema.resource.serverId, id)))
      .orderBy(asc(schema.resource.uri)),
    db()
      .select()
      .from(schema.prompt)
      .where(scoped(viewer.tenant, schema.prompt, eq(schema.prompt.serverId, id)))
      .orderBy(asc(schema.prompt.name)),
  ]);

  const live = tools.filter((t) => !t.removedAt);
  const removed = tools.filter((t) => t.removedAt);

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
          <h1 className="text-xl font-medium text-hi">Registry</h1>
          <p className="mt-1 text-base text-muted">
            {live.length} tool{live.length === 1 ? "" : "s"}, {resources.length}{" "}
            resource{resources.length === 1 ? "" : "s"}, {prompts.length} prompt
            {prompts.length === 1 ? "" : "s"} discovered from this server.
          </p>
        </div>
        <Link
          href={`/app/servers/${id}/inspector`}
          className="rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-1.5 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          Open Inspector →
        </Link>
      </div>

      {tools.length === 0 && resources.length === 0 && prompts.length === 0 ? (
        <EmptyState
          title="Nothing discovered yet"
          what="Tools, resources and prompts are recorded automatically when a deployment passes its MCP health check."
          why="This server has not completed a healthy deployment."
          actions={
            <Link
              href={`/app/servers/${id}/deployments`}
              className="rounded-[var(--radius-md)] border border-line-default bg-panel px-3 py-1.5 text-base text-muted transition-colors hover:text-fg"
            >
              View deployments
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {live.map((tool) => (
            <Card key={tool.id}>
              <CardHeader>
                <CardTitle>
                  <span className="font-mono">{tool.name}</span>
                </CardTitle>
                <Link
                  href={`/app/servers/${id}/inspector`}
                  className="text-2xs text-subtle transition-colors hover:text-accent-text"
                >
                  Inspect →
                </Link>
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                {tool.description ? (
                  <p className="text-base leading-relaxed text-muted">
                    {tool.description}
                  </p>
                ) : (
                  <p className="text-base text-faint">No description declared.</p>
                )}

                <SchemaTable
                  title="Arguments"
                  schema={tool.inputSchema as Record<string, unknown> | null}
                />
                {tool.outputSchema ? (
                  <SchemaTable
                    title="Returns"
                    schema={tool.outputSchema as Record<string, unknown> | null}
                  />
                ) : null}

                <p className="text-2xs text-faint">
                  Call counts, latency and error rate appear here once traffic
                  is recorded.
                </p>
              </CardBody>
            </Card>
          ))}

          {removed.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No longer advertised</CardTitle>
                <Badge tone="warning">{removed.length}</Badge>
              </CardHeader>
              <CardBody>
                <p className="mb-2 text-2xs leading-relaxed text-muted">
                  These were present in an earlier deployment. They are kept so
                  historical calls still resolve to a name.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {removed.map((tool) => (
                    <li key={tool.id}>
                      <Badge mono>{tool.name}</Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {resources.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Resources</CardTitle>
                <span className="font-mono text-2xs text-faint">
                  {resources.length}
                </span>
              </CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {resources.map((resource) => (
                    <li key={resource.id} className="px-4 py-2.5">
                      <p className="font-mono text-base text-hi">{resource.uri}</p>
                      <p className="mt-0.5 text-2xs text-muted">
                        {resource.name ?? "unnamed"}
                        {resource.mimeType ? ` · ${resource.mimeType}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {prompts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Prompts</CardTitle>
                <span className="font-mono text-2xs text-faint">
                  {prompts.length}
                </span>
              </CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {prompts.map((prompt) => (
                    <li key={prompt.id} className="px-4 py-2.5">
                      <p className="font-mono text-base text-hi">{prompt.name}</p>
                      {prompt.description ? (
                        <p className="mt-0.5 text-2xs text-muted">
                          {prompt.description}
                        </p>
                      ) : null}
                      {Array.isArray(prompt.arguments) &&
                      prompt.arguments.length > 0 ? (
                        <p className="mt-1 font-mono text-2xs text-faint">
                          {prompt.arguments
                            .map(
                              (a) =>
                                `${String((a as { name?: unknown }).name)}${
                                  (a as { required?: unknown }).required
                                    ? ""
                                    : "?"
                                }`,
                            )
                            .join(", ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
