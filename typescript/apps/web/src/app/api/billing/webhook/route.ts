import { eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { applySubscription, billingProvider, endSubscription } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * §31 — POST /api/billing/webhook
 *
 * One endpoint for whichever provider is configured. The provider owns
 * signature verification and event parsing; this route owns what those
 * events mean for an organization's plan.
 *
 * The signature is checked against the raw body before anything else. This
 * endpoint changes what a customer is allowed to do, so that check is the
 * whole security model — parsing and re-serialising would change the bytes
 * and break it.
 */
export async function POST(request: Request) {
  const provider = billingProvider();
  if (!provider) {
    return Response.json(
      { error: "No payment provider is configured on this deployment." },
      { status: 503 },
    );
  }

  const payload = await request.text();

  const verified = provider.verifyWebhook(payload, request.headers);
  if (!verified.ok) {
    return Response.json({ error: verified.reason }, { status: 400 });
  }

  const eventId = extractEventId(payload, provider.id);
  const event = provider.parseEvent(payload);

  try {
    if (event.kind === "subscription") {
      const organizationId =
        organizationFromPayload(payload) ??
        (await organizationByCustomer(event.customerId));

      if (!organizationId) {
        // Acknowledged rather than retried: without an organization there is
        // nothing to apply, and the provider would redeliver forever.
        return Response.json({ received: true, applied: false, reason: "no organization" });
      }

      if (!event.planId) {
        return Response.json({
          received: true,
          applied: false,
          reason: "unrecognised plan",
        });
      }

      await applySubscription({
        eventId,
        organizationId,
        // A subscription that is no longer active drops to free rather than
        // keeping a plan it is not paying for.
        plan: event.active ? event.planId : "free",
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
    // A 500 makes the provider retry, which is right for a transient database
    // problem — the event id makes the retry idempotent.
    const message = error instanceof Error ? error.message : "Unhandled error.";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * The provider's own id for this delivery, used as the idempotency key.
 *
 * Stripe puts it at the top level. Razorpay does not send one at all, so the
 * subscription id and status stand in — a redelivery of the same state is
 * then a no-op, which is the property that actually matters.
 */
function extractEventId(payload: string, providerId: string): string {
  try {
    const body = JSON.parse(payload) as Record<string, any>;
    if (providerId === "stripe" && typeof body.id === "string") return body.id;

    const subscription = body.payload?.subscription?.entity;
    if (subscription?.id) {
      return `rzp_${subscription.id}_${subscription.status}_${subscription.current_end ?? 0}`;
    }
    return `${providerId}_${Date.now()}`;
  } catch {
    return `${providerId}_${Date.now()}`;
  }
}

/** Both providers are asked to carry the organization id with the subscription. */
function organizationFromPayload(payload: string): string | null {
  try {
    const body = JSON.parse(payload) as Record<string, any>;

    const stripeMetadata = body.data?.object?.metadata?.organizationId;
    if (typeof stripeMetadata === "string" && stripeMetadata) return stripeMetadata;

    const razorpayNotes = body.payload?.subscription?.entity?.notes?.organizationId;
    if (typeof razorpayNotes === "string" && razorpayNotes) return razorpayNotes;

    return null;
  } catch {
    return null;
  }
}

/** Fallback for a subscription changed outside our checkout flow. */
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
