/**
 * §9 — a listing's public identity.
 *
 * The slug is the URL (`/registry/{slug}`) and it carries a unique index, so
 * it is the one field on a listing that cannot be casually changed later.
 * Everything here exists to stop a bad one being created in the first place.
 */

/**
 * Words a slug may not take, because a listing holding one would shadow a
 * real route under /registry and make that page unreachable.
 *
 * Checked as a set rather than a prefix match: "search" must be refused, but
 * "search-console-mcp" is a perfectly good listing name.
 */
const RESERVED = new Set([
  "new",
  "edit",
  "search",
  "categories",
  "category",
  "trending",
  "popular",
  "recent",
  "verified",
  "collections",
  "api",
  "internal",
  "admin",
  "settings",
  "publish",
  "submit",
  "install",
  "connect",
  "about",
  "docs",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 48;

/** Lowercase, digits and single interior hyphens. Nothing else. */
const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a slug from a display name.
 *
 * Unicode is folded to ASCII first (NFKD then stripping combining marks) so
 * "Café Notion" becomes "cafe-notion" rather than "caf-notion" — dropping the
 * letter entirely reads as a typo to whoever is publishing.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    // Slicing can leave a trailing hyphen behind; the shape forbids it.
    .replace(/-+$/g, "");
}

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: string };

/**
 * Validates a user-supplied slug, normalising case and surrounding space
 * rather than refusing them — someone typing "Stripe-MCP" meant `stripe-mcp`,
 * and an error there is friction with no purpose.
 *
 * Because of that, callers must persist `result.slug` and never the string
 * they passed in. Storing the raw input would put "Stripe-MCP" in a column
 * whose unique index is case-sensitive, and `/registry/stripe-mcp` would then
 * 404 on a listing that exists.
 */
export function checkSlug(input: string): SlugCheck {
  const slug = input.trim().toLowerCase();

  if (slug.length < SLUG_MIN) {
    return { ok: false, reason: `Must be at least ${SLUG_MIN} characters.` };
  }
  if (slug.length > SLUG_MAX) {
    return { ok: false, reason: `Must be at most ${SLUG_MAX} characters.` };
  }
  if (!SHAPE.test(slug)) {
    return {
      ok: false,
      reason: "Use lowercase letters, numbers and single hyphens between them.",
    };
  }
  if (RESERVED.has(slug)) {
    return { ok: false, reason: `"${slug}" is reserved by the registry.` };
  }

  return { ok: true, slug };
}

export function isReserved(slug: string): boolean {
  return RESERVED.has(slug.trim().toLowerCase());
}

/**
 * Appends a numeric suffix until the slug is free.
 *
 * `taken` is passed in rather than queried here so this stays pure and the
 * caller keeps control of the transaction the uniqueness is checked in — the
 * unique index is still the real guarantee, this only avoids showing someone
 * a collision error they can do nothing about.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const seed = slugify(base) || "mcp-server";
  if (!taken.has(seed) && !RESERVED.has(seed)) return seed;

  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = seed.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "") + suffix;
    if (!taken.has(candidate) && !RESERVED.has(candidate)) return candidate;
  }

  // Practically unreachable, but returning a duplicate would trip the unique
  // index as a 500 rather than a message someone can act on.
  throw new Error(`Could not find a free slug based on "${seed}".`);
}
