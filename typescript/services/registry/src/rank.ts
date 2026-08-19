import type { RankableListing } from "./types";

/**
 * §8 and §24 — ordering the registry.
 *
 * `ORDER BY install_count DESC` is the obvious implementation and the wrong
 * one. It is a ratchet: whatever is popular today is shown first, which makes
 * it more popular tomorrow, and a genuinely better server published this week
 * is never seen by anyone. Every registry that ships that query ends up with a
 * frozen front page.
 *
 * So popularity is damped, and paid attention to *per day* — the one velocity
 * signal available without a separate install-events table:
 *
 *   - log damping, so 10,000 installs outranks 1,000 without being ten times
 *     the signal;
 *   - a rate rather than a total, so a listing published last week competes on
 *     equal terms with one published last year;
 *   - freshness decay, because an integration nobody has touched in a year is
 *     usually broken against an API that has moved on;
 *   - trust bonuses from §24 that are earned, not bought.
 *
 * `installCount` is deliberately the *weakest* input. It is the number here
 * most exposed to manipulation, and it should not be able to buy a top slot on
 * its own.
 */

/** Days after which freshness has decayed to roughly half. */
const FRESHNESS_HALF_LIFE_DAYS = 120;

const DAY_MS = 86_400_000;

export interface ScoredListing<T extends RankableListing> {
  listing: T;
  score: number;
  /** Kept so the ordering can be explained rather than just asserted. */
  parts: {
    popularity: number;
    velocity: number;
    freshness: number;
    trust: number;
  };
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Half-life decay on days since the listing was last updated.
 *
 * Exponential rather than a cliff: a listing does not become worthless the
 * day it turns six months old, it becomes gradually less likely to still work.
 */
export function freshness(updatedAt: Date, now: Date): number {
  const age = daysBetween(updatedAt, now);
  return Math.pow(0.5, age / FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Installs per day since publication, damped.
 *
 * The `+ 7` on the denominator is a prior: without it, a listing published
 * yesterday with two installs scores an enormous rate and takes the front
 * page. It costs a genuinely fast-growing new listing very little and it
 * removes the exploit entirely.
 */
export function velocity(
  installCount: number,
  publishedAt: Date | null,
  now: Date,
): number {
  if (!publishedAt) return 0;
  const days = daysBetween(publishedAt, now) + 7;
  return Math.log10(1 + Math.max(0, installCount) / days);
}

export function popularity(installCount: number): number {
  return Math.log10(1 + Math.max(0, installCount));
}

/**
 * §24 — reputation, as a bounded bonus rather than an unbounded term.
 *
 * Capped at 1 so trust can promote a good listing past a slightly more
 * popular one, but cannot on its own outrank a listing that people actually
 * use. Verification says the publisher is who they claim to be; it is not
 * evidence that the software is good.
 */
export function trust(listing: RankableListing): number {
  let score = 0;
  if (listing.verified) score += 0.45;
  // Readiness is MCPfy's own measured protocol-conformance score, 0-100.
  if (typeof listing.readinessScore === "number") {
    score += 0.35 * Math.min(1, Math.max(0, listing.readinessScore) / 100);
  }
  // A server exposing no tools is a listing, not an integration.
  if (listing.toolCount > 0) score += 0.2;
  return Math.min(1, score);
}

const WEIGHT = {
  popularity: 1.0,
  velocity: 2.0,
  trust: 1.2,
} as const;

/**
 * How far staleness can discount a listing.
 *
 * Freshness multiplies the other terms instead of being added to them, which
 * is the correction a test forced. Added, it was worth a fixed ~1.5 points,
 * and a server last touched 700 days ago still beat a maintained one purely
 * on accumulated installs. That is exactly backwards: an integration nobody
 * has updated in two years is not slightly worse, it is probably broken
 * against an API that has moved on, and every install it accumulated before
 * it broke should be discounted rather than merely taxed.
 *
 * The floor stops the discount reaching zero. Something old, huge and stable
 * should fall down the ranking, not vanish from it.
 */
const STALENESS_FLOOR = 0.3;

export function scoreListing<T extends RankableListing>(
  listing: T,
  now: Date = new Date(),
): ScoredListing<T> {
  const parts = {
    popularity: popularity(listing.installCount),
    velocity: velocity(listing.installCount, listing.publishedAt, now),
    freshness: freshness(listing.updatedAt, now),
    trust: trust(listing),
  };

  const base =
    parts.popularity * WEIGHT.popularity +
    parts.velocity * WEIGHT.velocity +
    parts.trust * WEIGHT.trust;

  const score = base * (STALENESS_FLOOR + (1 - STALENESS_FLOOR) * parts.freshness);

  return { listing, score, parts };
}

/** Highest first. Ties break on slug so the order is stable across reloads. */
export function rankListings<T extends RankableListing>(
  listings: readonly T[],
  now: Date = new Date(),
): ScoredListing<T>[] {
  return listings
    .map((listing) => scoreListing(listing, now))
    .sort(
      (a, b) => b.score - a.score || a.listing.slug.localeCompare(b.listing.slug),
    );
}
