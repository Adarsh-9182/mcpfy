import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { environment, server } from "./core";
import { primaryId, timestamps } from "./_shared";

/** §17 — evaluations turn MCP reliability into a measurable workflow. */

export const evalRunStatusEnum = pgEnum("eval_run_status", [
  "queued",
  "running",
  "passed",
  "failed",
  "errored",
  "cancelled",
]);

export const evaluation = pgTable(
  "evaluation",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Natural-language input the agent is given. */
    input: text("input").notNull(),
    expectedTool: text("expected_tool"),
    expectedArguments: jsonb("expected_arguments").$type<
      Record<string, unknown>
    >(),
    /** JSONPath-ish assertions evaluated against the tool result. */
    assertions: jsonb("assertions").$type<Record<string, unknown>[]>(),
    enabled: integer("enabled").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("evaluation_server_idx").on(t.serverId)],
);

export const evaluationRun = pgTable(
  "evaluation_run",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    environmentId: text("environment_id").references(() => environment.id, {
      onDelete: "set null",
    }),
    status: evalRunStatusEnum("status").notNull().default("queued"),
    passedCount: integer("passed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    avgLatencyMs: doublePrecision("avg_latency_ms"),
    triggeredByUserId: text("triggered_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("evaluation_run_server_created_idx").on(t.serverId, t.createdAt)],
);

export const evaluationResult = pgTable(
  "evaluation_result",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => evaluationRun.id, { onDelete: "cascade" }),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluation.id, { onDelete: "cascade" }),
    passed: integer("passed").notNull(),
    actualTool: text("actual_tool"),
    actualArguments: jsonb("actual_arguments").$type<Record<string, unknown>>(),
    /** Why it failed, in the words we show the developer. */
    failureReason: text("failure_reason"),
    durationMs: doublePrecision("duration_ms"),
    traceId: text("trace_id"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evaluation_result_run_idx").on(t.runId)],
);
