import type { Metadata } from "next";
import Link from "next/link";
import { Badge, cn } from "@mcpfy/ui";
import { PLAN_ORDER, PLANS, formatPrice } from "@mcpfy/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "MCPfy pricing. The SDK, CLI and audit tool are MIT and free forever; the hosted control plane is what you pay for.",
  alternates: { canonical: "/pricing" },
};

const nf = new Intl.NumberFormat("en", { notation: "compact" });

function limit(value: number | null, suffix = ""): string {
  return value === null ? "Unlimited" : `${nf.format(value)}${suffix}`;
}

const ROWS: {
  label: string;
  value: (id: (typeof PLAN_ORDER)[number]) => string;
}[] = [
  { label: "Servers", value: (id) => limit(PLANS[id].limits.servers) },
  {
    label: "Gateway requests",
    value: (id) => limit(PLANS[id].limits.requestsPerMonth, "/mo"),
  },
  { label: "Team members", value: (id) => limit(PLANS[id].limits.members) },
  {
    label: "History",
    value: (id) => {
      const days = PLANS[id].limits.retentionDays;
      return days >= 365 ? `${Math.round(days / 365)} year${days >= 730 ? "s" : ""}` : `${days} days`;
    },
  },
  {
    label: "Preview environments",
    value: (id) => (PLANS[id].limits.previewEnvironments ? "Yes" : "—"),
  },
  {
    label: "Custom domains",
    value: (id) => (PLANS[id].limits.customDomains ? "Yes" : "—"),
  },
];

export default function PricingPage() {
  return (
    <article>
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent-text">
        Pricing
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-hi">
        Pay for the control plane, not the primitives.
      </h1>
      <p className="mt-3 max-w-2xl text-md leading-relaxed text-muted">
        The SDK, the scaffolder, the telemetry proxy and{" "}
        <code className="font-mono text-fg">npx mcpfy-audit</code> are MIT
        licensed and free forever — no account, no limits, nothing to sign.
        What you pay for is the part that runs on our machines.
      </p>

      <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const featured = id === "hobby";
          return (
            <div
              key={id}
              className={cn(
                "flex flex-col rounded-[var(--radius-xl)] border p-5",
                featured
                  ? "border-accent-border bg-accent-surface"
                  : "border-line bg-surface",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-medium text-hi">{plan.name}</p>
                {featured ? <Badge tone="accent">Most picked</Badge> : null}
              </div>

              <p className="mt-3 font-mono text-2xl text-hi">
                {formatPrice(plan)}
                {plan.priceCents ? (
                  <span className="text-2xs text-faint"> /mo</span>
                ) : null}
              </p>

              <p className="mt-2 min-h-[2.5rem] text-2xs leading-relaxed text-muted">
                {plan.blurb}
              </p>

              <ul className="mt-4 flex flex-1 flex-col gap-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-2xs text-muted">
                    <span aria-hidden="true" className="text-success">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.priceCents === null ? "/docs" : "/signup"}
                className={cn(
                  "mt-5 rounded-[var(--radius-md)] px-3 py-2 text-center text-base transition-colors",
                  featured
                    ? "bg-accent text-on-accent hover:bg-accent-hover"
                    : "border border-line-default bg-panel text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {plan.priceCents === null
                  ? "Talk to us"
                  : plan.priceCents === 0
                    ? "Start free"
                    : `Start with ${plan.name}`}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-10 overflow-x-auto rounded-[var(--radius-xl)] border border-line bg-surface">
        <table className="w-full min-w-[36rem] text-base">
          <caption className="sr-only">Limits by plan</caption>
          <thead>
            <tr className="border-b border-line bg-panel">
              <th scope="col" className="px-4 py-3 text-left text-2xs font-medium uppercase tracking-wider text-subtle">
                Limit
              </th>
              {PLAN_ORDER.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="px-4 py-3 text-left text-2xs font-medium uppercase tracking-wider text-subtle"
                >
                  {PLANS[id].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-hi">
                  {row.label}
                </th>
                {PLAN_ORDER.map((id) => (
                  <td key={id} className="px-4 py-3 font-mono text-sm text-muted">
                    {row.value(id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Said plainly rather than buried: going over a limit stops you creating
        more, it does not switch off what you have or hold your data. A
        pricing page that is vague about this is vague on purpose.
      */}
      <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3.5">
        <p className="text-base font-medium text-hi">What happens at a limit</p>
        <p className="mt-1.5 max-w-2xl text-2xs leading-relaxed text-muted">
          Nothing is switched off. Going over stops you creating more of that
          thing until you upgrade or remove some — your servers keep serving,
          your data stays yours, and reading and exporting always work.
          Deploying is never blocked, because cutting off the ability to ship a
          fix when traffic is high is the opposite of what you need.
        </p>
      </div>
    </article>
  );
}
