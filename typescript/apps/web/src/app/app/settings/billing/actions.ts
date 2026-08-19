"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { AuthorizationError, requireRole } from "@mcpfy/db";
import {
  createCheckoutSession,
  createPortalSession,
  type PlanId,
} from "@mcpfy/billing";
import { requireViewer } from "@/lib/session";
import { stripeConfig } from "@/lib/billing";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export interface BillingActionState {
  error?: string;
}

/** §31 — sends an admin to Stripe Checkout for the chosen plan. */
export async function startCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const viewer = await requireViewer("/app/settings/billing");

  try {
    // Spending money is an owner/admin decision, not a developer one.
    requireRole(viewer.tenant, "admin");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const config = stripeConfig();
  if (!config) {
    return { error: "Stripe is not configured on this deployment." };
  }

  const plan = String(formData.get("plan") ?? "") as PlanId;
  if (plan !== "hobby" && plan !== "startup") {
    return { error: "That plan cannot be bought online. Get in touch instead." };
  }

  const existing = await db()
    .select({ stripeCustomerId: schema.subscription.stripeCustomerId })
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, viewer.tenant.organizationId))
    .limit(1);

  let url: string;
  try {
    const session = await createCheckoutSession(config, {
      planId: plan,
      organizationId: viewer.tenant.organizationId,
      organizationName: viewer.organization.name,
      customerEmail: viewer.user.email,
      existingCustomerId: existing[0]?.stripeCustomerId ?? null,
      successUrl: `${appUrl()}/app/settings/billing?changed=1`,
      cancelUrl: `${appUrl()}/app/settings/billing`,
    });
    url = session.url;
  } catch (e) {
    // Stripe's own message is more useful than anything generic we could
    // substitute — it names the price id or the key that is wrong.
    return { error: e instanceof Error ? e.message : "Checkout could not start." };
  }

  // Typed routes only know this app's own paths; Stripe hosts checkout.
  redirect(url as Route);
}

/** Opens Stripe's billing portal, which owns cards, invoices and cancellation. */
export async function openPortalAction(
  _prev: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const viewer = await requireViewer("/app/settings/billing");

  try {
    requireRole(viewer.tenant, "admin");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const config = stripeConfig();
  if (!config) return { error: "Stripe is not configured on this deployment." };

  const existing = await db()
    .select({ stripeCustomerId: schema.subscription.stripeCustomerId })
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, viewer.tenant.organizationId))
    .limit(1);

  const customerId = existing[0]?.stripeCustomerId;
  if (!customerId) {
    return { error: "This organization has never been billed, so there is nothing to manage." };
  }

  let url: string;
  try {
    const session = await createPortalSession(
      config,
      customerId,
      `${appUrl()}/app/settings/billing`,
    );
    url = session.url;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The portal could not be opened." };
  }

  redirect(url as Route);
}
