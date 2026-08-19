import Link from "next/link";
import { Badge, CodeBlock, StatusDot, Terminal } from "@mcpfy/ui";
import { InspectorDemo } from "./inspector-demo";

/**
 * The lifecycle, told as a sequence rather than a grid.
 *
 * The previous landing page repeated one section shape six times, so nothing
 * read as more important than anything else. Here each stage alternates side,
 * and each carries a different *kind* of evidence — a terminal, a routing
 * diagram, a live tool, a permission table. Variety is what makes a page
 * scannable; a uniform drumbeat is what makes it feel generated.
 */

function Stage({
  index,
  id,
  eyebrow,
  title,
  body,
  points,
  visual,
  flip = false,
}: {
  index: number;
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className={flip ? "lg:order-2" : undefined}>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xs tabular-nums text-faint">
                {String(index).padStart(2, "0")}
              </span>
              <span className="h-px w-6 bg-[var(--border-strong)]" aria-hidden="true" />
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-accent-text">
                {eyebrow}
              </span>
            </div>

            <h2
              className="mt-5 text-3xl font-semibold text-hi lg:text-5xl"
              style={{
                lineHeight: "1.05",
                letterSpacing: "var(--tracking-display)",
              }}
            >
              {title}
            </h2>

            <p className="mt-4 max-w-md text-md leading-relaxed text-muted">
              {body}
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {points.map((point) => (
                <li key={point} className="flex gap-2.5 text-base text-muted">
                  <span
                    aria-hidden="true"
                    className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-accent"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className={flip ? "lg:order-1" : undefined}>{visual}</div>
        </div>
      </div>
    </section>
  );
}

/** A framed surface, so every visual sits at the same optical depth. */
function Frame({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-[var(--shadow-panel),var(--edge-highlight)] ${className ?? ""}`}
    >
      {label ? (
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2">
          <span className="font-mono text-2xs text-subtle">{label}</span>
          <StatusDot status="healthy" label={false} />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Lifecycle() {
  return (
    <>
      <Stage
        index={1}
        id="deploy"
        eyebrow="Deploy"
        title="Point at a repository. Get an endpoint."
        body="MCPfy clones the repo, works out how to build it, runs it, and refuses to call it live until a real MCP handshake succeeds against it."
        points={[
          "Framework, runtime and build commands detected — with the evidence shown",
          "Build and runtime logs streamed live, not summarised after the fact",
          "A deployment reaching “live” means a client actually connected to it",
        ]}
        visual={
          <Frame label="deploy.log">
            <Terminal
              className="rounded-none border-0"
              lines={[
                { kind: "command", text: "mcpfy deploy" },
                { kind: "muted", text: "cloning customer-mcp @ 8f31d2a" },
                { kind: "success", text: "detected mcpfy-sdk · node 22 · pnpm" },
                { kind: "output", text: "$ pnpm install --frozen-lockfile" },
                { kind: "output", text: "$ pnpm build" },
                { kind: "success", text: "listening on :41732" },
                { kind: "success", text: "MCP handshake ok — 4 tools discovered" },
                { kind: "muted", text: "" },
                { kind: "success", text: "live · https://customer-mcp.mcpfy.app/mcp" },
              ]}
            />
          </Frame>
        }
      />

      <Stage
        index={2}
        id="gateway"
        eyebrow="Route"
        title="One authenticated path in."
        body="Every request is identified, authorised, rate-limited and traced before it reaches a server — so there is exactly one place to look when something goes wrong."
        points={[
          "Per-tool permissions, not per-server all-or-nothing",
          "API keys and OAuth, with scopes checked on the server",
          "A trace id on every request, carried through to the tool call",
        ]}
        flip
        visual={
          <Frame label="gateway">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-5">
              <ul className="flex flex-col gap-1.5">
                {["Claude", "ChatGPT", "Cursor", "VS Code"].map((client) => (
                  <li
                    key={client}
                    className="rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-1.5 text-2xs text-muted"
                  >
                    {client}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col items-center gap-1" aria-hidden="true">
                <span className="h-px w-8 bg-[var(--border-strong)]" />
                <span className="rounded-[var(--radius-sm)] border border-accent-border bg-[var(--accent-surface)] px-2 py-3 text-center font-mono text-2xs leading-tight text-accent-text">
                  auth
                  <br />
                  route
                  <br />
                  trace
                </span>
                <span className="h-px w-8 bg-[var(--border-strong)]" />
              </div>

              <ul className="flex flex-col gap-1.5">
                {["customer-mcp", "billing-mcp", "search-mcp", "internal-mcp"].map(
                  (server) => (
                    <li
                      key={server}
                      className="rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-1.5 font-mono text-2xs text-fg"
                    >
                      {server}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="border-t border-line bg-panel px-4 py-2 font-mono text-2xs text-faint">
              trace_8f31d2 · 42ms · tools/call search_customers · 200
            </div>
          </Frame>
        }
      />

      <Stage
        index={3}
        id="observability"
        eyebrow="Observe"
        title="Every number leads somewhere."
        body="A figure you cannot click is decoration. Each metric opens the requests, traces or sessions that produced it, so a complaint becomes a query instead of a guess."
        points={[
          "p50, p95 and p99 per tool — not one average across everything",
          "Errors grouped by cause, with the deployment that introduced them",
          "Session replay: what was asked, which tools ran, what came back",
        ]}
        visual={
          <Frame label="customer-mcp · last 24h">
            <div className="grid grid-cols-2 gap-px bg-[var(--border-subtle)]">
              {[
                { label: "Requests", value: "1.42M", tone: "text-hi" },
                { label: "Tool calls", value: "984k", tone: "text-hi" },
                { label: "Error rate", value: "0.12%", tone: "text-success" },
                { label: "p95", value: "184ms", tone: "text-hi" },
              ].map((metric) => (
                <div key={metric.label} className="bg-surface px-4 py-3.5">
                  <p className="text-2xs uppercase tracking-wider text-subtle">
                    {metric.label}
                  </p>
                  <p
                    className={`mt-1 font-mono text-xl tabular-nums ${metric.tone}`}
                  >
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-line p-4">
              <div className="flex h-16 items-end gap-[3px]" aria-hidden="true">
                {[
                  38, 52, 44, 61, 57, 72, 65, 80, 74, 68, 83, 91, 77, 86, 70, 62,
                  75, 88, 94, 81, 69, 58, 66, 73,
                ].map((height, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-t-[2px] bg-accent/70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <p className="mt-2 font-mono text-2xs text-faint">
                requests / hour
              </p>
            </div>
          </Frame>
        }
      />

      <Stage
        index={4}
        id="security"
        eyebrow="Contain"
        title="Agents get exactly what you grant."
        body="MCP tools do real things to real systems. Access is granted per tool and per resource, secrets are encrypted at rest, and every execution is written to an audit log."
        points={[
          "Read, write and delete decided per resource, not per server",
          "Secrets sealed with AES-256-GCM; the plaintext never leaves the server",
          "Destructive tools require explicit confirmation before they run",
        ]}
        flip
        visual={
          <Frame label="tool access · customer-mcp">
            <table className="w-full text-base">
              <caption className="sr-only">
                Permissions granted to agents per resource
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-2xs font-medium uppercase tracking-wider text-subtle"
                  >
                    Resource
                  </th>
                  {["Read", "Write", "Delete"].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-2 text-right text-2xs font-medium uppercase tracking-wider text-subtle"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { resource: "Customer data", grants: [true, false, false] },
                  { resource: "Invoices", grants: [true, true, false] },
                  { resource: "Users", grants: [true, false, false] },
                  { resource: "Audit log", grants: [true, false, false] },
                ].map((row) => (
                  <tr
                    key={row.resource}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-2.5 text-fg">{row.resource}</td>
                    {row.grants.map((granted, i) => (
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
          </Frame>
        }
      />
    </>
  );
}

/** The Inspector gets a full-width stage — it is the thing worth touching. */
export function InspectorStage() {
  return (
    <section id="inspector" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xs tabular-nums text-faint">05</span>
              <span className="h-px w-6 bg-[var(--border-strong)]" aria-hidden="true" />
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-accent-text">
                Inspect
              </span>
            </div>
            <h2
              className="mt-5 text-3xl font-semibold text-hi lg:text-5xl"
              style={{
                lineHeight: "1.05",
                letterSpacing: "var(--tracking-display)",
              }}
            >
              Call it the way an agent would.
            </h2>
            <p className="mt-4 text-md leading-relaxed text-muted">
              Execute against a live deployment, validate against the published
              schema, and read the JSON-RPC underneath — handshake included.
            </p>
          </div>
          <Badge tone="accent">Try it — this one is real</Badge>
        </div>

        <div className="mt-8">
          <InspectorDemo />
        </div>
      </div>
    </section>
  );
}

/** Distribution closes the loop: the endpoint has to end up in a client. */
export function Distribution() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xs tabular-nums text-faint">06</span>
              <span className="h-px w-6 bg-[var(--border-strong)]" aria-hidden="true" />
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-accent-text">
                Distribute
              </span>
            </div>
            <h2
              className="mt-5 text-3xl font-semibold text-hi lg:text-5xl"
              style={{
                lineHeight: "1.05",
                letterSpacing: "var(--tracking-display)",
              }}
            >
              Hand it to any client.
            </h2>
            <p className="mt-4 max-w-md text-md leading-relaxed text-muted">
              MCPfy generates the configuration each client actually reads,
              with your endpoint already filled in. No transcribing URLs into
              JSON by hand.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Claude Desktop", "Cursor", "VS Code", "ChatGPT", "CLI"].map(
                (client) => (
                  <Badge key={client} mono>
                    {client}
                  </Badge>
                ),
              )}
            </div>
            <Link
              href="/docs#connect"
              className="mt-6 inline-flex items-center gap-1.5 text-base text-accent-text hover:underline"
            >
              Connection guide
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <CodeBlock
            filename="claude_desktop_config.json"
            code={`{
  "mcpServers": {
    "customer-mcp": {
      "type": "http",
      "url": "https://customer-mcp.mcpfy.app/mcp"
    }
  }
}`}
          />
        </div>
      </div>
    </section>
  );
}
