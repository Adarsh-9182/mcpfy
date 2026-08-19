/**
 * §31 — what each plan allows.
 *
 * Prices here are placeholders. What a plan costs is a business decision, not
 * an engineering one; the shape of the limits is the engineering part, and it
 * is what the rest of this package is built on. Change `PLANS` and everything
 * downstream follows.
 *
 * Limits are expressed as numbers or `null` for unlimited, never as a magic
 * large number. `Infinity` does not survive JSON, and 999999 eventually
 * becomes a support ticket from whoever hits it.
 */

export type PlanId = "free" | "hobby" | "startup" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in the smallest currency unit. Null means "talk to us". */
  priceCents: number | null;
  blurb: string;
  limits: Limits;
  features: string[];
}

export interface Limits {
  /** Servers that may exist at once. */
  servers: number | null;
  /** Gateway requests per billing period. */
  requestsPerMonth: number | null;
  /** People in the organization. */
  members: number | null;
  /** How long request and session history is kept. */
  retentionDays: number;
  /** Concurrent deployments. Queueing beyond this is not an error. */
  concurrentDeployments: number;
  previewEnvironments: boolean;
  customDomains: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    blurb: "Enough to put a real server in front of a real client.",
    limits: {
      servers: 2,
      requestsPerMonth: 50_000,
      members: 1,
      retentionDays: 7,
      concurrentDeployments: 1,
      previewEnvironments: false,
      customDomains: false,
    },
    features: [
      "Deploy from a git repository",
      "Inspector and readiness audit",
      "Gateway with full request tracing",
    ],
  },
  hobby: {
    id: "hobby",
    name: "Hobby",
    priceCents: 2500,
    blurb: "For a side project that people other than you rely on.",
    limits: {
      servers: 10,
      requestsPerMonth: 500_000,
      members: 3,
      retentionDays: 30,
      concurrentDeployments: 2,
      previewEnvironments: true,
      customDomains: true,
    },
    features: [
      "Everything in Free",
      "Preview environment per branch",
      "Custom domains with TLS",
      "30 days of history",
    ],
  },
  startup: {
    id: "startup",
    name: "Startup",
    priceCents: 25000,
    blurb: "For a team shipping MCP as part of the product.",
    limits: {
      servers: null,
      requestsPerMonth: 10_000_000,
      members: 10,
      retentionDays: 365,
      concurrentDeployments: 5,
      previewEnvironments: true,
      customDomains: true,
    },
    features: [
      "Everything in Hobby",
      "Unlimited servers",
      "A year of history",
      "Priority support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceCents: null,
    blurb: "For teams with procurement, auditors, and a security review.",
    limits: {
      servers: null,
      requestsPerMonth: null,
      members: null,
      retentionDays: 365 * 3,
      concurrentDeployments: 20,
      previewEnvironments: true,
      customDomains: true,
    },
    features: [
      "Everything in Startup",
      "SSO and SCIM",
      "Configurable retention",
      "SLA and dedicated support",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "hobby", "startup", "enterprise"];

export function planOf(id: string | null | undefined): Plan {
  // Anything unrecognised falls back to free rather than throwing. A billing
  // record that has drifted must not lock someone out of their own dashboard.
  return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}
