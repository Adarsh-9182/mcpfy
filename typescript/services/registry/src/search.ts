import type { RegistryListing, SearchQuery, SortMode } from "./types";
import { isCategoryId } from "./categories";
import { rankListings, scoreListing } from "./rank";

/**
 * §8 — search.
 *
 * The database does the coarse filter; this decides the order of what comes
 * back. Splitting it that way keeps relevance testable without a database,
 * and keeps the ordering rules in one readable place instead of spread across
 * a long SQL expression.
 *
 * Field weights encode a simple claim: someone typing "stripe" wants the
 * Stripe integration, not the twelve listings whose README mentions Stripe.
 * So a name hit beats a summary hit by a wide margin, and an exact name match
 * beats a prefix.
 */

const FIELD_WEIGHT = {
  nameExact: 12,
  namePrefix: 7,
  nameWord: 5,
  slug: 4,
  summary: 1.5,
  category: 1,
} as const;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Relevance of one listing to one query, 0 when nothing matched.
 *
 * Every token must hit something. Requiring all tokens rather than any is
 * what makes a two-word query narrow the results instead of widening them —
 * "stripe invoice" should not return every Stripe listing plus every listing
 * about invoices.
 */
export function relevance(listing: RegistryListing, query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const name = listing.name.toLowerCase();
  const nameTokens = new Set(tokenize(listing.name));
  const slug = listing.slug.toLowerCase();
  const summary = listing.summary.toLowerCase();
  const category = String(listing.category).toLowerCase();

  let total = 0;

  for (const token of tokens) {
    let best = 0;

    if (name === token) best = Math.max(best, FIELD_WEIGHT.nameExact);
    if (name.startsWith(token)) best = Math.max(best, FIELD_WEIGHT.namePrefix);
    if (nameTokens.has(token)) best = Math.max(best, FIELD_WEIGHT.nameWord);
    if (slug.includes(token)) best = Math.max(best, FIELD_WEIGHT.slug);
    if (summary.includes(token)) best = Math.max(best, FIELD_WEIGHT.summary);
    if (category.includes(token)) best = Math.max(best, FIELD_WEIGHT.category);

    // One unmatched token disqualifies the listing entirely.
    if (best === 0) return 0;
    total += best;
  }

  return total;
}

export function parseSort(value: unknown): SortMode {
  return value === "installs" || value === "recent" || value === "name"
    ? value
    : "trending";
}

export function parseQuery(params: {
  q?: string | null;
  category?: string | null;
  verified?: string | null;
  sort?: string | null;
}): SearchQuery {
  return {
    text: (params.q ?? "").trim().slice(0, 120),
    category: isCategoryId(params.category) ? params.category : null,
    verifiedOnly: params.verified === "1" || params.verified === "true",
    sort: parseSort(params.sort),
  };
}

/**
 * Applies a query to a candidate set.
 *
 * When there is search text, relevance leads and the trending score only
 * breaks ties — someone who typed a name wants that name, not whatever is
 * popular. With no search text, the sort mode decides.
 */
export function applyQuery(
  listings: readonly RegistryListing[],
  query: SearchQuery,
  now: Date = new Date(),
): RegistryListing[] {
  let candidates = listings.filter((listing) => {
    if (query.category && listing.category !== query.category) return false;
    if (query.verifiedOnly && !listing.verified) return false;
    return true;
  });

  if (query.text) {
    const scored = candidates
      .map((listing) => ({
        listing,
        relevance: relevance(listing, query.text),
        rank: scoreListing(listing, now).score,
      }))
      .filter((row) => row.relevance > 0)
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          b.rank - a.rank ||
          a.listing.slug.localeCompare(b.listing.slug),
      );
    return scored.map((row) => row.listing);
  }

  switch (query.sort) {
    case "installs":
      return [...candidates].sort(
        (a, b) =>
          b.installCount - a.installCount || a.slug.localeCompare(b.slug),
      );
    case "recent":
      return [...candidates].sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) ||
          a.slug.localeCompare(b.slug),
      );
    case "name":
      return [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    case "trending":
    default:
      return rankListings(candidates, now).map((row) => row.listing);
  }
}
