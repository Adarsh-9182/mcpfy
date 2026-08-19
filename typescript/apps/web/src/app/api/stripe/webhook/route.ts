import { eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { isActive, parseEvent, verifyWebhook } from "@mcpfy/billing";
import { applySubscription, endSubscription, stripeConfig } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * §31 — POST /api/stripe/webhook
 *
 * This endpoint changes what a customer is allowed to do, so the signature
 * check is the whole security model. It runs before the body is parsed as
 * anything meaningful, and the raw text is used for verification — parsing
 * and re-serialising would change the bytes and break the signature.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config) {
    return Response.json(
      { error: "Stripe is not configured on this deployment." },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const verified = verifyWebhook(
    payload,
    request.headers.get("stripe-signature"),
    config.webhookSecret,
  );

  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventId = String((body as { id?: unknown }).id ?? "");
  const event = parseEvent(body, config.prices);

  try {
    if (event.kind === "subscription") {
      const organizationId =
        organizationFrom(body) ?? (await organizationByCustomer(event.customerId));
      if (!organizationId) {
        // Acknowledged, not retried: without the metadata there is nothing
        // to apply, and Stripe would redeliver forever.
        return Response.json({ received: true, applied: false, reason: "no organization" });
      }

      if (!event.planId) {
        return Response.json({
          received: true,
          applied: false,
          reason: "unrecognised price",
        });
      }

      const active = isActive(event.status);
      await applySubscription({
        eventId,
        organizationId,
        // A subscription that is no longer active drops to free rather than
        // keeping a plan it is not paying for.
        plan: active ? event.planId : "free",
        status: event.status,
        stripeCustomerId: event.customerId,
        stripeSubscriptionId: event.subscriptionId,
        currentPeriodEnd: event.currentPeriodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      });

      return Response.json({ received: true, applied: true });
    }

    if (event.kind === "ended") {
      await endSubscription({ eventId, stripeCustomerId: event.customerId });
      return Response.json({ received: true, applied: true });
    }

    return Response.json({ received: true, applied: false, reason: event.reason });
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient
    // database problem — the event id makes the retry idempotent.
    const message = error instanceof Error ? error.message : "Unhandled error.";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Finds the organization the event belongs to.
 *
 * Metadata first, since checkout attaches it to the subscription itself. The
 * customer id is the fallback for events created outside our checkout flow —
 * a plan changed by hand in the Stripe dashboard, for instance.
 */
function organizationFrom(body: unknown): string | null {
  const object = (body as { data?: { object?: Record<string, any> } })?.data?.object;
  const fromMetadata = object?.metadata?.organizationId;
  return typeof fromMetadata === "string" && fromMetadata ? fromMetadata : null;
}

async function organizationByCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const rows = await db()
    .select({ organizationId: schema.subscription.organizationId })
    .from(schema.subscription)
    .where(eq(schema.subscription.stripeCustomerId, customerId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

export async function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
