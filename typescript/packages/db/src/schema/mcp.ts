import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { server } from "./core";
import { primaryId, timestamps } from "./_shared";

/**
 * §14 — the tool registry. Rows are written by the discovery pass that runs
 * after every deployment reaches HEALTH_CHECK, not by hand.
 */
export const tool = pgTable(
  "tool",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>(),
    annotations: jsonb("annotations").$type<Record<string, unknown>>(),
    /** Set when a discovery pass no longer sees the tool; rows are kept so
     *  historical tool_call rows still resolve to a name. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("tool_server_name_idx").on(t.serverId, t.name)],
);

export const resource = pgTable(
  "resource",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    uri: text("uri").notNull(),
    name: text("name"),
    description: text("description"),
    mimeType: text("mime_type"),
    ...timestamps,
  },
  (t) => [uniqueIndex("resource_server_uri_idx").on(t.serverId, t.uri)],
);

export const prompt = pgTable(
  "prompt",
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
    arguments: jsonb("arguments").$type<Record<string, unknown>[]>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("prompt_server_name_idx").on(t.serverId, t.name)],
);

/** §13 — a saved Inspector request the developer can replay. */
export const savedRequest = pgTable(
  "saved_request",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    method: text("method").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("saved_request_server_idx").on(t.serverId)],
);
