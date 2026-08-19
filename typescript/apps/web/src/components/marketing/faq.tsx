const QUESTIONS = [
  {
    q: "Do I have to use the mcpfy SDK?",
    a: "No. MCPfy deploys any MCP server that speaks the protocol over HTTP — the official TypeScript and Python SDKs, FastMCP, mcp-use, or something you wrote yourself. Detection recognises the common frameworks to fill in build commands for you, and you can override every one of them.",
  },
  {
    q: "What does “live” actually mean?",
    a: "That a real MCP client connected to your server, completed the initialize handshake, and listed its tools. A deployment that starts a process but cannot be spoken to is marked failed, not live. Health is then re-verified rather than assumed, and every status shows when it was last checked.",
  },
  {
    q: "Is the SDK open source?",
    a: "Yes, MIT. mcpfy-sdk, create-mcpfy-app and mcpfy-pulse are developed in public and work standalone — you do not need an account to use any of them. The hosted control plane is what you pay for; the primitives that run inside your own process are yours.",
  },
  {
    q: "Where does my code run?",
    a: "MCPfy clones your repository and runs the build and start commands it detected. Self-hosted installs run those on your own machine. Multi-tenant hosting requires a sandboxed container runtime, which is why the local runtime refuses to start unless you explicitly enable it.",
  },
  {
    q: "What happens to my secrets?",
    a: "They are sealed with AES-256-GCM under a key held only in the server environment, injected into your process at start, and never returned to the browser. The dashboard shows a masked preview; every change is written to the audit log without the value.",
  },
  {
    q: "Can I point it at a server I already run?",
    a: "Yes. Connect an existing endpoint and MCPfy will inspect it, record its tools, and generate client configuration without deploying anything. Private and link-local addresses are rejected, including hostnames that resolve to them.",
  },
] as const;

/**
 * Native <details> rather than a scripted accordion: it is open-by-keyboard,
 * findable by in-page search, and works before hydration. An FAQ that a
 * reader cannot Ctrl-F through is worse than no FAQ.
 */
export function Faq() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-6 py-16 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:px-8 lg:py-20">
        <div>
          <h2
            className="text-3xl font-semibold text-hi lg:text-4xl"
            style={{ lineHeight: "1.08", letterSpacing: "var(--tracking-display)" }}
          >
            Questions worth
            <br />
            asking first.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Still unclear on something?{" "}
            <a
              href="https://github.com/mcpfyy/mcpfy/issues"
              className="text-accent-text hover:underline"
            >
              Open an issue
            </a>{" "}
            — the answers end up here.
          </p>
        </div>

        <div className="divide-y divide-[var(--border-subtle)] border-y border-line">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer items-start justify-between gap-4 py-4 text-md font-medium text-hi marker:content-none [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-faint transition-transform duration-200 group-open:rotate-45"
                >
                  <svg viewBox="0 0 12 12" className="size-3">
                    <path
                      d="M6 1v10M1 6h10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-base leading-relaxed text-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
