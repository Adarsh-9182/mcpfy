import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { isTerminal, scoped, type DeploymentStatus } from "@mcpfy/db";
import { apiError, tenantFromRequest } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * §11 — build and runtime logs, as a plain page or as a live stream.
 *
 * `?stream=1` returns Server-Sent Events. SSE rather than WebSockets because
 * this is strictly one-directional, it survives proxies that mangle upgrades,
 * and the browser reconnects on its own — none of which is worth giving up
 * for a channel nothing ever writes back on.
 *
 * The stream polls by sequence number rather than holding a database
 * listener, so a reconnect resumes exactly where it left off and a client
 * that disappears costs nothing.
 */

const POLL_MS = 400;
const MAX_STREAM_MS = 15 * 60 * 1000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await tenantFromRequest(request);
  if (!ctx) {
    return apiError(401, "unauthorized", "Provide a session cookie or Bearer API key.");
  }

  const { id } = await params;

  const rows = await db()
    .select({
      id: schema.deployment.id,
      status: schema.deployment.status,
    })
    .from(schema.deployment)
    .where(scoped(ctx, schema.deployment, eq(schema.deployment.id, id)))
    .limit(1);

  const deployment = rows[0];
  if (!deployment) return apiError(404, "not_found", "No such deployment.");

  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? -1);

  if (url.searchParams.get("stream") !== "1") {
    const lines = await readLogs(ctx.organizationId, id, after);
    return Response.json(
      { data: lines, status: deployment.status },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const encoder = new TextEncoder();
  let cursor = after;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const finish = (status: DeploymentStatus) => {
        if (closed) return;
        send("status", { status });
        send("done", { status });
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      };

      // Tell the client where we are before any polling, so a reconnect that
      // races a finished deployment still renders the final state.
      send("open", { deploymentId: id, status: deployment.status });

      const startedAt = Date.now();
      let lastStatus: DeploymentStatus = deployment.status;

      const tick = async () => {
        if (closed) return;

        try {
          const lines = await readLogs(ctx.organizationId, id, cursor);
          if (lines.length > 0) {
            cursor = lines[lines.length - 1]!.seq;
            send("logs", lines);
          }

          const current = await db()
            .select({ status: schema.deployment.status })
            .from(schema.deployment)
            .where(eq(schema.deployment.id, id))
            .limit(1);

          const status = current[0]?.status;
          if (!status) {
            finish(lastStatus);
            return;
          }

          if (status !== lastStatus) {
            lastStatus = status;
            send("status", { status });
          }

          if (isTerminal(status) || status === "live") {
            // One last read so the closing lines are never lost to the gap
            // between the final write and the status flip.
            const trailing = await readLogs(ctx.organizationId, id, cursor);
            if (trailing.length > 0) send("logs", trailing);
            finish(status);
            return;
          }

          if (Date.now() - startedAt > MAX_STREAM_MS) {
            send("timeout", { status });
            closed = true;
            controller.close();
            return;
          }
        } catch {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }

        setTimeout(tick, POLL_MS);
      };

      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      void tick();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Nginx and friends buffer SSE into uselessness without this.
      "x-accel-buffering": "no",
    },
  });
}

async function readLogs(
  organizationId: string,
  deploymentId: string,
  after: number,
) {
  return db()
    .select({
      seq: schema.buildLog.seq,
      stream: schema.buildLog.stream,
      message: schema.buildLog.message,
      at: schema.buildLog.at,
    })
    .from(schema.buildLog)
    .where(
      and(
        eq(schema.buildLog.organizationId, organizationId),
        eq(schema.buildLog.deploymentId, deploymentId),
        gt(schema.buildLog.seq, after),
      ),
    )
    .orderBy(asc(schema.buildLog.seq))
    .limit(500);
}
