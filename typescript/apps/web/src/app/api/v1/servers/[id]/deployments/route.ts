import { desc, eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped } from "@mcpfy/db";
import { apiError, tenantFromRequest } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** §38 — GET /api/v1/servers/:id/deployments */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await tenantFromRequest(request);
  if (!ctx) {
    return apiError(401, "unauthorized", "Provide a session cookie or Bearer API key.");
  }

  const { id } = await params;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);

  const server = await db()
    .select({ id: schema.server.id })
    .from(schema.server)
    .where(scoped(ctx, schema.server, eq(schema.server.id, id)))
    .limit(1);

  if (!server[0]) return apiError(404, "not_found", "No such server.");

  const rows = await db()
    .select({
      id: schema.deployment.id,
      number: schema.deployment.number,
      status: schema.deployment.status,
      branch: schema.deployment.branch,
      commitSha: schema.deployment.commitSha,
      endpointUrl: schema.deployment.endpointUrl,
      errorCode: schema.deployment.errorCode,
      errorMessage: schema.deployment.errorMessage,
      createdAt: schema.deployment.createdAt,
      readyAt: schema.deployment.readyAt,
    })
    .from(schema.deployment)
    .where(scoped(ctx, schema.deployment, eq(schema.deployment.serverId, id)))
    .orderBy(desc(schema.deployment.number))
    .limit(limit);

  return Response.json(
    { data: rows, has_more: rows.length === limit },
    { headers: { "cache-control": "no-store" } },
  );
}
