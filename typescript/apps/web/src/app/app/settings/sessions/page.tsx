import type { Metadata } from "next";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { Badge } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { auth } from "@/lib/auth";
import { requireViewer } from "@/lib/session";
import { SessionList } from "./session-list";

export const metadata: Metadata = { title: "Sessions" };

/**
 * §6 — where a signed-in account is currently open, and how to close it.
 *
 * Sessions live in the database rather than in a signed cookie payload, which
 * is what makes revoking one immediate instead of a wait for expiry. This
 * page is the reason that design choice was worth making.
 */
export default async function SessionsPage() {
  const viewer = await requireViewer("/app/settings/sessions");

  const current = await auth.api.getSession({ headers: await headers() });
  const currentToken = current?.session.token;

  const sessions = await db()
    .select({
      id: schema.session.id,
      token: schema.session.token,
      ipAddress: schema.session.ipAddress,
      userAgent: schema.session.userAgent,
      createdAt: schema.session.createdAt,
      expiresAt: schema.session.expiresAt,
    })
    .from(schema.session)
    .where(eq(schema.session.userId, viewer.user.id))
    .orderBy(desc(schema.session.createdAt))
    .limit(50);

  const rows = sessions.map((s) => ({
    id: s.id,
    // The token identifies the current session but is a credential, so it is
    // compared here and never sent to the browser.
    current: s.token === currentToken,
    device: describe(s.userAgent),
    ipAddress: s.ipAddress,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-medium text-hi">Sessions</h1>
        <p className="mt-1 max-w-xl text-base leading-relaxed text-muted">
          Every browser signed in as{" "}
          <span className="font-mono text-fg">{viewer.user.email}</span>. Ending
          a session takes effect on its next request, not whenever it would
          have expired.
        </p>
      </div>

      <SessionList sessions={rows} />

      <p className="mt-4 flex items-center gap-2 text-2xs text-subtle">
        <Badge>{rows.length} active</Badge>
        Sessions expire on their own after 7 days.
      </p>
    </div>
  );
}

/**
 * A readable device name from a user agent.
 *
 * Deliberately coarse. A precise parse needs a library that is out of date
 * the week it ships, and "Chrome on macOS" is enough to answer the only
 * question being asked: is that one me?
 */
function describe(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : /curl\//i.test(userAgent) ? "curl"
    : "Unknown browser";

  const platform =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : null;

  return platform ? `${browser} on ${platform}` : browser;
}
