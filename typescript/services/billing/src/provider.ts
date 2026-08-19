import type { PlanId } from "./plans";

/**
 * §31 — the seam between MCPfy and whoever takes the money.
 *
 * This existed in the specification from the start and was skipped when
 * Stripe went in directly. Adding Razorpay is what forced it, which is the
 * usual way an abstraction earns its keep: written for the first case it is
 * a guess, written for the second it is a fact.
 *
 * The interface is deliberately small. Everything a payment provider does
 * that is genuinely theirs — card storage, receipts, dunning, tax — stays on
 * their side. What MCPfy needs is only: start a subscription, let a customer
 * manage it, and be told when something changed.
 */

export type ProviderId = "stripe" | "razorpay";

export interface CheckoutRequest {
  planId: PlanId;
  organizationId: string;
  organizationName: string;
  customerEmail: string;
  /** The provider's own customer identifier, when we already have one. */
  existingCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

/** What a verified webhook told us. */
export interface SubscriptionChange {
  kind: "subscription";
  customerId: string;
  subscriptionId: string;
  /** Null when the price or plan does not map to one of ours. */
  planId: PlanId | null;
  /** Provider status, kept verbatim so it can be shown without translation. */
  status: string;
  /** Whether that status still entitles the customer to the plan. */
  active: boolean;
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

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export interface BillingProvider {
  readonly id: ProviderId;
  /** Shown on the billing page, so a customer knows who charged them. */
  readonly displayName: string;
  /** The currency this provider is configured to charge in. */
  readonly currency: "usd" | "inr";

  /**
   * Verifies a webhook against the raw request body.
   *
   * Always the raw text, never a re-serialised object: parsing and
   * re-encoding changes bytes, and the signature is over bytes.
   */
  verifyWebhook(payload: string, headers: Headers): VerifyResult;

  /** Turns a verified payload into something worth acting on. */
  parseEvent(payload: string): BillingEvent;

  /** A hosted page where the customer pays. */
  createCheckout(request: CheckoutRequest): Promise<{ url: string }>;

  /**
   * Where a customer manages an existing subscription.
   *
   * Null when the provider has no such page — Razorpay has no equivalent of
   * Stripe's portal — in which case the UI offers cancellation directly
   * rather than linking somewhere that does not exist.
   */
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string } | null>;

  /** Cancels at period end. Used when there is no hosted portal. */
  cancelSubscription(subscriptionId: string): Promise<void>;
}
