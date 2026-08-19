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
import { server } from "./core";
import type { OrgRole } from "./auth";
import { primaryId, timestamps } from "./_shared";

/** §18 — marketplace listings. A listing may point at a server we host or an
 *  external URL we merely index. */
export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "in_review",
  "published",
  "unlisted",
  "rejected",
]);

export const marketplaceListing = pgTable(
  "marketplace_listing",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serverId: text("server_id").references(() => server.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    readme: text("readme"),
    category: text("category").notNull(),
    authKind: text("auth_kind").notNull().default("none"),
    endpointUrl: text("endpoint_url"),
    repositoryUrl: text("repository_url"),
    homepageUrl: text("homepage_url"),
    status: listingStatusEnum("status").notNull().default("draft"),
    verified: integer("verified").notNull().default(0),
    installCount: integer("install_count").notNull().default(0),
    toolCount: integer("tool_count").notNull().default(0),
    version: text("version"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("marketplace_listing_slug_idx").on(t.slug),
    index("marketplace_listing_status_category_idx").on(t.status, t.category),
  ],
);

/** §19 — templates are curated repositories, not user data. */
export const template = pgTable(
  "template",
  {
    id: primaryId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    language: text("language").notNull(),
    framework: text("framework").notNull(),
    authKind: text("auth_kind").notNull().default("none"),
    repositoryUrl: text("repository_url").notNull(),
    demoUrl: text("demo_url"),
    stars: integer("stars").notNull().default(0),
    toolNames: jsonb("tool_names").$type<string[]>(),
    featured: integer("featured").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("template_slug_idx").on(t.slug)],
);

/**
 * §24/§25 — only the hash is stored. The plaintext key is shown exactly once,
 * at creation, and cannot be recovered afterwards.
 */
export const apiKey = pgTable(
  "api_key",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 of the full key. Lookups hash the presented key and match here. */
    keyHash: text("key_hash").notNull(),
    /** First 12 chars, e.g. "mcpfy_live_a" — used to identify a key in the UI. */
    prefix: text("prefix").notNull(),
    /** Keys never exceed the role of the member who created them. */
    role: text("role").notNull().default("developer").$type<OrgRole>(),
    scopes: jsonb("scopes").$type<string[]>(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("api_key_hash_idx").on(t.keyHash),
    index("api_key_org_idx").on(t.organizationId),
  ],
);

/** §39 — webhook endpoints and their delivery history. */
export const webhook = pgTable(
  "webhook",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: jsonb("events").$type<string[]>().notNull(),
    signingSecret: text("signing_secret").notNull(),
    active: integer("active").notNull().default(1),
    ...timestamps,
  },
  (t) => [index("webhook_org_idx").on(t.organizationId)],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhook.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    statusCode: integer("status_code"),
    attempt: integer("attempt").notNull().default(1),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_delivery_webhook_at_idx").on(t.webhookId, t.at)],
);

/**
 * §31 — what an organization is paying for.
 *
 * One row per organization, created lazily on first upgrade. Its absence
 * means the free plan, so nothing has to backfill a row for every signup and
 * a missing record can never lock anyone out.
 *
 * The plan is stored here rather than read from Stripe on each request:
 * an entitlement check happens on every server creation and every page load,
 * and none of those should depend on a third party being reachable.
 */
export const subscription = pgTable(
  "subscription",
  {
    id: primaryId(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** free | hobby | startup | enterprise. Validated by the billing service. */
    plan: text("plan").notNull().default("free"),
    /** Stripe's status, kept verbatim so it can be shown without translation. */
    status: text("status").notNull().default("active"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("subscription_org_idx").on(t.organizationId),
    index("subscription_stripe_customer_idx").on(t.stripeCustomerId),
  ],
);

/**
 * §31 — a record of every billing event that changed something.
 *
 * Append-only. When a customer asks why their plan changed, the answer has to
 * come from somewhere other than a Stripe dashboard neither of you can read
 * together.
 */
export const billingEvent = pgTable(
  "billing_event",
  {
    id: primaryId(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    stripeEventId: text("stripe_event_id"),
    type: text("type").notNull(),
    fromPlan: text("from_plan"),
    toPlan: text("to_plan"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Stripe retries deliveries; the id makes replays a no-op rather than a
    // duplicate plan change.
    uniqueIndex("billing_event_stripe_idx").on(t.stripeEventId),
    index("billing_event_org_at_idx").on(t.organizationId, t.at),
  ],
);
