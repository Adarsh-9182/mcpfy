import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, isPublishable, validateDraft, type ListingDraft } from "./publish";

function draft(over: Partial<ListingDraft> = {}): ListingDraft {
  return {
    name: "Stripe MCP",
    slug: "stripe-mcp",
    summary: "Query payments, invoices and refunds from an AI client.",
    category: "finance",
    serverId: "srv_1",
    ...over,
  };
}

test("a complete draft is publishable", () => {
  assert.deepEqual(validateDraft(draft()), []);
  assert.equal(isPublishable(draft()), true);
});

test("javascript: and data: URLs are refused", () => {
  // These are rendered as links on a public page, so an allow-list of schemes
  // is the difference between a link and stored XSS.
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:x"]) {
    assert.notEqual(checkUrl(bad, "homepageUrl"), null, `${bad} should be refused`);
  }
  assert.equal(checkUrl("https://stripe.com", "homepageUrl"), null);
  assert.equal(checkUrl("http://localhost:3000", "endpointUrl"), null);
});

test("a relative or malformed URL is refused", () => {
  assert.notEqual(checkUrl("stripe.com", "homepageUrl"), null);
  assert.notEqual(checkUrl("/relative", "homepageUrl"), null);
});

test("a listing must lead somewhere", () => {
  const orphan = draft({ serverId: null, endpointUrl: null, repositoryUrl: null });
  const problems = validateDraft(orphan);
  assert.ok(problems.some((p) => p.field === "form"));
});

test("a repository alone is enough for an indexed third-party listing", () => {
  // MCPfy does not host it and cannot probe it, but it is still a real entry.
  const indexed = draft({ serverId: null, repositoryUrl: "https://github.com/acme/mcp" });
  assert.deepEqual(validateDraft(indexed), []);
});

test("an unknown category is refused rather than defaulted", () => {
  const problems = validateDraft(draft({ category: "misc" }));
  assert.ok(problems.some((p) => p.field === "category"));
});

test("summary length is bounded at both ends", () => {
  assert.ok(validateDraft(draft({ summary: "Short." })).some((p) => p.field === "summary"));
  assert.ok(validateDraft(draft({ summary: "x".repeat(500) })).some((p) => p.field === "summary"));
});

test("slug problems surface with the reason from checkSlug", () => {
  const problems = validateDraft(draft({ slug: "search" }));
  const slugProblem = problems.find((p) => p.field === "slug");
  assert.ok(slugProblem);
  assert.match(slugProblem.message, /reserved/);
});

test("every problem names a field the form can highlight", () => {
  const problems = validateDraft({
    name: "",
    slug: "!",
    summary: "",
    category: "nope",
    serverId: null,
  });
  assert.ok(problems.length >= 4);
  for (const p of problems) assert.ok(p.field && p.message);
});
