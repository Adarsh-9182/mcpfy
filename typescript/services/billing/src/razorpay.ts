import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanId } from "./plans";
import type {
  BillingEvent,
  BillingProvider,
  CheckoutRequest,
  VerifyResult,
} from "./provider";

/**
 * §31 — Razorpay.
 *
 * The natural choice for an Indian business: onboarding is achievable
 * without a foreign entity, and UPI and Indian cards are first class rather
 * than an afterthought.
 *
 * Three real differences from Stripe shape this file:
 *
 *  1. The webhook signature is a plain HMAC of the body with no timestamp,
 *     so there is no replay window to check. Idempotency has to come from
 *     the event id instead, which the caller already does.
 *  2. There is no customer portal. Cancellation is an API call we make
 *     ourselves, so the UI offers it directly instead of linking away.
 *  3. A subscription is created first and carries its own hosted `short_url`,
 *     rather than a checkout session being created against a price.
 */

const API = "https://api.razorpay.com/v1";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  /** Razorpay plan ids, created in the dashboard. */
  plans: Partial<Record<PlanId, string>>;
  fetchImpl?: typeof fetch;
}

/**
 * Verifies a Razorpay webhook.
 *
 * No timestamp is included in what Razorpay signs, so unlike Stripe there is
 * nothing here to bound a replay with. The endpoint's idempotency key is the
 * event id, which is what actually makes a redelivery harmless.
 */
export function verifyRazorpayWebhook(
  payload: string,
  signature: string | null,
  secret: string,
): VerifyResult {
  if (!secret) return { ok: false, reason: "No webhook secret is configured." };
  if (!signature) return { ok: false, reason: "Missing X-Razorpay-Signature header." };

  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  if (a.length !== b.length) return { ok: false, reason: "Signature does not match." };

  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "Signature does not match." };
}

/** Razorpay subscription states that entitle a customer to their plan. */
export function isRazorpayActive(status: string): boolean {
  // `halted` is excluded: it means retries are exhausted, not in progress.
  // `pending` is included for the same reason `past_due` is on Stripe — a
  // payment being retried is not a reason to cut someone off.
  return status === "active" || status === "authenticated" || status === "pending";
}

export function planForRazorpayPlan(
  planId: unknown,
  plans: Partial<Record<PlanId, string>>,
): PlanId | null {
  if (typeof planId !== "string") return null;
  const match = Object.entries(plans).find(([, id]) => id === planId);
  return match ? (match[0] as PlanId) : null;
}

export function parseRazorpayEvent(
  payload: string,
  plans: Partial<Record<PlanId, string>>,
): BillingEvent {
  let body: Record<string, any>;
  try {
    body = JSON.parse(payload);
  } catch {
    return { kind: "ignored", reason: "unparseable body" };
  }

  const event = String(body.event ?? "");
  const subscription = body.payload?.subscription?.entity;

  if (!subscription) {
    return { kind: "ignored", reason: event || "no subscription in payload" };
  }

  if (event === "subscription.cancelled" || event === "subscription.completed") {
    return {
      kind: "ended",
      customerId: String(subscription.customer_id ?? ""),
      subscriptionId: String(subscription.id ?? ""),
    };
  }

  if (event.startsWith("subscription.")) {
    const status = String(subscription.status ?? "unknown");
    return {
      kind: "subscription",
      customerId: String(subscription.customer_id ?? ""),
      subscriptionId: String(subscription.id ?? ""),
      planId: planForRazorpayPlan(subscription.plan_id, plans),
      status,
      active: isRazorpayActive(status),
      currentPeriodEnd: subscription.current_end
        ? new Date(Number(subscription.current_end) * 1000)
        : null,
      // Razorpay expresses "cancel at period end" as a scheduled change
      // rather than a boolean on the subscription.
      cancelAtPeriodEnd: subscription.has_scheduled_changes === true,
    };
  }

  return { kind: "ignored", reason: event || "unknown event" };
}

export function razorpayProvider(config: RazorpayConfig): BillingProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const auth =
    "Basic " + Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

  async function call(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<Record<string, any>> {
    const response = await fetchImpl(`${API}${path}`, {
      method: init.method,
      headers: { authorization: auth, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const body = (await response.json()) as Record<string, any>;
    if (!response.ok) {
      throw new Error(
        body?.error?.description ??
          `Razorpay returned ${response.status} for ${path}.`,
      );
    }
    return body;
  }

  return {
    id: "razorpay",
    displayName: "Razorpay",
    currency: "inr",

    verifyWebhook(payload, headers) {
      return verifyRazorpayWebhook(
        payload,
        headers.get("x-razorpay-signature"),
        config.webhookSecret,
      );
    },

    parseEvent(payload) {
      return parseRazorpayEvent(payload, config.plans);
    },

    async createCheckout(request: CheckoutRequest) {
      const planId = config.plans[request.planId];
      if (!planId) {
        throw new Error(
          `No Razorpay plan is configured for ${request.planId}. ` +
            `Set RAZORPAY_PLAN_${request.planId.toUpperCase()}.`,
        );
      }

      const subscription = await call("/subscriptions", {
        method: "POST",
        body: {
          plan_id: planId,
          // Razorpay requires a finite cycle count. Ten years of monthly
          // billing is effectively "until cancelled" without the API
          // rejecting the request.
          total_count: 120,
          quantity: 1,
          customer_notify: 1,
          notes: {
            organizationId: request.organizationId,
            organizationName: request.organizationName,
            email: request.customerEmail,
          },
        },
      });

      const url = subscription.short_url;
      if (typeof url !== "string") {
        throw new Error("Razorpay did not return a payment link for the subscription.");
      }
      return { url };
    },

    // Razorpay has no hosted portal. Returning null tells the UI to offer
    // cancellation itself rather than linking somewhere that does not exist.
    async createPortal() {
      return null;
    },

    async cancelSubscription(subscriptionId: string) {
      await call(`/subscriptions/${subscriptionId}/cancel`, {
        method: "POST",
        // At cycle end, not immediately: someone who has paid for the month
        // keeps the month.
        body: { cancel_at_cycle_end: 1 },
      });
    },
  };
}
