import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { environment, server } from "./core";
import { primaryId, timestamps } from "./_shared";

/** §11 — the full state machine. Transitions are validated in ../transitions.ts. */
export const deploymentStatusEnum = pgEnum("deployment_status", [
  "queued",
  "building",
  "deploying",
  "health_check",
  "live",
  "failed",
  "cancelled",
  "rolled_back",
]);

export const deployment = pgTable(
  "deployment",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => environment.id, { onDelete: "cascade" }),
    /** Monotonic per server, so the UI can say "Deployment #14". */
    number: integer("number").notNull(),
    status: deploymentStatusEnum("status").notNull().default("queued"),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
    commitAuthor: text("commit_author"),
    branch: text("branch"),
    endpointUrl: text("endpoint_url"),
    /** Populated on `failed` — surfaced verbatim in the §35 error UI. */
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    triggeredByUserId: text("triggered_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    trigger: text("trigger").notNull().default("manual"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("deployment_server_number_idx").on(t.serverId, t.number),
    index("deployment_env_created_idx").on(t.environmentId, t.createdAt),
    index("deployment_status_idx").on(t.status),
  ],
);

/** Build log lines, appended during BUILDING. Streamed to the UI over SSE. */
export const buildLog = pgTable(
  "build_log",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deployment.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    stream: text("stream").notNull().default("stdout"),
    message: text("message").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("build_log_deployment_seq_idx").on(t.deploymentId, t.seq)],
);

export const domain = pgTable(
  "domain",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    environmentId: text("environment_id").references(() => environment.id, {
      onDelete: "cascade",
    }),
    hostname: text("hostname").notNull(),
    verified: integer("verified").notNull().default(0),
    verificationToken: text("verification_token"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("domain_hostname_idx").on(t.hostname)],
);

/**
 * §25 — values are never stored in plaintext. `ciphertext` is AES-256-GCM
 * output from ../crypto.ts; the key lives in the server environment only.
 */
export const secret = pgTable(
  "secret",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    environmentId: text("environment_id").references(() => environment.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    /** Shown in the UI instead of the value, e.g. "sk-…9f2a". */
    preview: text("preview").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("secret_scope_key_idx").on(t.serverId, t.environmentId, t.key),
  ],
);

/** §25 — append-only. Never updated, never deleted by application code. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorApiKeyId: text("actor_api_key_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_at_idx").on(t.organizationId, t.at)],
);

export const deploymentRelations = relations(deployment, ({ one, many }) => ({
  server: one(server, {
    fields: [deployment.serverId],
    references: [server.id],
  }),
  environment: one(environment, {
    fields: [deployment.environmentId],
    references: [environment.id],
  }),
  logs: many(buildLog),
}));
