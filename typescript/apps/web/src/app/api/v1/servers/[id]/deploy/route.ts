import { AuthorizationError, requireRole } from "@mcpfy/db";
import { apiError, tenantFromRequest } from "@/lib/api-auth";
import { DeployError, startDeployment } from "@/lib/deploy";

export const dynamic = "force-dynamic";

/** §38 — POST /api/v1/servers/:id/deploy */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await tenantFromRequest(request);
  if (!ctx) {
    return apiError(401, "unauthorized", "Provide a session cookie or Bearer API key.");
  }

  try {
    requireRole(ctx, "developer");
  } catch (e) {
    if (e instanceof AuthorizationError) return apiError(403, "forbidden", e.message);
    throw e;
  }

  const { id } = await params;

  let body: { environment?: string; branch?: string; commit_sha?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  try {
    const started = await startDeployment(ctx, {
      serverId: id,
      environmentName: body.environment,
      branch: body.branch,
      commitSha: body.commit_sha ?? null,
      trigger: "api",
    });

    return Response.json(
      {
        data: {
          id: started.id,
          number: started.number,
          status: "queued",
          logs_url: `/api/v1/deployments/${started.id}/logs`,
        },
      },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof DeployError) {
      const status = e.code === "not_found" ? 404 : 409;
      return apiError(status, e.code, e.message);
    }
    throw e;
  }
}
