import { cn } from "@mcpfy/ui";

/**
 * What you would otherwise assemble yourself.
 *
 * Deliberately compares against *doing it manually*, not against a named
 * competitor. A comparison table aimed at another product ages into a lie the
 * moment they ship; the work itself does not change.
 */
const ROWS = [
  {
    task: "Getting a server on the internet",
    manual: "Dockerfile, registry, host, TLS, a process manager",
    mcpfy: "Point at a repository",
  },
  {
    task: "Knowing it actually works",
    manual: "curl the port and hope the handshake would succeed",
    mcpfy: "A real MCP handshake gates every deployment",
  },
  {
    task: "Finding out what it exposes",
    manual: "Read the source, keep a wiki page in sync",
    mcpfy: "Tools, resources and prompts recorded on every deploy",
  },
  {
    task: "Debugging a failing tool call",
    manual: "Add logging, redeploy, reproduce, repeat",
    mcpfy: "Execute it and read the JSON-RPC exchange",
  },
  {
    task: "Seeing who calls what",
    manual: "Wire up tracing and a metrics backend yourself",
    mcpfy: "Every request traced through the gateway",
  },
  {
    task: "Handing it to a teammate",
    manual: "Paste a URL into Slack and explain the JSON shape",
    mcpfy: "Generated config for their client",
  },
] as const;

export function Comparison() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <h2
            className="text-3xl font-semibold text-hi lg:text-4xl"
            style={{ lineHeight: "1.08", letterSpacing: "var(--tracking-display)" }}
          >
            The part nobody wants to build.
          </h2>
          <p className="mt-3 text-md leading-relaxed text-muted">
            None of this is hard, exactly. It is just six weeks you did not
            plan to spend on infrastructure instead of on your tools.
          </p>
        </div>

        <div className="mt-9 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-[var(--edge-highlight)]">
          <table className="w-full text-base">
            <caption className="sr-only">
              Building MCP infrastructure yourself compared with using MCPfy
            </caption>
            <thead>
              <tr className="border-b border-line bg-panel">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-2xs font-medium uppercase tracking-wider text-subtle sm:px-5"
                >
                  Task
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-2xs font-medium uppercase tracking-wider text-subtle sm:px-5"
                >
                  On your own
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-2xs font-medium uppercase tracking-wider text-accent-text sm:px-5"
                >
                  With MCPfy
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.task}
                  className={cn(
                    "border-b border-line last:border-0",
                    i % 2 === 1 && "bg-[color-mix(in_oklab,var(--bg-panel)_45%,transparent)]",
                  )}
                >
                  <th
                    scope="row"
                    className="px-4 py-3.5 text-left font-medium text-hi sm:px-5"
                  >
                    {row.task}
                  </th>
                  <td className="px-4 py-3.5 text-muted sm:px-5">{row.manual}</td>
                  <td className="px-4 py-3.5 text-fg sm:px-5">
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-[0.35rem] size-1.5 shrink-0 rounded-full bg-success"
                      />
                      {row.mcpfy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
