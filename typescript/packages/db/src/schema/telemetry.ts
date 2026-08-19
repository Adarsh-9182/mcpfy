import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { environment, server } from "./core";
import { primaryId } from "./_shared";

/**
 * §15/§26 — high-volume tables. Every read path must filter on
 * (organization_id, server_id, at) and use a bounded time window; see
 * ../analytics.ts. Never SELECT * across these without a range.
 */

export const callOutcomeEnum = pgEnum("call_outcome", [
  "ok",
  "error",
  "timeout",
  "unauthorized",
  "rate_limited",
]);

/** §16 — one row per MCP client connection, the root of a session replay. */
export const mcpSession = pgTable(
  "mcp_session",
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
    /** Session id as reported by the MCP transport, if the client sent one. */
    externalId: text("external_id"),
    clientName: text("client_name"),
    clientVersion: text("client_version"),
    protocolVersion: text("protocol_version"),
    model: text("model"),
    region: text("region"),
    country: text("country"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    requestCount: integer("request_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
  },
  (t) => [
    index("mcp_session_server_started_idx").on(t.serverId, t.startedAt),
    index("mcp_session_org_started_idx").on(t.organizationId, t.startedAt),
    /*
     * The natural key for a session. A client's session id is only unique
     * within the server that issued it, so keying on it alone would merge two
     * customers' conversations that happened to collide.
     */
    uniqueIndex("mcp_session_server_external_idx").on(t.serverId, t.externalId),
  ],
);

/** One row per JSON-RPC message handled by the gateway. */
export const requestLog = pgTable(
  "request_log",
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
    sessionId: text("session_id").references(() => mcpSession.id, {
      onDelete: "cascade",
    }),
    traceId: text("trace_id").notNull(),
    requestId: text("request_id").notNull(),
    /** JSON-RPC method: tools/call, tools/list, resources/read, … */
    method: text("method").notNull(),
    outcome: callOutcomeEnum("outcome").notNull(),
    statusCode: integer("status_code"),
    durationMs: doublePrecision("duration_ms").notNull(),
    requestBytes: integer("request_bytes"),
    responseBytes: integer("response_bytes"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("request_log_server_at_idx").on(t.serverId, t.at),
    index("request_log_org_at_idx").on(t.organizationId, t.at),
    index("request_log_trace_idx").on(t.traceId),
    index("request_log_session_at_idx").on(t.sessionId, t.at),
  ],
);

/**
 * Tool calls are denormalised out of request_log because §14 and §15 query
 * them by tool name far more often than by method, and the join was the
 * single most expensive part of the analytics page.
 *
 * Argument *values* are never stored — only which keys were present. This
 * matches the guarantee mcpfy-pulse already makes in its README.
 */
export const toolCall = pgTable(
  "tool_call",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => mcpSession.id, {
      onDelete: "cascade",
    }),
    requestLogId: text("request_log_id").references(() => requestLog.id, {
      onDelete: "cascade",
    }),
    traceId: text("trace_id").notNull(),
    toolName: text("tool_name").notNull(),
    argumentKeys: jsonb("argument_keys").$type<string[]>(),
    outcome: callOutcomeEnum("outcome").notNull(),
    durationMs: doublePrecision("duration_ms").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tool_call_server_at_idx").on(t.serverId, t.at),
    index("tool_call_server_tool_at_idx").on(t.serverId, t.toolName, t.at),
    index("tool_call_session_at_idx").on(t.sessionId, t.at),
  ],
);

/** §26 — OpenTelemetry-shaped spans, so we can export without remodelling. */
export const traceSpan = pgTable(
  "trace_span",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("internal"),
    statusCode: text("status_code").notNull().default("unset"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: doublePrecision("duration_ms").notNull(),
  },
  (t) => [
    index("trace_span_trace_idx").on(t.traceId),
    index("trace_span_server_started_idx").on(t.serverId, t.startedAt),
  ],
);
