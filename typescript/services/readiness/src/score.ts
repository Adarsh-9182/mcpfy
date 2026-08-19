import type {
  Category,
  Check,
  ReadinessInput,
  Report,
  Severity,
  ToolInput,
} from "./types";

/**
 * Severity weights.
 *
 * A blocker is something that makes the server unusable or unsafe; an
 * advisory is a nicety. Scoring by weight rather than by pass count stops a
 * server with twelve cosmetic wins and one broken handshake from looking
 * healthy.
 */
const WEIGHT: Record<Severity, number> = {
  blocker: 10,
  important: 4,
  advisory: 1,
};

/**
 * Below this, a description exists but says nothing useful. An agent chooses
 * tools by reading these; "does stuff" is functionally the same as blank.
 */
const MIN_DESCRIPTION = 25;

/** Verbs that suggest a tool changes or destroys something. */
const DESTRUCTIVE = /^(delete|remove|drop|destroy|purge|truncate|revoke|cancel|refund|terminate|wipe|reset)[_\-]?/i;

/** Values that look like credentials rather than documentation. */
const SECRET_SHAPED =
  /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

export function score(input: ReadinessInput): Report {
  const checks: Check[] = [];
  const behaviourSkipped = input.totalRequests === 0;

  checks.push(...protocolChecks(input));
  checks.push(...schemaChecks(input));
  checks.push(...descriptionChecks(input));
  checks.push(...safetyChecks(input));
  if (!behaviourSkipped) checks.push(...behaviourChecks(input));

  // A failed blocker caps the score: a server that cannot complete a
  // handshake is not "82% ready", it is not ready.
  const hasBlocker = checks.some((c) => !c.passed && c.severity === "blocker");

  const earned = checks
    .filter((c) => c.passed)
    .reduce((sum, c) => sum + WEIGHT[c.severity], 0);
  const possible = checks.reduce((sum, c) => sum + WEIGHT[c.severity], 0);

  const raw = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  const finalScore = hasBlocker ? Math.min(raw, 49) : raw;

  return {
    score: finalScore,
    grade: hasBlocker ? "not_ready" : finalScore >= 85 ? "ready" : "nearly",
    checks,
    summary: {
      blockers: checks.filter((c) => !c.passed && c.severity === "blocker").length,
      important: checks.filter((c) => !c.passed && c.severity === "important")
        .length,
      advisory: checks.filter((c) => !c.passed && c.severity === "advisory").length,
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
    },
    behaviourSkipped,
  };
}

/* --------------------------------------------------------------- protocol */

function protocolChecks(input: ReadinessInput): Check[] {
  const { connectivity, tools } = input;

  const checks: Check[] = [
    check({
      id: "handshake",
      category: "protocol",
      severity: "blocker",
      title: "Completes the MCP handshake",
      passed: connectivity.handshakeOk,
      detail: connectivity.handshakeError ?? undefined,
      remedy:
        "The server must answer an initialize request. Check that it is " +
        "running and reachable, and that it speaks MCP rather than a plain " +
        "HTTP API — a REST endpoint will connect and then fail this.",
    }),
    check({
      id: "has-tools",
      category: "protocol",
      severity: "blocker",
      title: "Advertises at least one tool",
      passed: tools.length > 0,
      detail: "tools/list returned nothing.",
      remedy:
        "A server with no tools gives an agent nothing to call. Register a tool " +
        "before publishing.",
    }),
  ];

  if (connectivity.protocolVersion) {
    checks.push(
      check({
        id: "protocol-version",
        category: "protocol",
        severity: "advisory",
        title: "Negotiates a dated protocol version",
        passed: /^\d{4}-\d{2}-\d{2}$/.test(connectivity.protocolVersion),
        detail: `Negotiated "${connectivity.protocolVersion}".`,
        remedy:
          "Recent MCP versions are dated, e.g. 2025-06-18. An undated version " +
          "usually means an old SDK.",
      }),
    );
  }

  return checks;
}

/* ----------------------------------------------------------------- schema */

