import type { ControlTool, JsonSchema } from "./types";

/**
 * The tools MCPfy exposes about itself.
 *
 * Written to pass MCPfy's own readiness checks — every tool and every
 * argument described, every tool declaring what it returns. Shipping a
 * control plane that would score badly on our own audit would be an odd
 * thing to do.
 *
 * There are no destructive tools here at all. §18 is explicit that an agent
 * must never have unrestricted destructive access, and the honest way to
 * honour that in a first version is not to hand it the verbs. Deleting a
 * server stays in the dashboard, where a human is looking at it.
 */

const serverSlug = {
  type: "string",
  description:
    "The server's slug, as shown in its URL — for example 'customer-mcp'. " +
    "Use list_servers first if you do not know it.",
};

function object(
  properties: Record<string, unknown>,
  required: string[] = [],
): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

export const CONTROL_TOOLS: ControlTool[] = [
  {
    name: "list_servers",
    description:
      "List every MCP server in the organization, with its health, endpoint " +
      "and request volume over the last 24 hours. Start here when you do not " +
      "know which server is being asked about.",
    minimumRole: "viewer",
    inputSchema: object({}),
    outputSchema: object({
      servers: {
        type: "array",
        description: "One entry per server, newest first.",
      },
    }),
    annotations: { readOnlyHint: true },
    run: (ops, caller) => ops.listServers(caller),
  },
  {
    name: "get_server",
    description:
      "Get one server in detail: its health and when that was last verified, " +
      "its live endpoint, detected framework and runtime, and the commands " +
      "MCPfy uses to build it.",
    minimumRole: "viewer",
    inputSchema: object({ server: serverSlug }, ["server"]),
    annotations: { readOnlyHint: true },
    run: (ops, caller, args) => ops.getServer(caller, String(args.server)),
  },
  {
    name: "list_deployments",
    description:
      "List a server's deployments, newest first, with status, branch, commit " +
      "and the error message for any that failed. Use this to answer 'why did " +
      "the last deploy fail'.",
    minimumRole: "viewer",
    inputSchema: object(
      {
        server: serverSlug,
        limit: {
          type: "number",
          description: "How many deployments to return. Defaults to 10, max 50.",
        },
      },
      ["server"],
    ),
    annotations: { readOnlyHint: true },
    run: (ops, caller, args) =>
      ops.listDeployments(
        caller,
        String(args.server),
        clamp(args.limit, 10, 1, 50),
      ),
  },
  {
    name: "get_deployment_logs",
    description:
      "Read the build and runtime log for one deployment. This is where the " +
      "actual reason for a failed build lives — read it before guessing.",
    minimumRole: "viewer",
    inputSchema: object(
      {
        server: serverSlug,
        deployment: {
          type: "number",
          description:
            "The deployment number, as shown in the dashboard — for example 14.",
        },
        tail: {
          type: "number",
          description:
            "Return only the last N lines. Defaults to 200, max 1000. " +
            "The failure is almost always at the end.",
        },
      },
      ["server", "deployment"],
    ),
    annotations: { readOnlyHint: true },
    run: (ops, caller, args) =>
      ops.getDeploymentLogs(
        caller,
        Number(args.deployment),
        String(args.server),
        clamp(args.tail, 200, 1, 1000),
      ),
  },
  {
    name: "get_analytics",
    description:
      "Traffic for a server as measured at the gateway: request and tool-call " +
      "counts, error rate, latency percentiles, a per-tool breakdown, and " +
      "errors grouped by cause.",
    minimumRole: "viewer",
    inputSchema: object(
      {
        server: serverSlug,
        range: {
          type: "string",
          enum: ["24h", "7d", "30d"],
          description: "How far back to look. Defaults to 24h.",
        },
      },
      ["server"],
    ),
    annotations: { readOnlyHint: true },
    run: (ops, caller, args) =>
      ops.getAnalytics(caller, String(args.server), String(args.range ?? "24h")),
  },
  {
    name: "get_readiness",
    description:
      "Audit a server and score it out of 100 on protocol conformance, schema " +
      "and description quality, safety, and what its real traffic shows. Every " +
      "failed check comes back with what to do about it.",
    minimumRole: "viewer",
    inputSchema: object({ server: serverSlug }, ["server"]),
    annotations: { readOnlyHint: true },
    run: (ops, caller, args) => ops.getReadiness(caller, String(args.server)),
  },
  {
    name: "list_server_tools",
    description:
      "List the tools, resources and prompts a server advertises, with their " +
      "schemas. These are recorded by MCPfy at deploy time, so this reflects " +
      "what is actually live rather than what is in the source.",
    minimumRole: "viewer",
    inputSchema: object({ server: serverSlug }, ["server"]),
    annotations: { readOnlyHint: true },
    run: (ops, caller, args) => ops.listServerTools(caller, String(args.server)),
  },
  {
    name: "deploy_server",
    description:
      "Start a deployment of a server's connected repository to production. " +
      "Returns immediately with a deployment number; follow it with " +
      "list_deployments or get_deployment_logs. Any deployment already in " +
      "flight for the same environment is superseded.",
    minimumRole: "developer",
    inputSchema: object({ server: serverSlug }, ["server"]),
    // Not destructive, but it does change what production is running, so a
    // client that asks before acting should ask before this one.
    annotations: { readOnlyHint: false, idempotentHint: false },
    run: (ops, caller, args) => ops.deployServer(caller, String(args.server)),
  },
];

function clamp(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
