import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Badge, cn } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { hasRole } from "@mcpfy/db";
import { PLAN_ORDER, PLANS, formatPrice, isUpgrade } from "@mcpfy/billing";
import { requireViewer } from "@/lib/session";
import { billingFor, stripeConfig } from "@/lib/billing";
import { PlanActions } from "./plan-actions";

export const metadata: Metadata = { title: "Billing" };

const nf = new Intl.NumberFormat("en");

export default async function BillingPage() {
  const viewer = await requireViewer("/app/settings/billing");
  const billing = await billingFor(viewer.tenant);
  const configured = stripeConfig() !== null;
  const canManage = hasRole(viewer.tenant, "admin");

  const history = await db()
    .select({
      id: schema.billingEvent.id,
      type: schema.billingEvent.type,
      fromPlan: schema.billingEvent.fromPlan,
      toPlan: schema.billingEvent.toPlan,
      at: schema.billingEvent.at,
    })
    .from(schema.billingEvent)
    .where(eq(schema.billingEvent.organizationId, viewer.tenant.organizationId))
    .orderBy(desc(schema.billingEvent.at))
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-medium text-hi">Billing</h1>
        <p className="mt-1 text-base text-muted">{viewer.organization.name}</p>
      </div>

      {/* Current plan */}
      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-lg font-medium text-hi">
              {billing.plan.name}
              {!billing.active ? <Badge tone="danger">{billing.status}</Badge> : null}
              {billing.cancelAtPeriodEnd ? (
                <Badge tone="warning">ends at period end</Badge>
              ) : null}
            </p>
            <p className="mt-1 text-base text-muted">{billing.plan.blurb}</p>
            {billing.currentPeriodEnd ? (
              <p className="mt-1.5 font-mono text-2xs text-faint">
                {billing.cancelAtPeriodEnd ? "Access until" : "Renews"}{" "}
                {billing.currentPeriodEnd.toISOString().slice(0, 10)}
              </p>
            ) : null}
          </div>
          <PlanActions
            currentPlan={billing.plan.id}
            hasCustomer={Boolean(billing.stripeCustomerId)}
            configured={configured}
            canManage={canManage}
          />
        </div>

        <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
          {billing.meters.map((meter) => (
            <div key={meter.label}>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-base text-muted">{meter.label}</dt>
                <dd
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    meter.state === "exceeded"
                      ? "text-danger"
                      : meter.state === "approaching"
                        ? "text-warning"
                        : "text-fg",
                  )}
                >
                  {nf.format(meter.used)}
                  <span className="text-faint">
                    {meter.limit === null ? " / unlimited" : ` / ${nf.format(meter.limit)}`}
                  </span>
                </dd>
              </div>
              {meter.fraction !== null ? (
                <div
                  className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel"
                  role="presentation"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      meter.state === "exceeded"
                        ? "bg-danger"
                        : meter.state === "approaching"
                          ? "bg-warning"
                          : "bg-accent",
                    )}
                    style={{ width: `${Math.max(meter.fraction * 100, 1.5)}%` }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </dl>

        {billing.meters.some((m) => m.state === "exceeded") ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-warning-border bg-warning-surface px-3 py-2 text-2xs leading-relaxed text-warning">
            You are over a limit. Nothing has been switched off and your data is
            untouched — creating more is blocked until you upgrade or remove
            some. Reading and exporting always keep working.
          </p>
        ) : null}
      </section>

      {/* Plans */}
      <h2 className="mb-3 mt-8 text-lg font-medium text-hi">Plans</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const current = id === billing.plan.id;
          return (
            <div
              key={id}
              className={cn(
                "rounded-[var(--radius-lg)] border p-4",
                current ? "border-accent-border bg-accent-surface" : "border-line bg-surface",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-medium text-hi">{plan.name}</p>
                <p className="font-mono text-sm text-fg">
                  {formatPrice(plan)}
                  {plan.priceCents ? (
                    <span className="text-2xs text-faint">/mo</span>
                  ) : null}
                </p>
              </div>
              <ul className="mt-2.5 flex flex-col gap-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-2xs text-muted">
                    <span aria-hidden="true" className="text-success">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              {current ? (
                <p className="mt-3 text-2xs text-accent-text">Current plan</p>
              ) : isUpgrade(billing.plan.id, id) ? (
                <p className="mt-3 text-2xs text-faint">Upgrade available</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {history.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 text-lg font-medium text-hi">History</h2>
          <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
            {history.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-x-3 border-b border-line px-4 py-2.5 text-base last:border-0"
              >
                <span className="text-fg">
                  {event.fromPlan && event.toPlan && event.fromPlan !== event.toPlan
                    ? `${event.fromPlan} → ${event.toPlan}`
                    : event.type}
                </span>
                <span className="ml-auto font-mono text-2xs text-faint">
                  {event.at.toISOString().replace("T", " ").slice(0, 16)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!configured ? (
        <p className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3 text-2xs leading-relaxed text-muted">
          Stripe is not configured on this deployment, so upgrading is
          unavailable and everyone is on the Free plan. Limits are still
          enforced. Set <code className="font-mono">STRIPE_SECRET_KEY</code>,{" "}
          <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> and the price
          ids to turn it on —{" "}
          <Link href="/pricing" className="text-accent-text hover:underline">
            see the plans
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
