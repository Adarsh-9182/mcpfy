import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";

/**
 * Returns the organization's default project, creating it if it is missing.
 *
 * Onboarding seeds this, but an organization can also be created straight
 * through the Better Auth API, which knows nothing about projects. Every path
 * that needs somewhere to put a server calls this, so the UI and the §38 API
 * behave identically instead of one healing and the other returning 409.
 */
export async function ensureDefaultProject(
  organizationId: string,
): Promise<{ id: string }> {
  const existing = await db()
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(eq(schema.project.organizationId, organizationId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db()
    .insert(schema.project)
    .values({
      organizationId,
      name: "Default",
      slug: "default",
      description: "Servers land here unless you move them.",
    })
    .onConflictDoNothing()
    .returning({ id: schema.project.id });

  if (created) return created;

  // A concurrent request won the insert; re-read rather than fail.
  const raced = await db()
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(eq(schema.project.organizationId, organizationId))
    .limit(1);

  if (!raced[0]) throw new Error("Could not create the default project.");
  return raced[0];
}
