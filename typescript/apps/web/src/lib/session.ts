import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import type { TenantContext } from "@mcpfy/db";
import { auth } from "./auth";

export interface Viewer {
  user: { id: string; name: string; email: string; image?: string | null };
  tenant: TenantContext;
  organization: { id: string; name: string; slug: string };
}

/**
 * Resolves the signed-in user *and* the organization they are acting in, plus
 * the role that organization grants them.
 *
 * Everything server-side that touches tenant data starts here. The role is
 * read from the database on each request rather than trusted from the
 * session cookie, so removing someone from an organization takes effect on
 * their very next request instead of whenever their session happens to
 * expire (§24: never trust frontend permissions — and a cached role is the
 * same mistake one layer down).
 *
 * `cache` dedupes this within a single render pass.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const activeOrgId = session.session.activeOrganizationId;

  const rows = await db()
    .select({
      role: schema.member.role,
      orgId: schema.organization.id,
      orgName: schema.organization.name,
      orgSlug: schema.organization.slug,
    })
    .from(schema.member)
    .innerJoin(
      schema.organization,
      eq(schema.member.organizationId, schema.organization.id),
    )
    .where(
      activeOrgId
        ? and(
            eq(schema.member.userId, session.user.id),
            eq(schema.member.organizationId, activeOrgId),
          )
        : eq(schema.member.userId, session.user.id),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    organization: { id: row.orgId, name: row.orgName, slug: row.orgSlug },
    tenant: {
      organizationId: row.orgId,
      userId: session.user.id,
      role: row.role,
    },
  };
});

/** Use in server components under /app. Sends anonymous visitors to login. */
export async function requireViewer(returnTo?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    // typedRoutes cannot check an interpolated query string; /login is real.
    redirect(`/login${next}` as Route);
  }
  return viewer;
}

/**
 * A signed-in user with no organization yet — first login, or they left their
 * last org. They need onboarding before any tenant-scoped page will work.
 */
export async function hasSessionWithoutOrg(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return false;
  return (await getViewer()) === null;
}
