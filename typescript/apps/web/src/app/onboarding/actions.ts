"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { auth } from "@/lib/auth";
import { slugify, uniqueSlug } from "@/lib/slug";

export interface OnboardingState {
  error?: string;
}

/**
 * §42 — first-run setup. Creates the organization, makes it active for this
 * session, and seeds the default project so "create a server" has somewhere
 * to put one. Everything downstream assumes a project exists.
 */
export async function createOrganizationAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { error: "Organization names need at least two characters." };
  }

  const base = slugify(name);
  const existing = await db()
    .select({ slug: schema.organization.slug })
    .from(schema.organization);
  const slug = uniqueSlug(base, new Set(existing.map((r) => r.slug)));

  let organizationId: string;
  try {
    const org = await auth.api.createOrganization({
      body: { name, slug },
      headers: requestHeaders,
    });
    if (!org) return { error: "The organization could not be created." };
    organizationId = org.id;
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "The organization could not be created.",
    };
  }

  await auth.api.setActiveOrganization({
    body: { organizationId },
    headers: requestHeaders,
  });

  // Seed the default project. Servers always belong to one.
  const already = await db()
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(eq(schema.project.organizationId, organizationId))
    .limit(1);

  if (already.length === 0) {
    await db().insert(schema.project).values({
      organizationId,
      name: "Default",
      slug: "default",
      description: "Servers land here unless you move them.",
    });
  }

  redirect("/app");
}
