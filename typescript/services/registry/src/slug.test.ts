import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSlug, isReserved, slugify, uniqueSlug, SLUG_MAX } from "./slug";

test("accents are folded, not dropped", () => {
  assert.equal(slugify("Café Notion"), "cafe-notion");
  assert.equal(slugify("Müller Söhne"), "muller-sohne");
});

test("punctuation and repeated spaces collapse to single hyphens", () => {
  assert.equal(slugify("  My  API!!  v2  "), "my-api-v2");
  assert.equal(slugify("a---b"), "a-b");
});

test("a slugified name never ends in a hyphen, even when truncated", () => {
  const long = slugify("x".repeat(SLUG_MAX - 1) + " tail");
  assert.ok(!long.endsWith("-"), long);
  assert.ok(long.length <= SLUG_MAX);
});

test("route names are reserved so a listing cannot shadow a page", () => {
  for (const word of ["new", "search", "api", "categories"]) {
    assert.equal(checkSlug(word).ok, false, `${word} should be reserved`);
    assert.equal(isReserved(word), true);
  }
});

test("a reserved word as part of a longer slug is allowed", () => {
  assert.equal(checkSlug("search-console-mcp").ok, true);
});

test("case and surrounding space are normalised, not refused", () => {
  // Friendlier than rejecting, and matches what npm does. Callers must store
  // `result.slug` rather than their own input — see the note in checkSlug.
  const result = checkSlug("  Upper-Case  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.slug, "upper-case");
});

test("shape violations are refused with a reason", () => {
  for (const bad of ["ab", "-leading", "trailing-", "has space", "under_score", "a--b"]) {
    const result = checkSlug(bad);
    assert.equal(result.ok, false, `${bad} should be refused`);
    if (!result.ok) assert.ok(result.reason.length > 0);
  }
});

test("collisions get the first free suffix", () => {
  assert.equal(uniqueSlug("GitHub MCP", new Set()), "github-mcp");
  assert.equal(uniqueSlug("GitHub MCP", new Set(["github-mcp"])), "github-mcp-2");
  assert.equal(uniqueSlug("GitHub MCP", new Set(["github-mcp", "github-mcp-2"])), "github-mcp-3");
});

test("a suffixed collision still fits the length limit", () => {
  const taken = new Set([slugify("y".repeat(SLUG_MAX))]);
  const result = uniqueSlug("y".repeat(SLUG_MAX), taken);
  assert.ok(result.length <= SLUG_MAX, `${result.length} > ${SLUG_MAX}`);
  assert.equal(checkSlug(result).ok, true);
});

test("a name that slugifies to nothing still yields a usable slug", () => {
  assert.equal(uniqueSlug("!!!", new Set()), "mcp-server");
});

test("uniqueSlug never returns a reserved word", () => {
  assert.notEqual(uniqueSlug("search", new Set()), "search");
});
