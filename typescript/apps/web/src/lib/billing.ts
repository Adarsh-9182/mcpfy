import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import { scoped, type TenantContext } from "@mcpfy/db";
import {
  check,
  isActive,
  meters,
  planOf,
  razorpayProvider,
  stripeProvider,
  type Action,
  type BillingProvider,
  type Decision,
  type Meter,
  type Plan,
  type Usage,
} from "@mcpfy/billing";

/**
 * §31 — the platform's side of billing.
 *
 * The plan is read from our own database rather than from Stripe: an
 * entitlement check runs on every server creation and every dashboard load,
 * and none of those should fail because a third party is slow or down.
 */

export interface Billing {
  plan: Plan;
  status: string;
  /** Whether the subscription entitles them to the plan right now. */
  active: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  usage: Usage;
  meters: Meter[];
}

export async function billingFor(ctx: TenantContext): Promise<Billing> {
  const [record, usage] = await Promise.all([
    db()
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    usageFor(ctx),
  ]);

  // No row means free. Nothing has to backfill a subscription for every
  // signup, and a missing record can never lock anyone out.
  const active = record ? isActive(record.status) : true;
  const planId = active ? (record?.plan ?? "free") : "free";

  return {
    plan: planOf(planId),
    status: record?.status ?? "active",
    active,
    cancelAtPeriodEnd: record?.cancelAtPeriodEnd === 1,
    currentPeriodEnd: record?.currentPeriodEnd ?? null,
    stripeCustomerId: record?.stripeCustomerId ?? null,
    usage,
    meters: meters(planId, usage),
  };
}

/** Counted from the same tables the dashboard reads, never a cached tally. */
export async function usageFor(ctx: TenantContext): Promise<Usage> {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const [servers, requests, members] = await Promise.all([
    db()
      .select({ n: count() })
      .from(schema.server)
      .where(scoped(ctx, schema.server)),
    db()
      .select({ n: count() })
      .from(schema.requestLog)
      .where(scoped(ctx, schema.requestLog, gte(schema.requestLog.at, periodStart))),
    db()
      .select({ n: count() })
      .from(schema.member)
      .where(eq(schema.member.organizationId, ctx.organizationId)),
  ]);

  return {
    servers: Number(servers[0]?.n ?? 0),
    requestsThisPeriod: Number(requests[0]?.n ?? 0),
    members: Number(members[0]?.n ?? 0),
  };
}

/**
 * The enforcement point.
 *
 * A limit that is displayed but never checked is decoration, so every action
 * with a limit calls this. It returns the reason and the plan that would
 * allow it, which is what lets the UI say something useful instead of "no".
 */
export async function allows(
  ctx: TenantContext,
  action: Action,
): Promise<Decision> {
  const [record, usage] = await Promise.all([
    db()
      .select({ plan: schema.subscription.plan, status: schema.subscription.status })
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, ctx.organizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    usageFor(ctx),
  ]);

  const planId = record && isActive(record.status) ? record.plan : "free";
  return check(planId, action, usage);
}

/* ------------------------------------------------------------------ stripe */

/**
 * Whichever payment provider this deployment is configured for.
 *
 * Null when neither is, so every caller degrades to "upgrading is
 * unavailable" rather than throwing. Razorpay is checked first: a deployment
 * that has configured it has done so deliberately, and it is the one that
 * works for an Indian business without a foreign entity.
 */
export function billingProvider(): BillingProvider | null {
  const razorpayId = process.env.RAZORPAY_KEY_ID;
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  const razorpayWebhook = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (razorpayId && razorpaySecret && razorpayWebhook) {
    return razorpayProvider({
      keyId: razorpayId,
      keySecret: razorpaySecret,
      webhookSecret: razorpayWebhook,
      plans: {
        hobby: process.env.RAZORPAY_PLAN_HOBBY,
        startup: process.env.RAZORPAY_PLAN_STARTUP,
      },
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;

  if (stripeKey && stripeWebhook) {
    return stripeProvider({
      secretKey: stripeKey,
      webhookSecret: stripeWebhook,
      prices: {
        hobby: process.env.STRIPE_PRICE_HOBBY,
        startup: process.env.STRIPE_PRICE_STARTUP,
      },
    });
  }

  return null;
}

/**
 * Applies a verified subscription change.
 *
 * Keyed on the Stripe event id: deliveries are retried, and a replay must be
 * a no-op rather than a second plan change or a duplicate audit entry.
 */
export async function applySubscription(input: {
  eventId: string;
  organizationId: string;
  plan: string;
  status: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}): Promise<{ applied: boolean }> {
  const seen = await db()
    .select({ id: schema.billingEvent.id })
    .from(schema.billingEvent)
    .where(eq(schema.billingEvent.stripeEventId, input.eventId))
    .limit(1);

  if (seen[0]) return { applied: false };

  const previous = await db()
    .select({ plan: schema.subscription.plan })
    .from(schema.subscription)
    .where(eq(schema.subscription.organizationId, input.organizationId))
    .limit(1);

  await db()
    .insert(schema.subscription)
    .values({
      organizationId: input.organizationId,
      plan: input.plan,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: schema.subscription.organizationId,
      set: {
        plan: input.plan,
        status: input.status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ? 1 : 0,
        updatedAt: new Date(),
      },
    });

  await db()
    .insert(schema.billingEvent)
    .values({
      organizationId: input.organizationId,
      stripeEventId: input.eventId,
      type: "subscription.changed",
      fromPlan: previous[0]?.plan ?? "free",
      toPlan: input.plan,
      detail: { status: input.status },
    })
    .onConflictDoNothing();

  return { applied: true };
}

/** Drops an organization back to free when its subscription ends. */
export async function endSubscription(input: {
  eventId: string;
  stripeCustomerId: string;
}): Promise<{ applied: boolean }> {
  const seen = await db()
    .select({ id: schema.billingEvent.id })
    .from(schema.billingEvent)
    .where(eq(schema.billingEvent.stripeEventId, input.eventId))
    .limit(1);

  if (seen[0]) return { applied: false };

  const rows = await db()
    .update(schema.subscription)
    .set({ plan: "free", status: "canceled", updatedAt: new Date() })
    .where(
      and(
        eq(schema.subscription.stripeCustomerId, input.stripeCustomerId),
        eq(schema.subscription.status, schema.subscription.status),
      ),
    )
    .returning({ organizationId: schema.subscription.organizationId });

  await db()
    .insert(schema.billingEvent)
    .values({
      organizationId: rows[0]?.organizationId ?? null,
      stripeEventId: input.eventId,
      type: "subscription.ended",
      toPlan: "free",
      detail: { stripeCustomerId: input.stripeCustomerId },
    })
    .onConflictDoNothing();

  return { applied: true };
}
