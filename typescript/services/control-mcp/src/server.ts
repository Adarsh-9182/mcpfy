import { CONTROL_TOOLS } from "./tools";
import { permits, type Caller, type ControlTool, type Operations } from "./types";

/**
 * A stateless MCP server over JSON-RPC.
 *
 * Written directly rather than through mcpfy-sdk because the SDK's `listen()`
 * binds its own HTTP server, which a request handler cannot do. The protocol
 * surface a stateless server needs is small — initialize, tools/list,
 * tools/call, ping — and implementing it here keeps the handler free of a
 * transport that wants to own the process.
 */

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "mcpfy-control",
  title: "MCPfy control plane",
  version: "0.1.0",
};

const INSTRUCTIONS = `Operate MCPfy — deploy MCP servers, read their logs, and
audit their health.

Server names are slugs like "customer-mcp"; call list_servers first if you do
not know one. When something has gone wrong, get_deployment_logs holds the
actual error and is worth reading before forming a theory.`;

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

/** Tools this caller may use. Below the bar, a tool is not listed at all. */
export function toolsFor(caller: Caller): ControlTool[] {
  return CONTROL_TOOLS.filter((tool) => permits(caller.role, tool.minimumRole));
}

/**
 * Handles one JSON-RPC message.
 *
 * Returns null for a notification, which by protocol expects no response.
 */
export async function handle(
  message: RpcRequest,
  caller: Caller,
  operations: Operations,
): Promise<RpcResponse | null> {
  const id = message.id ?? null;

  if (message.method === undefined) {
    return error(id, INVALID_REQUEST, "Missing method.");
  }

  // Notifications carry no id and must not be answered.
  if (message.id === undefined && message.method.startsWith("notifications/")) {
    return null;
  }

  switch (message.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: toolsFor(caller).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        })),
      });

    case "tools/call":
      return callTool(id, message.params ?? {}, caller, operations);

    // Answered rather than left to fail: a client that asks for these and
    // gets a hard error often gives up on the whole connection.
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });

    default:
      return error(id, METHOD_NOT_FOUND, `Unknown method "${message.method}".`);
  }
}

async function callTool(
  id: string | number | null,
  params: Record<string, unknown>,
  caller: Caller,
  operations: Operations,
): Promise<RpcResponse> {
  const name = typeof params.name === "string" ? params.name : null;
  if (!name) return error(id, INVALID_PARAMS, "tools/call requires a name.");

  const tool = CONTROL_TOOLS.find((t) => t.name === name);
  if (!tool) {
    return error(id, INVALID_PARAMS, `No tool named "${name}".`);
  }

  // Authorisation is checked here, not only at listing. A caller who guesses
  // a tool name must not get further than one who can see it.
  if (!permits(caller.role, tool.minimumRole)) {
    return error(
      id,
      INVALID_PARAMS,
      `"${name}" requires the ${tool.minimumRole} role or higher; this key has ${caller.role}.`,
    );
  }

  const args =
    params.arguments && typeof params.arguments === "object"
      ? (params.arguments as Record<string, unknown>)
      : {};

  const missing = (tool.inputSchema.required ?? []).filter(
    (key) => args[key] === undefined || args[key] === null || args[key] === "",
  );
  if (missing.length > 0) {
    return toolError(id, `Missing required argument${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
  }

  try {
    const result = await tool.run(operations, caller, args);
    return ok(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as Record<string, unknown>,
    });
  } catch (thrown) {
    // A tool that fails is an in-band error, not a protocol error: the call
    // reached the tool, and the caller needs to see why it refused.
    const message =
      thrown instanceof Error ? thrown.message : "The operation failed.";
    return toolError(id, message);
  }
}

function ok(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function error(
  id: string | number | null,
  code: number,
  message: string,
): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolError(id: string | number | null, message: string): RpcResponse {
  return ok(id, {
    isError: true,
    content: [{ type: "text", text: message }],
  }) as RpcResponse;
}

/** Handles a whole request body, which may be a single message or a batch. */
export async function handleBody(
  body: unknown,
  caller: Caller,
  operations: Operations,
): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(body)) {
    const responses: RpcResponse[] = [];
    for (const message of body) {
      const response = await handle(message as RpcRequest, caller, operations);
      if (response) responses.push(response);
    }
    return responses.length > 0 ? responses : null;
  }

  if (!body || typeof body !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Invalid JSON-RPC body." } };
  }

  return handle(body as RpcRequest, caller, operations);
}

export { INTERNAL_ERROR };
