import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import type { RegistryListing } from "@mcpfy/registry";

/**
 * §8–§10 — reading the public registry.
 *
 * One rule governs this whole file, and it is the reason every query here is
 * written out rather than sharing a helper with the dashboard: **only
 * `published` listings exist to the public.** A draft is someone's unfinished
 * work, an `in_review` listing has not been checked, and a `rejected` one was
 * refused for a reason. None of them may be reachable by guessing a URL.
 *
 * The tenancy helpers used elsewhere (`scoped`, `owned`) are deliberately not
 * used here. They answer "does this row belong to the caller's organization",
 * which is the wrong question for a public page — the answer is almost always
 * no, and it should still render. Status is the access control instead.
 */

/** The single predicate that makes a listing public. Never inline it. */
const PUBLISHED = eq(schema.marketplaceListing.status, "published");

const COLUMNS = {
  id: schema.marketplaceListing.id,
  slug: schema.marketplaceListing.slug,
  name: schema.marketplaceListing.name,
  summary: schema.marketplaceListing.summary,
  category: schema.marketplaceListing.category,
  authKind: schema.marketplaceListing.authKind,
  serverId: schema.marketplaceListing.serverId,
  endpointUrl: schema.marketplaceListing.endpointUrl,
  repositoryUrl: schema.marketplaceListing.repositoryUrl,
  homepageUrl: schema.marketplaceListing.homepageUrl,
  version: schema.marketplaceListing.version,
  verified: schema.marketplaceListing.verified,
  installCount: schema.marketplaceListing.installCount,
  toolCount: schema.marketplaceListing.toolCount,
  publishedAt: schema.marketplaceListing.publishedAt,
  updatedAt: schema.marketplaceListing.updatedAt,
  publisherName: schema.organization.name,
  publisherSlug: schema.organization.slug,
} as const;

type Row = {
  [K in keyof typeof COLUMNS]: K extends "verified" | "installCount" | "toolCount"
    ? number
    : K extends "publishedAt"
      ? Date | null
      : K extends "updatedAt"
        ? Date
        : string | null;
};

function toListing(row: Row): RegistryListing {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    summary: String(row.summary),
    category: String(row.category),
    authKind: String(row.authKind ?? "none"),
    serverId: row.serverId ? String(row.serverId) : null,
    endpointUrl: row.endpointUrl ? String(row.endpointUrl) : null,
    repositoryUrl: row.repositoryUrl ? String(row.repositoryUrl) : null,
    homepageUrl: row.homepageUrl ? String(row.homepageUrl) : null,
    version: row.version ? String(row.version) : null,
    // Stored as an integer because the column predates a boolean being needed.
    verified: row.verified === 1,
    installCount: row.installCount,
    toolCount: row.toolCount,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    readinessScore: null,
    publisher: {
      name: String(row.publisherName ?? "Unknown"),
      slug: row.publisherSlug ? String(row.publisherSlug) : null,
    },
  };
}

/**
 * Every published listing.
 *
 * Filtering and ordering happen in @mcpfy/registry rather than in SQL. That is
 * a deliberate trade for a registry of this size: the ranking model is worth
 * more as something tested and explainable than as a clause nobody can read,
 * and it is the same code that orders search results. When the table outgrows
 * a single fetch, the coarse filter moves into SQL and the ordering stays.
 */
export async function publishedListings(): Promise<RegistryListing[]> {
  const rows = await db()
    .select(COLUMNS)
    .from(schema.marketplaceListing)
    .innerJoin(
      schema.organization,
      eq(schema.marketplaceListing.organizationId, schema.organization.id),
    )
    .where(PUBLISHED)
    .limit(1000);

  return (rows as Row[]).map(toListing);
}

/** Null, never a draft, when the slug does not name a published listing. */
export async function listingBySlug(slug: string): Promise<RegistryListing | null> {
  const rows = await db()
    .select(COLUMNS)
    .from(schema.marketplaceListing)
    .innerJoin(
      schema.organization,
      eq(schema.marketplaceListing.organizationId, schema.organization.id),
    )
    .where(and(PUBLISHED, eq(schema.marketplaceListing.slug, slug.toLowerCase())))
    .limit(1);

  const row = (rows as Row[])[0];
  return row ? toListing(row) : null;
}

/**
 * §9 — the tools a listing exposes.
 *
 * Only available for a listing MCPfy hosts: the tool table is populated by our
 * own inspection during deployment. An indexed third-party listing returns an
 * empty list, which the page states rather than leaving as a blank panel.
 */
export async function listingTools(serverId: string | null): Promise<
  { name: string; description: string | null }[]
> {
  if (!serverId) return [];
  const rows = await db()
    .select({ name: schema.tool.name, description: schema.tool.description })
    .from(schema.tool)
    .where(eq(schema.tool.serverId, serverId))
    .limit(200);
  return rows;
}

/** How many published listings sit in each category, for the §8 browse grid. */
export async function categoryCounts(): Promise<Record<string, number>> {
  const rows = await db()
    .select({
      category: schema.marketplaceListing.category,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.marketplaceListing)
    .where(PUBLISHED)
    .groupBy(schema.marketplaceListing.category);

  return Object.fromEntries(rows.map((r) => [String(r.category), Number(r.n)]));
}

/** Listings owned by one organization, for a §23 publisher profile. */
export async function listingsByPublisher(orgSlug: string): Promise<RegistryListing[]> {
  const rows = await db()
    .select(COLUMNS)
    .from(schema.marketplaceListing)
    .innerJoin(
      schema.organization,
      eq(schema.marketplaceListing.organizationId, schema.organization.id),
    )
    .where(and(PUBLISHED, eq(schema.organization.slug, orgSlug)))
    .limit(200);

  return (rows as Row[]).map(toListing);
}

