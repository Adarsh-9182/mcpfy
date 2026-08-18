/**
 * §10 — detection output.
 *
 * Detection is a backend service, never logic inside a UI component: the same
 * answer has to be reachable from the import screen, the CLI and a webhook
 * redeploy, and it has to be testable without a browser.
 */

export type McpFramework =
  | "mcpfy_sdk"
  | "mcp_sdk_typescript"
  | "mcp_sdk_python"
  | "fastmcp"
  | "mcp_use"
  | "docker"
  | "unknown";

export type Runtime =
  | "node20"
  | "node22"
  | "python311"
  | "python312"
  | "docker";

export type Language = "typescript" | "javascript" | "python" | "other";

export type PackageManager =
  | "npm"
  | "pnpm"
  | "yarn"
  | "bun"
  | "pip"
  | "uv"
  | "poetry";

/**
 * Why we concluded what we concluded. Shown verbatim on the import screen —
 * a developer who disagrees with the detection needs to see what we looked at
 * before they override it, and §35 wants errors that explain themselves.
 */
export interface Evidence {
  file: string;
  reason: string;
}

export interface Detection {
  framework: McpFramework;
  runtime: Runtime;
  language: Language;
  /** Relative to the repository root; "." when the project is not nested. */
  rootDirectory: string;
  packageManager: PackageManager | null;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  /**
   * high   — an MCP dependency was found by name.
   * medium — a runtime was identified but no MCP library was.
   * low    — nothing conclusive; the user must fill in the commands.
   */
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  warnings: string[];
}

/**
 * The only thing detection needs from a repository. GitHub, a local checkout
 * and a test fixture all satisfy it, which is what keeps this package free of
 * network code.
 */
export interface SourceTree {
  /** Paths relative to the repository root, one directory level. */
  list(directory: string): Promise<string[]>;
  /** File contents, or null when the path does not exist. */
  read(path: string): Promise<string | null>;
}
