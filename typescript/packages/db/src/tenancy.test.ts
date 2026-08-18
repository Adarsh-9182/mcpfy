import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  assertOwned,
  AuthorizationError,
  hasRole,
  owned,
  requireRole,
  scoped,
  TenantScopeError,
  type TenantContext,
} from "./tenancy";
import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { server } from "./schema/core";

/** Renders a built SQL fragment to the exact text Postgres would receive. */
const render = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  new PgDialect({ casing: "snake_case" }).sqlToQuery(fragment);

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  organizationId: "org_a",
  userId: "user_1",
  role: "developer",
  ...over,
});

describe("tenant scoping", () => {
  test("scoped() always includes the organization filter", () => {
    const { sql, params } = render(scoped(ctx(), server, eq(server.id, "srv_1")));
    assert.match(sql, /"organization_id" = \$\d/);
    assert.match(sql, /"id" = \$\d/);
    assert.deepEqual(params, ["org_a", "srv_1"]);
  });

  test("scoped() still filters by organization with no extra clauses", () => {
    const { sql, params } = render(scoped(ctx(), server));
    assert.match(sql, /"organization_id" = \$\d/);
    assert.deepEqual(params, ["org_a"]);
  });

  test("scoped() ignores undefined clauses rather than emitting empty AND", () => {
    const { sql } = render(scoped(ctx(), server, undefined, eq(server.slug, "a")));
    assert.equal(sql.includes("and and"), false);
    assert.match(sql, /"organization_id"/);
    assert.match(sql, /"slug"/);
  });

  test("scoped() refuses to build a query without an organization", () => {
    assert.throws(
      () => scoped({ organizationId: "", role: "owner" }, server),
      TenantScopeError,
    );
  });

  test("owned() stamps the organization onto inserts", () => {
    const row = owned(ctx(), { name: "customer-mcp", slug: "customer-mcp" });
    assert.equal(row.organizationId, "org_a");
  });

  test("owned() cannot be tricked into overriding the organization", () => {
    // A caller passing organizationId from request input must not win.
    const row = owned(ctx(), {
      name: "x",
      organizationId: "org_attacker",
    });
    assert.equal(row.organizationId, "org_a");
  });

  test("assertOwned rejects a row from another tenant", () => {
    assert.throws(
      () => assertOwned(ctx(), { organizationId: "org_b" }, "server"),
      AuthorizationError,
    );
  });

  test("assertOwned does not reveal that the record exists", () => {
    let crossTenant = "";
    let missing = "";
    try {
      assertOwned(ctx(), { organizationId: "org_b" }, "server");
    } catch (e) {
      crossTenant = (e as Error).message;
    }
    try {
      assertOwned(ctx(), undefined, "server");
    } catch (e) {
      missing = (e as Error).message;
    }
    assert.equal(crossTenant, missing);
  });
});

describe("role checks", () => {
  test("roles are ordered owner > admin > developer > viewer", () => {
    assert.ok(hasRole(ctx({ role: "owner" }), "admin"));
    assert.ok(hasRole(ctx({ role: "admin" }), "developer"));
    assert.ok(hasRole(ctx({ role: "developer" }), "viewer"));
    assert.equal(hasRole(ctx({ role: "viewer" }), "developer"), false);
    assert.equal(hasRole(ctx({ role: "developer" }), "admin"), false);
  });

  test("a role always satisfies itself", () => {
    for (const role of ["owner", "admin", "developer", "viewer"] as const) {
      assert.ok(hasRole(ctx({ role }), role));
    }
  });

  test("requireRole names both the needed and the actual role", () => {
    assert.throws(
      () => requireRole(ctx({ role: "viewer" }), "admin"),
      (e: unknown) => {
        assert.ok(e instanceof AuthorizationError);
        assert.equal(e.status, 403);
        assert.match(e.message, /admin/);
        assert.match(e.message, /viewer/);
        return true;
      },
    );
  });
});
