/**
 * §10 — one-click connection.
 *
 * "MCPfy generates the exact configuration" is only true if the shape of that
 * configuration is honest, and the six targets in §10 do not take the same
 * kind of thing. Three read a JSON file, one is a CLI command, and one has no
 * config file at all — its connectors are added through its own UI.
 *
 * Rendering a JSON blob for that last one would be worse than useless: it
 * would look authoritative and could never work. So a recipe is a tagged
 * union, and the UI renders whichever kind it gets.
 *
 * This lives in a service rather than beside the component that shows it
 * because two surfaces need it — the dashboard's connect panel and the public
 * registry page — and because logic sealed inside a "use client" module cannot
 * be imported by a server component or covered by a test.
 */

export const CLIENTS = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "claude-code", label: "Claude Code" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "custom", label: "Any MCP client" },
] as const;

export type ClientId = (typeof CLIENTS)[number]["id"];

export function isClientId(value: unknown): value is ClientId {
  return CLIENTS.some((c) => c.id === value);
}

/**
 * The placeholder shown instead of a real key.
 *
 * A generated snippet is copied, pasted into chat, and committed to git. It
 * must never contain a working credential, so the key is never substituted
 * here even when the caller happens to have one.
 */
export const KEY_PLACEHOLDER = "$MCPFY_API_KEY";

export type Recipe =
  | { kind: "file"; filename: string; language: "json"; code: string; note?: string }
  | { kind: "command"; shell: string; code: string; note?: string }
  | { kind: "manual"; steps: readonly string[]; note?: string };

export interface ConnectTarget {
  /** The name the client will show for this server. Must be config-key safe. */
  name: string;
  /** The MCPfy gateway endpoint. */
  endpoint: string;
  /** False for a public server that takes no MCPfy credential. */
  authenticated?: boolean;
}

/** Config keys are identifiers in several clients; keep them conservative. */
export function configKey(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "mcpfy-server";
}

export function recipeFor(client: ClientId, target: ConnectTarget): Recipe {
  const key = configKey(target.name);
  const authed = target.authenticated !== false;
  const headers = authed
    ? { Authorization: `Bearer ${KEY_PLACEHOLDER}` }
    : undefined;

  const json = (value: unknown) => JSON.stringify(value, null, 2);

  switch (client) {
    case "claude-desktop":
      return {
        kind: "file",
        filename: "claude_desktop_config.json",
        language: "json",
        code: json({
          mcpServers: { [key]: { type: "http", url: target.endpoint, ...(headers ? { headers } : {}) } },
        }),
        note: "Settings → Developer → Edit Config. Restart Claude Desktop after saving.",
      };

    case "claude-code":
      return {
        kind: "command",
        shell: "bash",
        code: authed
          ? `claude mcp add --transport http ${key} ${target.endpoint} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`
          : `claude mcp add --transport http ${key} ${target.endpoint}`,
        note: "Add --scope project to commit it to the repository instead of your user config.",
      };

    case "cursor":
      return {
        kind: "file",
        filename: ".cursor/mcp.json",
        language: "json",
        code: json({
          mcpServers: { [key]: { url: target.endpoint, ...(headers ? { headers } : {}) } },
        }),
        note: "Project-local. Use ~/.cursor/mcp.json to enable it everywhere.",
      };

    case "vscode":
      return {
        kind: "file",
        filename: ".vscode/mcp.json",
        language: "json",
        code: json({
          servers: { [key]: { type: "http", url: target.endpoint, ...(headers ? { headers } : {}) } },
        }),
        note: "VS Code nests servers under `servers`, not `mcpServers`.",
      };

    case "gemini":
      return {
        kind: "file",
        filename: "~/.gemini/settings.json",
        language: "json",
        code: json({
          mcpServers: {
            // Gemini distinguishes a streamable-HTTP server by the key name.
            [key]: { httpUrl: target.endpoint, ...(headers ? { headers } : {}) },
          },
        }),
        note: "Gemini uses `httpUrl` for streamable HTTP; `url` there means SSE.",
      };

    case "chatgpt":
      return {
        kind: "manual",
        steps: [
          "Open ChatGPT → Settings → Connectors.",
          "Choose Create, or Advanced → Developer mode if you do not see it.",
          `Paste the MCP server URL: ${target.endpoint}`,
          authed
            ? "Choose custom-header authentication and set Authorization to `Bearer <your MCPfy API key>`."
            : "Leave authentication set to none.",
          "Save, then enable the connector in a new conversation.",
        ],
        note:
          "ChatGPT has no configuration file — connectors are added in its own UI, " +
          "and availability depends on your ChatGPT plan.",
      };

    case "custom":
      return {
        kind: "manual",
        steps: [
          `Transport: Streamable HTTP.`,
          `Endpoint: ${target.endpoint}`,
          authed
            ? `Header: Authorization: Bearer <your MCPfy API key>`
            : `No authentication required.`,
          "The server speaks JSON-RPC 2.0; initialize, then tools/list.",
        ],
      };
  }
}

/** Every recipe at once — what the connect dialog renders as tabs. */
export function allRecipes(target: ConnectTarget): { id: ClientId; label: string; recipe: Recipe }[] {
  return CLIENTS.map((c) => ({ id: c.id, label: c.label, recipe: recipeFor(c.id, target) }));
}
