/**
 * §25/§44 — how ready a server is to be handed to agents.
 *
 * The distinguishing idea: a static checklist can tell you a tool has no
 * description. Only observed traffic can tell you that a tool is described
 * beautifully and fails four calls in five, or that half the surface area you
 * maintain has never been called by anything. Both halves are scored here.
 *
 * Scoring is a pure function of its inputs — no network, no database — so the
 * rules can be tested exhaustively and a score can be explained.
 */

export type Severity = "blocker" | "important" | "advisory";

export type Category = "protocol" | "schema" | "descriptions" | "behaviour" | "safety";

export interface Check {
  id: string;
  category: Category;
  severity: Severity;
  /** What was checked, phrased as the thing that should be true. */
  title: string;
  passed: boolean;
  /** Only when failed: what is wrong, in the reader's terms. */
  detail?: string;
  /** Only when failed: the specific next action. */
  remedy?: string;
  /** Named subjects, e.g. the tools that failed this check. */
  subjects?: string[];
}

export interface Report {
  /** 0–100. Weighted by severity, not a raw pass count. */
  score: number;
  grade: "ready" | "nearly" | "not_ready";
  checks: Check[];
  summary: {
    blockers: number;
    important: number;
    advisory: number;
    passed: number;
    total: number;
  };
  /** True when no traffic was available, so behaviour checks were skipped. */
  behaviourSkipped: boolean;
}

/* ------------------------------------------------------------------ input */

export interface ToolInput {
  name: string;
  title?: string | null;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  annotations?: Record<string, unknown> | null;
}

export interface ResourceInput {
  uri: string;
  name?: string | null;
  description?: string | null;
  mimeType?: string | null;
}

export interface PromptInput {
  name: string;
  description?: string | null;
  arguments?: Record<string, unknown>[] | null;
}

/** Per-tool behaviour, as recorded by the gateway. */
export interface ToolTraffic {
  toolName: string;
  calls: number;
  errors: number;
  p95: number | null;
}

export interface Connectivity {
  handshakeOk: boolean;
  protocolVersion?: string | null;
  handshakeError?: string | null;
  /** Capabilities the server answered "method not found" for. */
  unsupported: string[];
}

export interface ReadinessInput {
  connectivity: Connectivity;
  tools: ToolInput[];
  resources: ResourceInput[];
  prompts: PromptInput[];
  traffic: ToolTraffic[];
  /** Total requests seen, used to decide whether behaviour can be judged. */
  totalRequests: number;
}
