/**
 * §28 — MCPfy operated through MCP.
 *
 * An MCP platform that cannot itself be driven by an agent is a strange
 * thing to sell. This exposes the control plane as a server, so "deploy
 * customer-mcp and tell me why the last one failed" works from Claude or
 * Cursor.
 *
 * The operations are injected rather than imported so the protocol layer,
 * the tool definitions and the authorization rules can all be tested without
 * a database.
 */

export type Role = "owner" | "admin" | "developer" | "viewer";

export interface Caller {
  organizationId: string;
  organizationSlug: string;
  role: Role;
  apiKeyId?: string;
}

/** Everything the control tools can do. Implemented over the app's own data. */
export interface Operations {
  listServers(caller: Caller): Promise<unknown>;
  getServer(caller: Caller, slug: string): Promise<unknown>;
  listDeployments(caller: Caller, slug: string, limit: number): Promise<unknown>;
  getDeploymentLogs(
    caller: Caller,
    deploymentNumber: number,
    slug: string,
    tail: number,
  ): Promise<unknown>;
  getAnalytics(caller: Caller, slug: string, range: string): Promise<unknown>;
  getReadiness(caller: Caller, slug: string): Promise<unknown>;
  listServerTools(caller: Caller, slug: string): Promise<unknown>;
  deployServer(caller: Caller, slug: string): Promise<unknown>;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ControlTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: Record<string, unknown>;
  /** The minimum role that may call this. Below it, the tool is not listed. */
  minimumRole: Role;
  run(
    operations: Operations,
    caller: Caller,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  developer: 1,
  admin: 2,
  owner: 3,
};

export function permits(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