function schemaChecks(input: ReadinessInput): Check[] {
  const { tools } = input;
  if (tools.length === 0) return [];

  const noInput = tools.filter((t) => !hasProperties(t.inputSchema));
  const noOutput = tools.filter((t) => !t.outputSchema);
  const looseNames = tools.filter((t) => !/^[a-z][a-z0-9_]*$/.test(t.name));
  const unmarkedRequired = tools.filter(
    (t) => hasProperties(t.inputSchema) && !hasRequired(t.inputSchema),
  );

  return [
    check({
      id: "input-schema",
      category: "schema",
      severity: "important",
      title: "Every tool declares its arguments",
      passed: noInput.length === 0,
      subjects: noInput.map((t) => t.name),
      detail: `${noInput.length} of ${tools.length} tools declare no argument schema.`,
      remedy:
        "Without a schema an agent has to guess argument names, and gets them " +
        "wrong. Declare the input shape even when it is a single string.",
    }),
    check({
      id: "output-schema",
      category: "schema",
      severity: "advisory",
      title: "Tools declare what they return",
      passed: noOutput.length === 0,
      subjects: noOutput.map((t) => t.name),
      detail: `${noOutput.length} of ${tools.length} tools declare no output schema.`,
      remedy:
        "An outputSchema turns a wall of text into structured data the caller " +
        "can use, and lets MCPfy render results properly.",
    }),
    check({
      id: "required-marked",
      category: "schema",
      severity: "important",
      title: "Required arguments are marked required",
      passed: unmarkedRequired.length === 0,
      subjects: unmarkedRequired.map((t) => t.name),
      detail: `${unmarkedRequired.length} tools declare arguments but mark none as required.`,
      remedy:
        "If every argument is optional, an agent will omit the ones it is " +
        "unsure about and the call fails at runtime instead of at validation.",
    }),
    check({
      id: "tool-naming",
      category: "schema",
      severity: "advisory",
      title: "Tool names are lowercase and underscored",
      passed: looseNames.length === 0,
      subjects: looseNames.map((t) => t.name),
      detail: `${looseNames.length} tools use a different convention.`,
      remedy:
        "snake_case is what MCP clients and their users expect; mixed " +
        "conventions across one server read as unfinished.",
    }),
  ];
}

/* ----------------------------------------------------------- descriptions */

/**
 * The checks that matter most and are skipped most often.
 *
 * An agent selects a tool by reading its description. A tool that works
 * perfectly and describes itself badly will simply not be chosen — which
 * looks, from the outside, exactly like a tool that is broken.
 */
function descriptionChecks(input: ReadinessInput): Check[] {
  const { tools } = input;
  if (tools.length === 0) return [];

  const undescribed = tools.filter((t) => !t.description?.trim());
  const thin = tools.filter(
    (t) =>
      t.description?.trim() &&
      t.description.trim().length < MIN_DESCRIPTION,
  );

  const argsUndescribed: string[] = [];
  for (const tool of tools) {
    const properties = propertiesOf(tool.inputSchema);
    const missing = Object.entries(properties).filter(
      ([, prop]) => !String((prop as { description?: unknown }).description ?? "").trim(),
    );
    if (missing.length > 0) {
      argsUndescribed.push(
        `${tool.name} (${missing.map(([name]) => name).join(", ")})`,
      );
    }
  }

  return [
    check({
      id: "tool-described",
      category: "descriptions",
      severity: "important",
      title: "Every tool has a description",
      passed: undescribed.length === 0,
      subjects: undescribed.map((t) => t.name),
      detail: `${undescribed.length} of ${tools.length} tools have none.`,
      remedy:
        "An agent picks tools by reading descriptions. An undescribed tool is " +
        "effectively invisible, however well it works.",
    }),
    check({
      id: "description-substance",
      category: "descriptions",
      severity: "advisory",
      title: "Descriptions say something useful",
      passed: thin.length === 0,
      subjects: thin.map((t) => t.name),
      detail: `${thin.length} descriptions are under ${MIN_DESCRIPTION} characters.`,
      remedy:
        'Say what the tool does and when to reach for it. "Search" is a label; ' +
        '"Search customers by email domain, name or ID" is a description.',
    }),
    check({
      id: "arguments-described",
      category: "descriptions",
      severity: "important",
      title: "Arguments are described",
      passed: argsUndescribed.length === 0,
      subjects: argsUndescribed,
      detail: `${argsUndescribed.length} tools have undescribed arguments.`,
      remedy:
        "An undescribed argument is one the model has to infer from its name. " +
        "Say what goes in it, and give an example where the format is not obvious.",
    }),
  ];
}

/* ----------------------------------------------------------------- safety */

