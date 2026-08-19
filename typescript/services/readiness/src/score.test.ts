import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { score } from "./score";
import type { ReadinessInput, ToolInput } from "./types";

/** A tool that passes every static check, as the baseline to vary from. */
const goodTool = (over: Partial<ToolInput> = {}): ToolInput => ({
  name: "search_customers",
  description: "Search customers by email domain, name or ID.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search term." },
    },
    required: ["query"],
  },
  outputSchema: { type: "object", properties: { customers: { type: "array" } } },
  ...over,
});

const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  connectivity: {
    handshakeOk: true,
    protocolVersion: "2025-06-18",
    unsupported: [],
  },
  tools: [goodTool()],
  resources: [],
  prompts: [],
  traffic: [{ toolName: "search_customers", calls: 40, errors: 1, p95: 120 }],
  totalRequests: 40,
  ...over,
});

const find = (report: ReturnType<typeof score>, id: string) =>
  report.checks.find((c) => c.id === id)!;

describe("scoring", () => {
  test("a well-built server scores as ready", () => {
    const report = score(input());
    assert.equal(report.grade, "ready");
    assert.ok(report.score >= 85, `expected >= 85, got ${report.score}`);
    assert.equal(report.summary.blockers, 0);
  });

  test("a failed blocker caps the score below halfway", () => {
    // A server that cannot handshake is not "82% ready" — it is not ready,
    // and a score that reads well would be actively misleading.
    const report = score(
      input({
        connectivity: {
          handshakeOk: false,
          handshakeError: "fetch failed",
          unsupported: [],
        },
      }),
    );
    assert.equal(report.grade, "not_ready");
    assert.ok(report.score <= 49, `expected <= 49, got ${report.score}`);
  });

  test("severity is weighted, not counted", () => {
    // Many small wins must not outweigh one serious failure.
    const cosmeticProblems = score(
      input({
        tools: [
          goodTool({ name: "SearchCustomers", outputSchema: null }),
        ],
      }),
    );
    const seriousProblem = score(
      input({ tools: [goodTool({ description: null })] }),
    );
    assert.ok(
      cosmeticProblems.score > seriousProblem.score,
      `${cosmeticProblems.score} should beat ${seriousProblem.score}`,
    );
  });

  test("passing checks carry no complaint", () => {
    const report = score(input());
    for (const check of report.checks.filter((c) => c.passed)) {
      assert.equal(check.detail, undefined, check.id);
      assert.equal(check.remedy, undefined, check.id);
    }
  });

  test("every failure explains itself and names a next action", () => {
    const report = score(
      input({
        tools: [
          {
            name: "DoThing",
            description: null,
            inputSchema: null,
            outputSchema: null,
          },
        ],
      }),
    );
    for (const check of report.checks.filter((c) => !c.passed)) {
      assert.ok(check.detail, `${check.id} has no detail`);
      assert.ok(check.remedy, `${check.id} has no remedy`);
    }
  });
});

describe("description checks", () => {
  test("an undescribed tool fails", () => {
    const report = score(input({ tools: [goodTool({ description: null })] }));
    assert.equal(find(report, "tool-described").passed, false);
  });

  test("a description that says nothing is caught", () => {
    // "Search" is a label, not a description. An agent choosing between
    // tools gets nothing from it.
    const report = score(input({ tools: [goodTool({ description: "Search" })] }));
    assert.equal(find(report, "description-substance").passed, false);
    assert.equal(find(report, "tool-described").passed, true);
  });

  test("undescribed arguments are named individually", () => {
    const report = score(
      input({
        tools: [
          goodTool({
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search term." },
                limit: { type: "number" },
              },
              required: ["query"],
            },
          }),
        ],
      }),
    );
    const check = find(report, "arguments-described");
    assert.equal(check.passed, false);
    assert.match(check.subjects!.join(" "), /limit/);
  });
});

