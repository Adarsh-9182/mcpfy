import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { hasRole, scoped } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { Inspector } from "./inspector";

export const metadata: Metadata = { title: "Inspector" };

export default async function InspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;

  const server = (
    await db()
      .select({
        id: schema.server.id,
        name: schema.server.name,
        transport: schema.server.transport,
      })
      .from(schema.server)
      .where(scoped(viewer.tenant, schema.server, eq(schema.server.id, id)))
      .limit(1)
  )[0];

  if (!server) notFound();

  const [environments, tools, resources, prompts] = await Promise.all([
    db()
      .select({
        name: schema.environment.name,
        endpointUrl: schema.environment.endpointUrl,
      })
      .from(schema.environment)
      .where(
        scoped(viewer.tenant, schema.environment, eq(schema.environment.serverId, id)),
      )
      .orderBy(asc(schema.environment.name)),
    db()
      .select({
        name: schema.tool.name,
        description: schema.tool.description,
        inputSchema: schema.tool.inputSchema,
      })
      .from(schema.tool)
      .where(
        scoped(
          viewer.tenant,
          schema.tool,
          and(eq(schema.tool.serverId, id), isNull(schema.tool.removedAt)),
        ),
      )
      .orderBy(asc(schema.tool.name)),
    db()
      .select({
        uri: schema.resource.uri,
        name: schema.resource.name,
        mimeType: schema.resource.mimeType,
      })
      .from(schema.resource)
      .where(scoped(viewer.tenant, schema.resource, eq(schema.resource.serverId, id)))
      .orderBy(asc(schema.resource.uri)),
    db()
      .select({
        name: schema.prompt.name,
        description: schema.prompt.description,
        arguments: schema.prompt.arguments,
      })
      .from(schema.prompt)
      .where(scoped(viewer.tenant, schema.prompt, eq(schema.prompt.serverId, id)))
      .orderBy(asc(schema.prompt.name)),
  ]);

  const live = environments.find((e) => e.endpointUrl);

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

      <div className="mb-4">
        <h1 className="text-xl font-medium text-hi">Inspector</h1>
        <p className="mt-1 text-base text-muted">
          Call this server the way an agent would, and read the JSON-RPC
          exchange underneath.
        </p>
      </div>

      <Inspector
        serverId={id}
        environments={environments}
        defaultEndpoint={live?.endpointUrl ?? null}
        tools={tools}
        resources={resources}
        prompts={prompts}
        canExecute={hasRole(viewer.tenant, "developer")}
        role={viewer.tenant.role}
      />
    </>
  );
}
