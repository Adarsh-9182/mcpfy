import "server-only";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { hashApiKey, type TenantContext } from "@mcpfy/db";
import { auth } from "./auth";

/**
 * §38 — resolves the caller of an API route to a TenantContext.
 *
 * Two credentials are accepted: a session cookie (the dashboard calling its
 * own API) and a bearer API key. Keys are matched by hash, never by value,
 * and a revoked or expired key resolves to nothing.
 */
export async function tenantFromRequest(
  request: Request,
): Promise<TenantContext | null> {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    const presented = header.slice("Bearer ".length).trim();
    if (!presented) return null;

    const rows = await db()
      .select({
        id: schema.apiKey.id,
        organizationId: schema.apiKey.organizationId,
        role: schema.apiKey.role,
      })
      .from(schema.apiKey)
      .where(
        and(
          eq(schema.apiKey.keyHash, hashApiKey(presented)),
          isNull(schema.apiKey.revokedAt),
          or(
            isNull(schema.apiKey.expiresAt),
            gt(schema.apiKey.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);

    const key = rows[0];
    if (!key) return null;

    // Best-effort usage stamp; a failure here must not fail the request.
    void db()
      .update(schema.apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKey.id, key.id))
      .catch(() => {});

    return {
      organizationId: key.organizationId,
      apiKeyId: key.id,
      role: key.role,
    };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  const activeOrgId = session.session.activeOrganizationId;
  const rows = await db()
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(
      activeOrgId
        ? and(
            eq(schema.member.userId, session.user.id),
            eq(schema.member.organizationId, activeOrgId),
          )
        : eq(schema.member.userId, session.user.id),
    )
    .limit(1);

  const membership = rows[0];
  if (!membership) return null;

  return {
    organizationId: membership.organizationId,
    userId: session.user.id,
    role: membership.role,
  };
}

/** Consistent error envelope so clients can branch on `error.code`. */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return Response.json(
    { error: { code, message, ...extra } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