function safetyChecks(input: ReadinessInput): Check[] {
  const { tools } = input;
  if (tools.length === 0) return [];

  const destructive = tools.filter((t) => DESTRUCTIVE.test(t.name));
  const unannotated = destructive.filter(
    (t) => !(t.annotations && "destructiveHint" in t.annotations),
  );

  const leaking = tools.filter((t) =>
    SECRET_SHAPED.test(
      `${t.description ?? ""} ${JSON.stringify(t.inputSchema ?? {})}`,
    ),
  );

  return [
    check({
      id: "destructive-annotated",
      category: "safety",
      severity: "important",
      title: "Destructive tools are marked destructive",
      passed: unannotated.length === 0,
      subjects: unannotated.map((t) => t.name),
      detail: `${unannotated.length} tools look destructive but carry no destructiveHint.`,
      remedy:
        "Set annotations.destructiveHint so clients can ask the user before " +
        "running it. A model will happily call delete_customer if nothing says not to.",
    }),
    check({
      id: "no-secrets-in-schema",
      category: "safety",
      severity: "blocker",
      title: "No credentials in descriptions or schemas",
      passed: leaking.length === 0,
      subjects: leaking.map((t) => t.name),
      detail: "Something shaped like an API key appears in tool metadata.",
      remedy:
        "Tool metadata is sent to every client that connects. Move the value to " +
        "an environment variable and rotate it — assume it is already public.",
    }),
  ];
}

/* -------------------------------------------------------------- behaviour */

/**
 * The half a static checklist cannot do.
 *
 * These read what the gateway recorded. A tool can pass every schema check
 * and still fail four calls in five; a server can look complete and have half
 * its surface area never touched by anything.
 */
function behaviourChecks(input: ReadinessInput): Check[] {
  const { tools, traffic } = input;
  const byName = new Map(traffic.map((t) => [t.toolName, t]));

  const failing = traffic.filter(
    (t) => t.calls >= 3 && t.errors / t.calls > 0.1,
  );
  const alwaysFailing = traffic.filter((t) => t.calls >= 3 && t.errors === t.calls);
  const slow = traffic.filter((t) => (t.p95 ?? 0) > 3000);
  const neverCalled = tools.filter((t) => !byName.has(t.name));

  return [
    check({
      id: "tools-succeed",
      category: "behaviour",
      severity: "important",
      title: "Tools succeed more often than they fail",
      passed: failing.length === 0,
      subjects: failing.map(
        (t) => `${t.toolName} (${Math.round((t.errors / t.calls) * 100)}% failing)`,
      ),
      detail: `${failing.length} tools fail more than 1 call in 10.`,
      remedy:
        "Open the Inspector and run the failing call. A high failure rate is " +
        "usually a schema that permits arguments the implementation rejects.",
    }),
    check({
      id: "no-dead-tools",
      category: "behaviour",
      severity: "blocker",
      title: "No tool fails every single call",
      passed: alwaysFailing.length === 0,
      subjects: alwaysFailing.map((t) => t.toolName),
      detail: `${alwaysFailing.length} tools have never returned a success.`,
      remedy:
        "A tool that has never succeeded is worse than a missing one: the agent " +
        "keeps choosing it and the conversation keeps failing.",
    }),
    check({
      id: "latency",
      category: "behaviour",
      severity: "advisory",
      title: "Tools respond within three seconds at p95",
      passed: slow.length === 0,
      subjects: slow.map((t) => `${t.toolName} (${t.p95}ms)`),
      detail: `${slow.length} tools exceed 3s at p95.`,
      remedy:
        "Slow tools make an agent look stuck. Cache, paginate, or split the " +
        "work into a start and a poll.",
    }),
    check({
      id: "surface-used",
      category: "behaviour",
      severity: "advisory",
      title: "Every advertised tool gets used",
      passed: neverCalled.length === 0,
      subjects: neverCalled.map((t) => t.name),
      detail: `${neverCalled.length} of ${tools.length} tools have never been called.`,
      remedy:
        "Unused tools are surface area you maintain and an agent has to read " +
        "past. Either improve the description so it gets chosen, or remove it.",
    }),
  ];
}

/* ------------------------------------------------------------------ utils */

function check(input: Omit<Check, "detail" | "remedy"> & {
  detail?: string;
  remedy?: string;
}): Check {
  // A passing check carries no complaint — detail and remedy describe a
  // failure, and leaving them on a pass produces confusing UI.
  if (input.passed) {
    return {
      id: input.id,
      category: input.category,
      severity: input.severity,
      title: input.title,
      passed: true,
    };
  }
  return { ...input, subjects: input.subjects?.slice(0, 12) };
}

function propertiesOf(
  schema: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const properties = schema?.properties;
  return properties && typeof properties === "object"
    ? (properties as Record<string, unknown>)
    : {};
}

function hasProperties(schema: Record<string, unknown> | null | undefined): boolean {
  return Object.keys(propertiesOf(schema)).length > 0;
}

function hasRequired(schema: Record<string, unknown> | null | undefined): boolean {
  return Array.isArray(schema?.required) && schema.required.length > 0;
}

export type { ToolInput };
