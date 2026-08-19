import { planOf, type Limits, type Plan, type PlanId } from "./plans";

/**
 * §31 — deciding whether an action is allowed, and saying why when it is not.
 *
 * The rule this file exists to enforce: a limit that is displayed but never
 * checked is decoration. Every check returns a reason and an upgrade target
 * so the UI can say what happened and what to do, rather than a bare refusal.
 *
 * Reads are never blocked. Someone over their limit can still see their
 * servers, read their logs and export their data — holding data hostage over
 * a plan is not a growth tactic, it is a reason to leave.
 */

export interface Usage {
  servers: number;
  requestsThisPeriod: number;
  members: number;
}

export type Action =
  | { kind: "create_server" }
  | { kind: "deploy" }
  | { kind: "invite_member" }
  | { kind: "use_preview_environments" }
  | { kind: "add_custom_domain" };

export type Decision =
  | { allowed: true }
  | {
      allowed: false;
      /** One sentence, addressed to the person who hit it. */
      reason: string;
      /** The cheapest plan that would allow this, if any. */
      upgradeTo: PlanId | null;
    };

export function check(
  planId: string | null | undefined,
  action: Action,
  usage: Usage,
): Decision {
  const plan = planOf(planId);
  const { limits } = plan;

  switch (action.kind) {
    case "create_server":
      if (limits.servers !== null && usage.servers >= limits.servers) {
        return deny(
          `The ${plan.name} plan includes ${limits.servers} server${limits.servers === 1 ? "" : "s"}, and you have ${usage.servers}.`,
          plan.id,
          (l) => l.servers === null || l.servers > usage.servers,
        );
      }
      return { allowed: true };

    case "deploy":
      // Deploying is never blocked by the request limit. Cutting off the
      // ability to ship a fix because traffic was high is the opposite of
      // what someone in that situation needs.
      return { allowed: true };

    case "invite_member":
      if (limits.members !== null && usage.members >= limits.members) {
        return deny(
          `The ${plan.name} plan includes ${limits.members} member${limits.members === 1 ? "" : "s"}.`,
          plan.id,
          (l) => l.members === null || l.members > usage.members,
        );
      }
      return { allowed: true };

    case "use_preview_environments":
      if (!limits.previewEnvironments) {
        return deny(
          `Preview environments are not included in the ${plan.name} plan.`,
          plan.id,
          (l) => l.previewEnvironments,
        );
      }
      return { allowed: true };

    case "add_custom_domain":
      if (!limits.customDomains) {
        return deny(
          `Custom domains are not included in the ${plan.name} plan.`,
          plan.id,
          (l) => l.customDomains,
        );
      }
      return { allowed: true };
  }
}

/** The cheapest plan above the current one that satisfies `satisfies`. */
function deny(
  reason: string,
  current: PlanId,
  satisfies: (limits: Limits) => boolean,
): Decision {
  const order: PlanId[] = ["free", "hobby", "startup", "enterprise"];
  const from = order.indexOf(current);

  for (const candidate of order.slice(from + 1)) {
    if (satisfies(planOf(candidate).limits)) {
      return { allowed: false, reason, upgradeTo: candidate };
    }
  }
  return { allowed: false, reason, upgradeTo: null };
}

/* ------------------------------------------------------------------ meters */

export interface Meter {
  label: string;
  used: number;
  limit: number | null;
  /** 0–1, or null when the limit is unlimited. */
  fraction: number | null;
  state: "ok" | "approaching" | "exceeded";
}

/**
 * Usage against limits, for the billing page.
 *
 * "Approaching" starts at 80%. Warning earlier trains people to ignore it;
 * warning only at 100% is not a warning, it is a notification of something
 * that already happened.
 */
export function meters(planId: string | null | undefined, usage: Usage): Meter[] {
  const { limits } = planOf(planId);

  return [
    meter("Servers", usage.servers, limits.servers),
    meter("Requests this month", usage.requestsThisPeriod, limits.requestsPerMonth),
    meter("Members", usage.members, limits.members),
  ];
}

function meter(label: string, used: number, limit: number | null): Meter {
  if (limit === null) {
    return { label, used, limit: null, fraction: null, state: "ok" };
  }
  const fraction = limit === 0 ? 1 : used / limit;
  return {
    label,
    used,
    limit,
    fraction: Math.min(fraction, 1),
    state: fraction >= 1 ? "exceeded" : fraction >= 0.8 ? "approaching" : "ok",
  };
}

export function formatPrice(plan: Plan): string {
  if (plan.priceCents === null) return "Custom";
  if (plan.priceCents === 0) return "Free";
  return `$${(plan.priceCents / 100).toFixed(0)}`;
}
