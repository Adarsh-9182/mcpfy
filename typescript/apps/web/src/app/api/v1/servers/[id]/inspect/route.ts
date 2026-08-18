import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@mcpfy/db/client";
import { AuthorizationError, requireRole, scoped } from "@mcpfy/db";
import { inspect, type Operation } from "@mcpfy/inspector";
import { apiError, tenantFromRequest } from "@/lib/api-auth";
import { assertSafeUrl, UnsafeUrlError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

const Body = z.object({
  method: z.enum([
    "tools/list",
    "tools/call",
    "resources/list",
    "resources/read",
    "prompts/list",
    "prompts/get",
    "ping",
  ]),
  name: z.string().optional(),
  uri: z.string().optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  /** Overrides the server's own endpoint. Validated before we connect. */
  endpoint_url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  bearer_token: z.string().optional(),
  environment: z.string().optional(),
});

/** Operations that only read. Everything else can change the world. */
const READ_ONLY = new Set([
  "tools/list",
  "resources/list",
  "prompts/list",
  "ping",
]);

/**
 * §13 — POST /api/v1/servers/:id/inspect
 *
 * Runs one MCP operation against a server and returns the result together
 * with every JSON-RPC frame it took to get there.
 *
 * The authorization split is the important part: listing capabilities is a
 * read, but `tools/call` runs somebody's code with real side effects — a
 * viewer can look at a tool's schema and must not be able to invoke it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await tenantFromRequest(request);
  if (!ctx) {
    return apiError(401, "unauthorized", "Provide a session cookie or Bearer API key.");
  }

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return apiError(422, "invalid_request", "One or more fields are invalid.", {
      fields: parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }

  const body = parsed.data;

  if (!READ_ONLY.has(body.method)) {
    try {
      requireRole(ctx, "developer");
    } catch (e) {
      if (e instanceof AuthorizationError) {
        return apiError(
          403,
          "forbidden",
          `Executing ${body.method} requires the developer role or higher; you have ${ctx.role}.`,
        );
      }
      throw e;
    }
  }

  const server = (
    await db()
      .select({
        id: schema.server.id,
        slug: schema.server.slug,
        transport: schema.server.transport,
      })
      .from(schema.server)
      .where(scoped(ctx, schema.server, eq(schema.server.id, id)))
      .limit(1)
  )[0];

  if (!server) return apiError(404, "not_found", "No such server.");

  let endpointUrl: string;
  if (body.endpoint_url) {
    // User-supplied: the same outbound-fetch risk as any other endpoint.
    try {
      endpointUrl = (await assertSafeUrl(body.endpoint_url)).toString();
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        return apiError(422, "unsafe_endpoint", e.message);
      }
      throw e;
    }
  } else {
    // The server's own endpoint. MCPfy wrote this URL itself when the
    // deployment went healthy, so it needs no SSRF check — and must not get
    // one, because a locally deployed server legitimately listens on
    // loopback, which the guard rejects.
    const environment = (
      await db()
        .select({ endpointUrl: schema.environment.endpointUrl })
        .from(schema.environment)
        .where(
          and(
            eq(schema.environment.serverId, id),
            eq(schema.environment.organizationId, ctx.organizationId),
            eq(schema.environment.name, body.environment ?? "production"),
          ),
        )
        .limit(1)
    )[0];

    if (!environment?.endpointUrl) {
      return apiError(
        409,
        "no_endpoint",
        "This server has no live endpoint to inspect. Deploy it, or give an endpoint URL to connect to.",
      );
    }
    endpointUrl = environment.endpointUrl;
  }

  const operation = toOperation(body);
  if (!operation) {
    return apiError(
      422,
      "invalid_request",
      `${body.method} needs ${body.method === "resources/read" ? "a uri" : "a name"}.`,
    );
  }

  const result = await inspect(
    {
      endpointUrl,
      transport: server.transport === "sse" ? "sse" : "streamable_http",
      headers: body.headers,
      bearerToken: body.bearer_token,
      timeoutMs: 30_000,
    },
    operation,
  );

  if (!READ_ONLY.has(body.method)) {
    // §25 — executing a tool against a live server is an auditable action.
    await db()
      .insert(schema.auditLog)
      .values({
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        actorApiKeyId: ctx.apiKeyId,
        action: "inspector.execute",
        targetType: "server",
        targetId: id,
        // Argument *keys* only, never values — the same guarantee mcpfy-pulse
        // makes. The values are on the developer's screen; they do not also
        // need to be in a retained log.
        metadata: {
          method: body.method,
          name: body.name,
          uri: body.uri,
          argumentKeys: Object.keys(body.arguments ?? {}),
          ok: result.ok,
          durationMs: result.operationMs ?? result.totalMs,
        },
      })
      .catch(() => {});
  }

  return Response.json(
    { data: result },
    { headers: { "cache-control": "no-store" } },
  );
}

function toOperation(body: z.infer<typeof Body>): Operation | null {
  switch (body.method) {
    case "tools/list":
    case "resources/list":
    case "prompts/list":
    case "ping":
      return { method: body.method };
    case "tools/call":
      return body.name
        ? { method: "tools/call", name: body.name, arguments: body.arguments }
        : null;
    case "resources/read":
      return body.uri ? { method: "resources/read", uri: body.uri } : null;
    case "prompts/get":
      return body.name
        ? {
            method: "prompts/get",
            name: body.name,
            arguments: Object.fromEntries(
              Object.entries(body.arguments ?? {}).map(([k, v]) => [k, String(v)]),
            ),
          }
        : null;
  }
}
