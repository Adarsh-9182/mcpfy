import { test } from "node:test";
import assert from "node:assert/strict";
import { applyQuery, parseQuery, relevance, tokenize } from "./search";
import type { RegistryListing } from "./types";

const NOW = new Date("2026-08-19T00:00:00Z");

function make(over: Partial<RegistryListing> & { slug: string; name: string }): RegistryListing {
  return {
    id: over.slug,
    summary: "Does a thing.",
    category: "development",
    authKind: "none",
    serverId: null,
    endpointUrl: null,
    repositoryUrl: "https://example.com/repo",
    homepageUrl: null,
    version: "1.0.0",
    publisher: { name: "Acme", slug: "acme" },
    installCount: 100,
    toolCount: 4,
    verified: false,
    publishedAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    readinessScore: null,
    ...over,
  };
}

const STRIPE = make({ slug: "stripe-mcp", name: "Stripe", summary: "Payments, invoices and refunds." });
const NOTION = make({ slug: "notion-mcp", name: "Notion", summary: "Docs and databases, billed via Stripe." });
const INVOICE = make({ slug: "invoice-tools", name: "Invoice Tools", summary: "Generate invoices." });

test("a name match outranks a summary mention", () => {
  const [first] = applyQuery([NOTION, STRIPE], parseQuery({ q: "stripe" }), NOW);
  assert.equal(first?.slug, "stripe-mcp");
});

test("every token must match, so a second word narrows the result", () => {
  const wide = applyQuery([STRIPE, NOTION, INVOICE], parseQuery({ q: "stripe" }), NOW);
  const narrow = applyQuery([STRIPE, NOTION, INVOICE], parseQuery({ q: "stripe invoice" }), NOW);
  assert.ok(narrow.length < wide.length, "adding a word must not widen the results");
  assert.deepEqual(narrow.map((l) => l.slug), ["stripe-mcp"]);
});

test("a listing matching nothing is excluded rather than ranked last", () => {
  assert.equal(relevance(INVOICE, "kubernetes"), 0);
  assert.deepEqual(applyQuery([INVOICE], parseQuery({ q: "kubernetes" }), NOW), []);
});

test("search is case- and punctuation-insensitive", () => {
  assert.ok(relevance(STRIPE, "STRIPE!!") > 0);
  assert.ok(relevance(STRIPE, "  stripe  ") > 0);
});

test("category and verified filters apply before ranking", () => {
  const verified = make({ slug: "v", name: "Verified thing", verified: true });
  const other = make({ slug: "o", name: "Other thing", category: "finance" });

  const byCategory = applyQuery([verified, other], parseQuery({ category: "finance" }), NOW);
  assert.deepEqual(byCategory.map((l) => l.slug), ["o"]);

  const onlyVerified = applyQuery([verified, other], parseQuery({ verified: "1" }), NOW);
  assert.deepEqual(onlyVerified.map((l) => l.slug), ["v"]);
});

test("an unknown category is ignored rather than returning nothing", () => {
  // A hand-edited query string must not silently produce an empty registry.
  const q = parseQuery({ category: "../../etc/passwd" });
  assert.equal(q.category, null);
  assert.equal(applyQuery([STRIPE], q, NOW).length, 1);
});

test("sort modes order as named", () => {
  const many = make({ slug: "many", name: "Many", installCount: 9_000 });
  const few = make({ slug: "few", name: "Few", installCount: 5 });
  assert.deepEqual(
    applyQuery([few, many], parseQuery({ sort: "installs" }), NOW).map((l) => l.slug),
    ["many", "few"],
  );
  assert.deepEqual(
    applyQuery([many, few], parseQuery({ sort: "name" }), NOW).map((l) => l.slug),
    ["few", "many"],
  );
});

test("an unknown sort falls back to trending rather than throwing", () => {
  assert.equal(parseQuery({ sort: "; DROP TABLE" }).sort, "trending");
});

test("query text is bounded", () => {
  assert.equal(parseQuery({ q: "x".repeat(5_000) }).text.length, 120);
});

test("tokenize drops empties", () => {
  assert.deepEqual(tokenize("  a--b  "), ["a", "b"]);
  assert.deepEqual(tokenize("!!!"), []);
});
