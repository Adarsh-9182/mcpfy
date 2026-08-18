import Link from "next/link";
import { Badge, Button, StatusDot } from "@mcpfy/ui";
import { InspectorDemo } from "./inspector-demo";

function SectionHeading({
  eyebrow,
  title,
  description,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  id?: string;
}) {
  return (
    <div className="max-w-2xl" id={id}>
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent-text">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-hi lg:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-md leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  );
}

const CONNECTED = [
  { name: "github-mcp", category: "Developer tools" },
  { name: "postgres-mcp", category: "Databases" },
  { name: "slack-mcp", category: "Communication" },
  { name: "finance-mcp", category: "Finance" },
  { name: "customer-mcp", category: "CRM" },
  { name: "internal-apps-mcp", category: "Internal apps" },
] as const;

export function Architecture() {
  return (
    <section className="border-b border-line py-20">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <SectionHeading
          eyebrow="Architecture"
          title="One gateway between agents and everything they touch."
          description="Every request is authenticated, routed, rate-limited and traced before it reaches a server. Nothing bypasses the gateway, so there is exactly one place to look when something goes wrong."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)] lg:items-center">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
            <p className="text-2xs font-medium uppercase tracking-wider text-faint">
              AI clients
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {["Claude", "ChatGPT", "Cursor", "VS Code", "Custom agents"].map(
                (c) => (
                  <li
                    key={c}
                    className="rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-1.5 text-base text-muted"
                  >
                    {c}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div
            aria-hidden="true"
            className="hidden h-px w-10 bg-[var(--border-strong)] lg:block"
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border border-accent-border bg-[var(--accent-surface)] p-4">
              <p className="text-2xs font-medium uppercase tracking-wider text-accent-text">
                MCPfy gateway
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-1.5">
                {["routing", "auth", "rate limits", "policies", "tracing", "replay"].map(
                  (f) => (
                    <li
                      key={f}
                      className="rounded-[var(--radius-sm)] border border-accent-border bg-[color-mix(in_oklab,var(--bg-base)_35%,transparent)] px-2 py-1 font-mono text-2xs text-accent-text"
                    >
                      {f}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
              <p className="text-2xs font-medium uppercase tracking-wider text-faint">
                MCP servers · 24 connected
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {CONNECTED.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-1.5"
                  >
                    <span className="truncate font-mono text-sm text-fg">
                      {s.name}
                    </span>
                    <span className="shrink-0 text-2xs text-faint">
                      {s.category}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Inspector() {
  return (
    <section className="border-b border-line py-20" id="inspector">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <SectionHeading
          eyebrow="Inspector"
          title="Call any tool the way an agent would."
          description="Execute against a live deployment, validate arguments against the published schema, replay anything from history, and read the JSON-RPC exchange underneath. This one runs entirely in your browser — try it."
        />
        <div className="mt-8">
          <InspectorDemo />
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    title: "Deploy from GitHub",
    body: "Connect a repository, we detect the framework and runtime, and every push gets a preview endpoint. Promote to production when the evals pass.",
    points: ["Branch previews", "Build logs", "Rollbacks", "Custom domains"],
  },
  {
    title: "Observe every call",
    body: "Requests, tool calls, latency percentiles, error grouping and client breakdown — indexed by trace id so a complaint becomes a query.",
    points: ["p50/p95/p99", "Error grouping", "Client + model split", "Trace ids"],
  },
  {
    title: "Replay agent sessions",
    body: "See the whole chain: what the user asked, which tools the agent reached for, what came back, and where it went wrong.",
    points: ["Full session chain", "Per-span timing", "Failed calls", "Shareable links"],
  },
  {
    title: "Catch regressions",
    body: "Define what a good answer looks like, then run it against local, preview and production on every deploy.",
    points: ["Expected tool", "Argument assertions", "Pass rate", "Latency budget"],
  },
] as const;

export function Capabilities() {
  return (
    <section className="border-b border-line py-20" id="observability">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <SectionHeading
          eyebrow="Control plane"
          title="Every metric leads somewhere."
          description="A number you cannot click is decoration. Each figure in MCPfy opens the logs, traces or sessions that produced it."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <article
              key={c.title}
              className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <h3 className="text-lg font-medium text-hi">{c.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-muted">
                {c.body}
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {c.points.map((p) => (
                  <li key={p}>
                    <Badge mono>{p}</Badge>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const PERMISSIONS = [
  { resource: "Customer data", read: true, write: false, del: false },
  { resource: "Invoices", read: true, write: true, del: false },
  { resource: "Users", read: true, write: false, del: false },
] as const;

export function Security() {
  return (
    <section className="border-b border-line py-20" id="security">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <SectionHeading
            eyebrow="Security"
            title="Agents get exactly the access you grant."
            description="Per-tool permissions, API key and OAuth authentication, rate limits, encrypted secret storage and an audit log of every call. Destructive tools require explicit confirmation before they run."
          />
          <ul className="mt-6 flex flex-wrap gap-2">
            {["API keys", "OAuth 2.1", "Audit logs", "Encrypted secrets", "Rate limits"].map(
              (f) => (
                <li key={f}>
                  <Badge tone="success">{f}</Badge>
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          <div className="border-b border-line bg-panel px-4 py-2.5">
            <p className="text-2xs font-medium uppercase tracking-wider text-faint">
              Tool access · customer-mcp
            </p>
          </div>
          <table className="w-full text-base">
            <caption className="sr-only">
              Permissions granted to agents per resource
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2 text-left text-2xs font-medium uppercase tracking-wider text-subtle">
                  Resource
                </th>
                {["Read", "Write", "Delete"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2 text-right text-2xs font-medium uppercase tracking-wider text-subtle"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((row) => (
                <tr key={row.resource} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-fg">{row.resource}</td>
                  {[row.read, row.write, row.del].map((granted, i) => (
                    <td key={i} className="px-4 py-2.5 text-right">
                      <span
                        className={
                          granted
                            ? "font-mono text-sm text-success"
                            : "font-mono text-sm text-faint"
                        }
                      >
                        {granted ? "allow" : "deny"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function OpenSource() {
  return (
    <section className="border-b border-line py-20">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <SectionHeading
          eyebrow="Open source"
          title="The SDK, the CLI and the inspector are MIT."
          description="MCPfy is built in the open. The pieces you run in your own process are yours to fork, audit and extend — the platform is what you pay for, not the primitives."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              pkg: "mcpfy-sdk",
              desc: "Tools, prompts, resources and widgets over HTTP and stdio.",
            },
            {
              pkg: "create-mcpfy-app",
              desc: "A working MCP server in one command.",
            },
            {
              pkg: "mcpfy-pulse",
              desc: "Drop-in telemetry for any MCP server. Never sends argument values.",
            },
          ].map((p) => (
            <a
              key={p.pkg}
              href={`https://www.npmjs.com/package/${p.pkg}`}
              className="group rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:border-line-strong"
            >
              <p className="font-mono text-base text-hi">{p.pkg}</p>
              <p className="mt-2 text-2xs leading-relaxed text-muted">{p.desc}</p>
              <p className="mt-3 text-2xs text-faint transition-colors group-hover:text-accent-text">
                View on npm →
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1240px] px-6 text-center lg:px-8">
        <h2 className="mx-auto max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-hi lg:text-4xl">
          Make your software reachable by agents.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-md leading-relaxed text-muted">
          Discover, build, test, secure, deploy and observe MCP servers without
          leaving MCPfy.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup">
            <Button variant="primary" size="lg">
              Start building
            </Button>
          </Link>
          <Link href="/docs">
            <Button variant="secondary" size="lg">
              Read the docs
            </Button>
          </Link>
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 font-mono text-2xs text-faint">
          <StatusDot status="healthy" label={false} />
          All systems operational
        </p>
      </div>
    </section>
  );
}
