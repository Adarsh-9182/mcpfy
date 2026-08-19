import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanId } from "./plans";

/**
 * §31 — the Stripe seam.
 *
 * Written against Stripe's HTTP API directly rather than the SDK: the surface
 * needed is three calls, and a billing integration is easier to reason about
 * when the requests are visible. The client is injectable so every path here
 * is testable without an account.
 */

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Stripe price id per plan. Set in the dashboard, pasted into env. */
  prices: Partial<Record<PlanId, string>>;
}

/* ------------------------------------------------------------- signatures */

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verifies a Stripe webhook signature.
 *
 * This endpoint changes what a customer is allowed to do. Without
 * verification anyone who finds the URL can grant themselves the enterprise
 * plan by posting a JSON body. The timestamp is inside the signed payload and
 * checked against a tolerance so a captured event cannot be replayed later.
 */
export function verifyWebhook(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
  now = Date.now(),
): VerifyResult {
  if (!secret) return { ok: false, reason: "No webhook secret is configured." };
  if (!signatureHeader) return { ok: false, reason: "Missing Stripe-Signature header." };

  const parts = new Map(
    signatureHeader
      .split(",")
      .map((piece) => piece.split("=", 2))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );

  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");

  if (!Number.isFinite(timestamp) || !signature) {
    return { ok: false, reason: "Malformed Stripe-Signature header." };
  }

  const ageSeconds = Math.abs(now / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) {
    return { ok: false, reason: "Signature timestamp is outside the tolerance." };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return { ok: false, reason: "Signature does not match." };

  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "Signature does not match." };
}

/* ----------------------------------------------------------------- events */

export interface SubscriptionChange {
  kind: "subscription";
  customerId: string;
  subscriptionId: string;
  /** Null when the price does not map to a plan we know about. */
  planId: PlanId | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionEnded {
  kind: "ended";
  customerId: string;
  subscriptionId: string;
}

export interface IgnoredEvent {
  kind: "ignored";
  reason: string;
}

export type BillingEvent = SubscriptionChange | SubscriptionEnded | IgnoredEvent;

/**
 * Turns a verified Stripe event into something worth acting on.
 *
 * Unrecognised types are ignored rather than erroring: Stripe sends a great
 * many event types, and an endpoint that 500s on the ones it does not handle
 * gets its deliveries throttled and eventually disabled.
 */
export function parseEvent(
  event: unknown,
  prices: Partial<Record<PlanId, string>>,
): BillingEvent {
  const body = (event ?? {}) as Record<string, any>;
  const type = String(body.type ?? "");
  const object = body.data?.object ?? {};

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated"
  ) {
    const priceId = object.items?.data?.[0]?.price?.id;
    return {
      kind: "subscription",
      customerId: String(object.customer ?? ""),
      subscriptionId: String(object.id ?? ""),
      planId: planForPrice(priceId, prices),
      status: String(object.status ?? "unknown"),
      currentPeriodEnd: object.current_period_end
        ? new Date(Number(object.current_period_end) * 1000)
        : null,
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
    };
  }

  if (type === "customer.subscription.deleted") {
    return {
      kind: "ended",
      customerId: String(object.customer ?? ""),
      subscriptionId: String(object.id ?? ""),
    };
  }

  return { kind: "ignored", reason: type || "unknown event" };
}

/**
 * Maps a Stripe price back to a plan.
 *
 * Returns null rather than guessing when the price is unknown. A mismatched
 * price id usually means test and live keys have been crossed, and silently
 * assigning a plan there would grant or revoke access on bad data.
 */
export function planForPrice(
  priceId: unknown,
  prices: Partial<Record<PlanId, string>>,
): PlanId | null {
  if (typeof priceId !== "string") return null;
  const match = Object.entries(prices).find(([, id]) => id === priceId);
  return match ? (match[0] as PlanId) : null;
}

/** A subscription in one of these states entitles the customer to its plan. */
export function isActive(status: string): boolean {
  // `past_due` is deliberately included: access continues while a payment is
  // retried. Cutting a customer off the hour a card expires is how a renewal
  // problem becomes a cancellation.
  return status === "active" || status === "trialing" || status === "past_due";
}

/* ------------------------------------------------------------------- calls */

const API = "https://api.stripe.com/v1";

async function post(
  config: StripeConfig,
  path: string,
  form: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Record<string, any>> {
  const response = await fetchImpl(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });

  const body = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw new Error(
      body?.error?.message ?? `Stripe returned ${response.status} for ${path}.`,
    );
  }
  return body;
}

export interface CheckoutRequest {
  planId: PlanId;
  organizationId: string;
  organizationName: string;
  customerEmail: string;
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  config: StripeConfig,
  request: CheckoutRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string }> {
  const price = config.prices[request.planId];
  if (!price) {
    throw new Error(
      `No Stripe price is configured for the ${request.planId} plan. ` +
        `Set STRIPE_PRICE_${request.planId.toUpperCase()}.`,
    );
  }

  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    // The organization id travels with the subscription so a webhook can find
    // it without a lookup table that can drift.
    "subscription_data[metadata][organizationId]": request.organizationId,
    "metadata[organizationId]": request.organizationId,
    allow_promotion_codes: "true",
  };

  if (request.existingCustomerId) {
    form.customer = request.existingCustomerId;
  } else {
    form.customer_email = request.customerEmail;
  }

  const session = await post(config, "/checkout/sessions", form, fetchImpl);
  return { url: String(session.url) };
}

export async function createPortalSession(
  config: StripeConfig,
  customerId: string,
  returnUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string }> {
  const session = await post(
    config,
    "/billing_portal/sessions",
    { customer: customerId, return_url: returnUrl },
    fetchImpl,
  );
  return { url: String(session.url) };
}
