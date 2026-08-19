import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge, cn } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { scoped } from "@mcpfy/db";
import type { Category, Check, Severity } from "@mcpfy/readiness";
import { requireViewer } from "@/lib/session";
import { readinessReport } from "@/lib/readiness";

export const metadata: Metadata = { title: "Readiness" };

const CATEGORY_LABEL: Record<Category, string> = {
  protocol: "Protocol",
  schema: "Schemas",
  descriptions: "Descriptions",
  safety: "Safety",
  behaviour: "Observed behaviour",
};

const CATEGORY_BLURB: Record<Category, string> = {
  protocol: "Can a client connect and find anything to call.",
  schema: "Whether an agent can work out how to call your tools.",
  descriptions: "Whether an agent can work out which tool to reach for.",
  safety: "What happens when it reaches for the wrong one.",
  behaviour: "What actually happened, from traffic through the gateway.",
};

const SEVERITY_TONE: Record<Severity, "danger" | "warning" | "neutral"> = {
  blocker: "danger",
  important: "warning",
  advisory: "neutral",
};

const ORDER: Category[] = [
  "protocol",
  "descriptions",
  "schema",
  "safety",
  "behaviour",
];

export default async function ReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;

  const server = (
    await db()
      .select({ id: schema.server.id, name: schema.server.name })
      .from(schema.server)
      .where(scoped(viewer.tenant, schema.server, eq(schema.server.id, id)))
      .limit(1)
  )[0];

  if (!server) notFound();

  const report = await readinessReport(viewer.tenant, id);

  const failed = report.checks.filter((c) => !c.passed);
  const grouped = ORDER.map((category) => ({
    category,
    checks: report.checks.filter((c) => c.category === category),
  })).filter((group) => group.checks.length > 0);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          href={`/app/servers/${id}`}
          className="text-2xs text-subtle transition-colors hover:text-accent-text"
        >
          ← {server.name}
        </Link>
      </nav>

      <div className="mb-6">
        <h1 className="text-xl font-medium text-hi">Readiness</h1>
        <p className="mt-1 max-w-xl text-base leading-relaxed text-muted">
          What an agent will make of this server — and what a week of real
          traffic says about it.
        </p>
      </div>

      <Score report={report} />

      {failed.length > 0 ? (
        <p className="mt-4 text-base text-muted">
          {failed.length} check{failed.length === 1 ? "" : "s"} to address.
          Each one says what to do.
        </p>
      ) : (
        <p className="mt-4 text-base text-success">
          Every check passes. This server is ready to hand to agents.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {grouped.map((group) => (
          <section key={group.category}>
            <div className="mb-2.5 flex items-baseline gap-3">
              <h2 className="text-base font-medium text-hi">
                {CATEGORY_LABEL[group.category]}
              </h2>
              <p className="text-2xs text-subtle">
                {CATEGORY_BLURB[group.category]}
              </p>
            </div>
            <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
              {group.checks.map((check) => (
                <li
                  key={check.id}
                  className="border-b border-line last:border-0"
                >
                  <CheckRow check={check} serverId={id} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {report.behaviourSkipped ? (
        <p className="mt-5 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3 text-2xs leading-relaxed text-muted">
          Behaviour checks were skipped: no traffic has reached this server
          through the gateway in the last week. Schema and description checks
          tell you whether an agent <em>could</em> use it; only traffic tells
          you whether one <em>did</em>, and scoring that from nothing would be
          inventing a verdict.
        </p>
      ) : null}
    </>
  );
}

function Score({ report }: { report: Awaited<ReturnType<typeof readinessReport>> }) {
  const tone =
    report.grade === "ready"
      ? { ring: "var(--success)", text: "text-success", label: "Ready" }
      : report.grade === "nearly"
        ? { ring: "var(--warning)", text: "text-warning", label: "Nearly ready" }
        : { ring: "var(--danger)", text: "text-danger", label: "Not ready" };

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-[var(--radius-xl)] border border-line bg-surface p-5">
      <div
        className="relative grid size-24 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${tone.ring} ${report.score}%, var(--bg-panel) 0)`,
        }}
        role="img"
        aria-label={`Readiness score ${report.score} out of 100`}
      >
        <span className="grid size-[5.25rem] place-items-center rounded-full bg-surface">
          <span className={cn("font-mono text-2xl tabular-nums", tone.text)}>
            {report.score}
          </span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("text-lg font-medium", tone.text)}>{tone.label}</p>
        <p className="mt-1 text-base text-muted">
          {report.summary.passed} of {report.summary.total} checks pass.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.summary.blockers > 0 ? (
            <Badge tone="danger">{report.summary.blockers} blocking</Badge>
          ) : null}
          {report.summary.important > 0 ? (
            <Badge tone="warning">{report.summary.important} important</Badge>
          ) : null}
          {report.summary.advisory > 0 ? (
            <Badge>{report.summary.advisory} advisory</Badge>
          ) : null}
          {report.summary.blockers === 0 &&
          report.summary.important === 0 &&
          report.summary.advisory === 0 ? (
            <Badge tone="success">no findings</Badge>
          ) : null}
        </div>
        {report.summary.blockers > 0 ? (
          <p className="mt-3 text-2xs leading-relaxed text-muted">
            A blocking failure caps the score. A server that cannot be
            connected to is not partly ready.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CheckRow({ check, serverId }: { check: Check; serverId: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        check.passed ? "opacity-70" : undefined,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 grid size-4 shrink-0 place-items-center rounded-full font-mono text-[10px]",
          check.passed
            ? "bg-success-surface text-success"
            : check.severity === "blocker"
              ? "bg-danger-surface text-danger"
              : check.severity === "important"
                ? "bg-warning-surface text-warning"
                : "bg-panel text-subtle",
        )}
      >
        {check.passed ? "✓" : "!"}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-base text-hi">
          {check.title}
          {!check.passed ? (
            <Badge tone={SEVERITY_TONE[check.severity]}>{check.severity}</Badge>
          ) : null}
        </p>

        {check.detail ? (
          <p className="mt-1 text-2xs leading-relaxed text-muted">
            {check.detail}
          </p>
        ) : null}

        {check.subjects && check.subjects.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {check.subjects.map((subject) => (
              <li key={subject}>
                <Badge mono>{subject}</Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {/* §48 — an error that does not say what to do next is only half an
            error message. Every failure carries its remedy. */}
        {check.remedy ? (
          <p className="mt-2 border-l-2 border-accent-border pl-2.5 text-2xs leading-relaxed text-subtle">
            {check.remedy}
          </p>
        ) : null}

        {!check.passed && check.category === "behaviour" ? (
          <Link
            href={`/app/servers/${serverId}/inspector`}
            className="mt-2 inline-block text-2xs text-accent-text hover:underline"
          >
            Reproduce it in the Inspector →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
