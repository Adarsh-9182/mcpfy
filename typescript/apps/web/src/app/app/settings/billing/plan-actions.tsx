"use client";

import { useActionState } from "react";
import { Button } from "@mcpfy/ui";
import type { PlanId } from "@mcpfy/billing";
import { openPortalAction, startCheckoutAction } from "./actions";

/**
 * Upgrading goes through Stripe Checkout; everything after — cards, invoices,
 * cancellation — goes to Stripe's portal. Rebuilding those screens means
 * holding card data and reimplementing dunning, for no gain to anyone.
 */
export function PlanActions({
  currentPlan,
  hasCustomer,
  configured,
  canManage,
}: {
  currentPlan: PlanId;
  hasCustomer: boolean;
  configured: boolean;
  canManage: boolean;
}) {
  const [checkout, upgrade, upgrading] = useActionState(startCheckoutAction, {});
  const [portal, manage, opening] = useActionState(openPortalAction, {});

  if (!canManage) {
    return (
      <p className="max-w-[16rem] text-right text-2xs text-subtle">
        Changing the plan requires the admin role.
      </p>
    );
  }

  if (!configured) {
    return (
      <p className="max-w-[16rem] text-right text-2xs text-subtle">
        Stripe is not configured here.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {hasCustomer ? (
          <form action={manage}>
            <Button type="submit" size="md" loading={opening}>
              Manage billing
            </Button>
          </form>
        ) : null}

        {currentPlan === "free" ? (
          <form action={upgrade}>
            <input type="hidden" name="plan" value="hobby" />
            <Button type="submit" variant="primary" size="md" loading={upgrading}>
              Upgrade to Hobby
            </Button>
          </form>
        ) : currentPlan === "hobby" ? (
          <form action={upgrade}>
            <input type="hidden" name="plan" value="startup" />
            <Button type="submit" variant="primary" size="md" loading={upgrading}>
              Upgrade to Startup
            </Button>
          </form>
        ) : null}
      </div>

      {checkout.error || portal.error ? (
        <p role="alert" className="max-w-xs text-right text-2xs text-danger">
          {checkout.error ?? portal.error}
        </p>
      ) : null}
    </div>
  );
}