describe("safety checks", () => {
  test("a destructive-looking tool needs an annotation", () => {
    const report = score(
      input({
        tools: [goodTool({ name: "delete_customer" })],
        traffic: [],
        totalRequests: 0,
      }),
    );
    assert.equal(find(report, "destructive-annotated").passed, false);
  });

  test("an annotated destructive tool passes", () => {
    const report = score(
      input({
        tools: [
          goodTool({
            name: "delete_customer",
            annotations: { destructiveHint: true },
          }),
        ],
        traffic: [],
        totalRequests: 0,
      }),
    );
    assert.equal(find(report, "destructive-annotated").passed, true);
  });

  test("a credential in tool metadata is a blocker", () => {
    // Tool metadata goes to every client that connects. A key in a
    // description is already public.
    const report = score(
      input({
        tools: [
          goodTool({
            description: "Search customers. Use key sk-abcdefghijklmnop1234 for access.",
          }),
        ],
      }),
    );
    const check = find(report, "no-secrets-in-schema");
    assert.equal(check.passed, false);
    assert.equal(check.severity, "blocker");
    assert.equal(report.grade, "not_ready");
  });

  test("ordinary prose is not mistaken for a secret", () => {
    const report = score(
      input({
        tools: [
          goodTool({
            description:
              "Search customers by email domain, name or ID. Returns at most 50.",
          }),
        ],
      }),
    );
    assert.equal(find(report, "no-secrets-in-schema").passed, true);
  });
});

describe("behaviour checks", () => {
  test("skipped entirely when there is no traffic to judge", () => {
    // Scoring behaviour from zero requests would invent a verdict.
    const report = score(input({ traffic: [], totalRequests: 0 }));
    assert.equal(report.behaviourSkipped, true);
    assert.equal(
      report.checks.some((c) => c.category === "behaviour"),
      false,
    );
  });

  test("a tool failing most calls is caught even with a perfect schema", () => {
    // The whole point of reading traffic: this tool passes every static
    // check a checklist could run.
    const report = score(
      input({
        traffic: [{ toolName: "search_customers", calls: 20, errors: 9, p95: 90 }],
        totalRequests: 20,
      }),
    );
    const check = find(report, "tools-succeed");
    assert.equal(check.passed, false);
    assert.match(check.subjects!.join(" "), /45% failing/);
  });

  test("a tool that has never succeeded is a blocker", () => {
    const report = score(
      input({
        traffic: [{ toolName: "search_customers", calls: 8, errors: 8, p95: 90 }],
        totalRequests: 8,
      }),
    );
    assert.equal(find(report, "no-dead-tools").passed, false);
    assert.equal(report.grade, "not_ready");
  });

  test("a couple of failures out of many is not flagged", () => {
    // Every real server errors sometimes. Flagging that would train people
    // to ignore the report.
    const report = score(
      input({
        traffic: [{ toolName: "search_customers", calls: 100, errors: 3, p95: 90 }],
        totalRequests: 100,
      }),
    );
    assert.equal(find(report, "tools-succeed").passed, true);
  });

  test("too few calls to judge is not treated as failure", () => {
    const report = score(
      input({
        traffic: [{ toolName: "search_customers", calls: 2, errors: 2, p95: 90 }],
        totalRequests: 2,
      }),
    );
    assert.equal(find(report, "no-dead-tools").passed, true);
  });

  test("an advertised tool nothing ever calls is surfaced", () => {
    const report = score(
      input({
        tools: [goodTool(), goodTool({ name: "unused_tool" })],
        traffic: [{ toolName: "search_customers", calls: 10, errors: 0, p95: 50 }],
        totalRequests: 10,
      }),
    );
    const check = find(report, "surface-used");
    assert.equal(check.passed, false);
    assert.deepEqual(check.subjects, ["unused_tool"]);
  });

  test("a slow tool is advisory, not a failure of the server", () => {
    const report = score(
      input({
        traffic: [{ toolName: "search_customers", calls: 10, errors: 0, p95: 8000 }],
        totalRequests: 10,
      }),
    );
    const check = find(report, "latency");
    assert.equal(check.passed, false);
    assert.equal(check.severity, "advisory");
  });
});

describe("protocol checks", () => {
  test("a server with no tools cannot be ready", () => {
    const report = score(input({ tools: [], traffic: [], totalRequests: 0 }));
    assert.equal(find(report, "has-tools").passed, false);
    assert.equal(report.grade, "not_ready");
  });

  test("subjects are capped so a broken server does not print a novel", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      goodTool({ name: `tool_${i}`, description: null }),
    );
    const report = score(input({ tools: many, traffic: [], totalRequests: 0 }));
    assert.ok(find(report, "tool-described").subjects!.length <= 12);
  });
});
