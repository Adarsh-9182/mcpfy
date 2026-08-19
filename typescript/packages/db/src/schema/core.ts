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
import { primaryId, timestamps } from "./_shared";

/** §10 — detected by the backend detection service, never by a UI component. */
export const mcpFrameworkEnum = pgEnum("mcp_framework", [
  "mcpfy_sdk",
  "mcp_sdk_typescript",
  "mcp_sdk_python",
  "fastmcp",
  "mcp_use",
  "docker",
  "unknown",
]);

export const runtimeEnum = pgEnum("runtime", [
  "node20",
  "node22",
  "python311",
  "python312",
  "docker",
]);

export const transportEnum = pgEnum("mcp_transport", [
  "streamable_http",
  "sse",
  "stdio",
]);

export const healthEnum = pgEnum("health_status", [
  "unknown",
  "healthy",
  "degraded",
  "unhealthy",
]);

/** §12 — production is the promoted target; preview envs are per-branch. */
export const environmentKindEnum = pgEnum("environment_kind", [
  "production",
  "preview",
  "development",
]);

export const project = pgTable(
  "project",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("project_org_slug_idx").on(t.organizationId, t.slug)],
);

/**
 * §35 GitHubInstallation — one row per organization that has installed the
 * MCPfy GitHub App.
 *
 * The installation id is what everything else keys off: it is how MCPfy mints
 * a token to read a repository, and it is what a webhook payload carries so a
 * push can be traced back to an organization.
 */
export const githubInstallation = pgTable(
  "github_installation",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** GitHub's numeric installation id. */
    installationId: text("installation_id").notNull(),
    /** The GitHub account the app was installed on. */
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull().default("User"),
    /** "all" or "selected" — whether every repo is readable. */
    repositorySelection: text("repository_selection").notNull().default("selected"),
    installedByUserId: text("installed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("github_installation_external_idx").on(t.installationId),
    index("github_installation_org_idx").on(t.organizationId),
  ],
);

/** A connected GitHub repository. Installation id is the GitHub App install. */
export const repository = pgTable(
  "repository",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("github"),
    externalId: text("external_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    private: integer("private").notNull().default(0),
    installationId: text("installation_id"),
    connectedByUserId: text("connected_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("repository_provider_external_idx").on(
      t.provider,
      t.externalId,
    ),
    index("repository_org_idx").on(t.organizationId),
  ],
);

/**
 * §9 — a server is the unit users deploy and connect clients to. Its live
 * endpoint always resolves through the production environment.
 */
export const server = pgTable(
  "server",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id").references(() => repository.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    framework: mcpFrameworkEnum("framework").notNull().default("unknown"),
    runtime: runtimeEnum("runtime").notNull().default("node22"),
    transport: transportEnum("transport").notNull().default("streamable_http"),
    region: text("region").notNull().default("iad1"),
    rootDirectory: text("root_directory").notNull().default("."),
    /**
     * Populated by detection and overridable by the user. Null means "skip
     * this step", which is different from "we could not work it out" — that
     * case is recorded in `detection.warnings`.
     */
    installCommand: text("install_command"),
    buildCommand: text("build_command"),
    startCommand: text("start_command"),
    /** Detection output kept verbatim so we can explain *why* we chose a runtime. */
    detection: jsonb("detection").$type<Record<string, unknown>>(),
    health: healthEnum("health").notNull().default("unknown"),
    healthScore: integer("health_score"),
    /**
     * When health was last *verified*, not when it last changed. Without it,
     * a server whose process died an hour ago still reads "healthy" and the
     * dashboard is confidently wrong.
     */
    healthCheckedAt: timestamp("health_checked_at", { withTimezone: true }),
    healthDetail: text("health_detail"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("server_org_slug_idx").on(t.organizationId, t.slug),
    index("server_project_idx").on(t.projectId),
    index("server_repository_idx").on(t.repositoryId),
  ],
);

export const environment = pgTable(
  "environment",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => server.id, { onDelete: "cascade" }),
    kind: environmentKindEnum("kind").notNull(),
    name: text("name").notNull(),
    branch: text("branch"),
    /** Null until the first deployment reaches LIVE. */
    endpointUrl: text("endpoint_url"),
    currentDeploymentId: text("current_deployment_id"),
    ...timestamps,
  },
  (t) => [
    index("environment_server_idx").on(t.serverId),
    uniqueIndex("environment_server_name_idx").on(t.serverId, t.name),
  ],
);

export const projectRelations = relations(project, ({ one, many }) => ({
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
  servers: many(server),
}));

export const serverRelations = relations(server, ({ one, many }) => ({
  project: one(project, {
    fields: [server.projectId],
    references: [project.id],
  }),
  repository: one(repository, {
    fields: [server.repositoryId],
    references: [repository.id],
  }),
  environments: many(environment),
}));

export const environmentRelations = relations(environment, ({ one }) => ({
  server: one(server, {
    fields: [environment.serverId],
    references: [server.id],
  }),
}));
