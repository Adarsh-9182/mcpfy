import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness, popularity, rankListings, scoreListing, trust, velocity } from "./rank";
import type { RankableListing } from "./types";

const NOW = new Date("2026-08-19T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function listing(over: Partial<RankableListing> & { slug: string }): RankableListing {
  return {
    installCount: 0,
    toolCount: 3,
    verified: false,
    publishedAt: daysAgo(30),
    updatedAt: daysAgo(30),
    readinessScore: null,
    ...over,
  };
}

test("a fresh, fast-growing listing can outrank an old popular one", () => {
  // The ratchet the module exists to avoid: without velocity and freshness,
  // the incumbent's 50,000 installs would win permanently.
  const incumbent = listing({
    slug: "old-giant",
    installCount: 50_000,
    publishedAt: daysAgo(900),
    updatedAt: daysAgo(700),
  });
  const challenger = listing({
    slug: "new-hotness",
    installCount: 900,
    publishedAt: daysAgo(20),
    updatedAt: daysAgo(2),
  });

  const [first] = rankListings([incumbent, challenger], NOW);
  assert.equal(first?.listing.slug, "new-hotness");
});

test("a well-maintained popular listing still beats an abandoned one", () => {
  // The counterweight: freshness must not hand the front page to anything new
  // regardless of whether anyone uses it.
  const maintained = listing({
    slug: "maintained",
    installCount: 20_000,
    publishedAt: daysAgo(400),
    updatedAt: daysAgo(3),
    verified: true,
  });
  const abandoned = listing({
    slug: "abandoned",
    installCount: 40_000,
    publishedAt: daysAgo(800),
    updatedAt: daysAgo(600),
  });

  const [first] = rankListings([abandoned, maintained], NOW);
  assert.equal(first?.listing.slug, "maintained");
});

test("installs alone cannot buy the top slot against a trusted peer", () => {
  const bought = listing({ slug: "bought", installCount: 12_000, updatedAt: daysAgo(200) });
  const trusted = listing({
    slug: "trusted",
    installCount: 3_000,
    updatedAt: daysAgo(1),
    verified: true,
    readinessScore: 96,
  });

  const [first] = rankListings([bought, trusted], NOW);
  assert.equal(first?.listing.slug, "trusted");
});

test("velocity's prior defuses the day-one exploit", () => {
  // Publish, install twice yourself, take the front page. The +7 prior means
  // two installs on day zero score below a listing earning steadily.
  const dayOne = velocity(2, NOW, NOW);
  const steady = velocity(700, daysAgo(70), NOW);
  assert.ok(dayOne < steady, `day-one ${dayOne} should rank under steady ${steady}`);
});

test("velocity is zero for an unpublished listing", () => {
  assert.equal(velocity(5_000, null, NOW), 0);
});

test("freshness halves at the half-life and keeps decaying", () => {
  assert.ok(Math.abs(freshness(daysAgo(120), NOW) - 0.5) < 1e-9);
  assert.ok(freshness(daysAgo(240), NOW) < freshness(daysAgo(120), NOW));
  assert.equal(freshness(NOW, NOW), 1);
});

test("freshness does not exceed 1 for a future timestamp", () => {
  // Clock skew between the app server and the database is normal.
  const future = new Date(NOW.getTime() + 86_400_000);
  assert.equal(freshness(future, NOW), 1);
});

test("popularity damps rather than scales", () => {
  const ten = popularity(10);
  const thousand = popularity(1_000);
  assert.ok(thousand < ten * 10, "1000 installs must not be 100x the signal of 10");
});

test("negative counts cannot be used to game the score", () => {
  assert.equal(popularity(-9_999), 0);
  assert.equal(velocity(-9_999, daysAgo(10), NOW), 0);
});

test("trust is bounded at 1", () => {
  const maxed = trust(listing({ slug: "x", verified: true, readinessScore: 100, toolCount: 40 }));
  assert.ok(maxed <= 1, `trust was ${maxed}`);
});

test("a listing exposing no tools earns no completeness credit", () => {
  const withTools = trust(listing({ slug: "a", toolCount: 1 }));
  const without = trust(listing({ slug: "b", toolCount: 0 }));
  assert.ok(withTools > without);
});

test("ordering is stable when scores tie", () => {
  const a = listing({ slug: "aaa" });
  const b = listing({ slug: "bbb" });
  assert.deepEqual(
    rankListings([b, a], NOW).map((r) => r.listing.slug),
    ["aaa", "bbb"],
  );
});

test("the score can be explained by its parts", () => {
  const scored = scoreListing(listing({ slug: "x", installCount: 100, verified: true }), NOW);
  assert.ok(scored.parts.popularity > 0);
  assert.ok(scored.parts.trust > 0);
  assert.ok(scored.score > 0);
});
