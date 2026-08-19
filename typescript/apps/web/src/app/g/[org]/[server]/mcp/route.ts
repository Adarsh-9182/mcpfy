import { jsonRpcError, proxy } from "@mcpfy/gateway";
import {
  authenticateGateway,
  gatewaySink,
  resolveTarget,
} from "@/lib/gateway";

export const dynamic = "force-dynamic";
// Node, not Edge: the sink writes to Postgres and the proxy tees streams.
export const runtime = "nodejs";

/**
 * §20 — the MCP gateway.
 *
 * POST /g/{organization}/{server}/mcp
 *
 * This is the URL customers hand to Claude, Cursor or ChatGPT. It stays
 * stable across redeploys — the endpoint behind it moves, the client's
 * configuration does not — and it is the single point where every request is
 * authorised and recorded.
 */

interface Params {
  params: Promise<{ org: string; server: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const { org, server } = await params;
  const url = new URL(request.url);
  const environment = url.searchParams.get("environment") ?? "production";

  const target = await resolveTarget(org, server, environment);
  if (!target) {
    // Deliberately identical whether the server does not exist, is not
    // deployed, or belongs to someone else: an unauthenticated caller must
    // not be able to enumerate which servers exist.
    return jsonRpcError(
      null,
      -32004,
      "No MCP server is reachable at this address.",
      "-",
      404,
    );
  }

  const auth = await authenticateGateway(request, target.organizationId);
  if (!auth.ok) {
    return jsonRpcError(null, -32003, auth.reason, "-", 401);
  }

  return proxy(request, { target, sink: gatewaySink() });
}

/**
 * Streamable HTTP uses GET to open the server-to-client stream and DELETE to
 * end a session. Both are forwarded unchanged; only POST carries JSON-RPC
 * worth recording in detail.
 */
export async function GET(request: Request, { params }: Params) {
  return POST(request, { params });
}

export async function DELETE(request: Request, { params }: Params) {
  return POST(request, { params });
}
