import { and, eq, type SQL } from "drizzle-orm";
import type { OrgRole } from "./schema/auth";

/**
 * §40 — cross-tenant leakage prevention.
 *
 * Every tenant-owned table carries `organization_id`. The rule this module
 * enforces is that no query against those tables is ever built without it.
 * A forgotten `where` clause is the single most common way a multi-tenant
 * app leaks data, and it is invisible in review because the query still
 * looks correct.
 */

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** A verified caller. Only produced by the auth layer, never constructed ad hoc. */
export interface TenantContext {
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
  role: OrgRole;
}

type OrgScoped = { organizationId: unknown };

/**
 * Builds `organization_id = ctx.organizationId AND (…rest)`.
 *
 * Use this instead of a bare `eq(...)` on every read and write of a
 * tenant-owned table:
 *
 *     db().select().from(server).where(scoped(ctx, server, eq(server.id, id)))
 */
export function scoped<T extends OrgScoped>(
  ctx: TenantContext,
  table: T,
  ...rest: (SQL | undefined)[]
): SQL {
  if (!ctx.organizationId) {
    throw new TenantScopeError("TenantContext has no organizationId");
  }
  const orgFilter = eq(
    table.organizationId as never,
    ctx.organizationId as never,
  );
  const clauses = rest.filter((c): c is SQL => c !== undefined);
  return clauses.length === 0 ? orgFilter : and(orgFilter, ...clauses)!;
}

/** Stamps organization_id onto every row of an insert. */
export function owned<T extends Record<string, unknown>>(
  ctx: TenantContext,
  values: T,
): T & { organizationId: string } {
  if (!ctx.organizationId) {
    throw new TenantScopeError("TenantContext has no organizationId");
  }
  return { ...values, organizationId: ctx.organizationId };
}

/** §24 — role ordering. Higher index means more capability. */
const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  developer: 1,
  admin: 2,
  owner: 3,
};

export function hasRole(ctx: TenantContext, minimum: OrgRole): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[minimum];
}

/**
 * Throws unless the caller meets `minimum`. Call this at the top of every
 * mutating server action and route handler — the frontend hiding a button is
 * not authorization.
 */
export function requireRole(ctx: TenantContext, minimum: OrgRole): void {
  if (!hasRole(ctx, minimum)) {
    throw new AuthorizationError(
      `This action requires the ${minimum} role or higher; you have ${ctx.role}.`,
    );
  }
}

/**
 * Guards a row that was fetched by primary key alone (for example from a
 * webhook payload) before it is used.
 */
export function assertOwned(
  ctx: TenantContext,
  row: OrgScoped | undefined | null,
  what = "record",
): void {
  if (!row || row.organizationId !== ctx.organizationId) {
    // Deliberately identical to a not-found error: telling a caller that a
    // record exists but belongs to someone else is itself a leak.
    throw new AuthorizationError(`No such ${what}.`);
  }
}
