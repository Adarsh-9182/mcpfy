import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { hashApiKey } from "@mcpfy/db";
import { handleBody, type Caller } from "@mcpfy/control-mcp";
import { controlOperations } from "@/lib/control-operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * §28 — POST /mcp
 *
 * MCPfy's own control plane, spoken as MCP. Point Claude or Cursor at this
 * with an API key and you can deploy a server, read why the last build broke,
 * and audit a server's readiness without leaving the conversation.
 *
 * An MCP platform that cannot itself be operated by an agent would be an odd
 * thing to sell.
 */

async function authenticate(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) return null;

  const rows = await db()
    .select({
      apiKeyId: schema.apiKey.id,
      role: schema.apiKey.role,
      organizationId: schema.organization.id,
      organizationSlug: schema.organization.slug,
    })
    .from(schema.apiKey)
    .innerJoin(
      schema.organization,
      eq(schema.apiKey.organizationId, schema.organization.id),
    )
    .where(
      and(
        eq(schema.apiKey.keyHash, hashApiKey(presented)),
        isNull(schema.apiKey.revokedAt),
        or(isNull(schema.apiKey.expiresAt), gt(schema.apiKey.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const key = rows[0];
  if (!key) return null;

  return {
    organizationId: key.organizationId,
    organizationSlug: key.organizationSlug,
    role: key.role,
    apiKeyId: key.apiKeyId,
  };
}

export async function POST(request: Request) {
  const caller = await authenticate(request);
  if (!caller) {
    // Answered in JSON-RPC, because the caller is an MCP client that cannot
    // read an HTML error page.
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32003,
          message:
            "Provide an MCPfy API key as `Authorization: Bearer …`. " +
            "Create one under Settings → API keys.",
        },
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } },
      { status: 400 },
    );
  }

  const response = await handleBody(body, caller, controlOperations);

  // A body of only notifications gets 202 and no content, per the spec.
  if (response === null) {
    return new Response(null, { status: 202 });
  }

  return Response.json(response, {
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Streamable HTTP allows a GET to open a server-to-client stream. This server
 * is stateless and never initiates anything, so it declines rather than
 * holding a connection open that will carry nothing.
 */
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
