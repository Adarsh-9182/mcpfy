"use client";

import * as React from "react";
import {
  Badge,
  Button,
  SchemaForm,
  cn,
  defaultsForSchema,
  missingRequired,
  toArguments,
  type JsonSchema,
} from "@mcpfy/ui";

/**
 * §7 — the interactive Inspector demo.
 *
 * The form is rendered by `SchemaForm` from `@mcpfy/ui` — the exact component
 * the product Inspector uses, given the same JSON Schema. Not an imitation of
 * it: the same code. What is simulated is only the transport: instead of a
 * live MCP server there is a local resolver, and the panel says so. Every
 * request/response pair shown is genuinely produced by the code on this page.
 */

interface DemoTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  resolve: (args: Record<string, unknown>) => {
    result: unknown;
    latencyMs: number;
    trace: { label: string; ms: number }[];
  };
}

const TOOLS: DemoTool[] = [
  {
    name: "search_customers",
    description: "Search customers by email domain, name or ID.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search term." },
        limit: { type: "number", description: "Max rows.", default: 2 },
        include_churned: { type: "boolean", default: false },
      },
      required: ["query"],
    },
    resolve: (args) => {
      const limit = Math.max(1, Math.min(Number(args.limit ?? 2), 5));
      const all = [
        { id: "cus_8f31d2", name: "Acme Corp", mrr: 18400, status: "active" },
        { id: "cus_2b90aa", name: "Northwind", mrr: 7300, status: "active" },
        { id: "cus_5c14ef", name: "Globex", mrr: 24100, status: "active" },
        { id: "cus_9a07bd", name: "Initech", mrr: 0, status: "churned" },
      ];
      const q = String(args.query ?? "").toLowerCase();
      const rows = all
        .filter((c) => (args.include_churned ? true : c.status === "active"))
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q))
        .slice(0, limit);
      return {
        result: { customers: rows, total: rows.length },
        latencyMs: 142,
        trace: [
          { label: "Authentication", ms: 4 },
          { label: "MCP gateway", ms: 11 },
          { label: "Tool execution", ms: 46 },
          { label: "Database", ms: 81 },
        ],
      };
    },
  },
  {
    name: "get_customer",
    description: "Fetch a single customer record by ID.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "e.g. cus_8f31d2" },
      },
      required: ["customer_id"],
    },
    resolve: (args) => {
      const id = String(args.customer_id ?? "");
      if (!/^cus_[a-z0-9]{6}$/.test(id)) {
        // A demo that only ever succeeds teaches nothing about the tool.
        throw Object.assign(
          new Error(`No customer with id "${id || "(empty)"}".`),
          { code: -32602 },
        );
      }
      return {
        result: {
          id,
          name: "Acme Corp",
          mrr: 18400,
          seats: 42,
          plan: "enterprise",
        },
        latencyMs: 88,
        trace: [
          { label: "Authentication", ms: 3 },
          { label: "MCP gateway", ms: 9 },
          { label: "Database", ms: 76 },
        ],
      };
    },
  },
  {
    name: "create_ticket",
    description: "Open a support ticket against a customer account.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        subject: { type: "string" },
        severity: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          default: "normal",
        },
      },
      required: ["customer_id", "subject"],
    },
    resolve: (args) => ({
      result: {
        ticket_id: "tkt_4c81e0",
        customer_id: args.customer_id,
        subject: args.subject,
        severity: args.severity ?? "normal",
        status: "open",
      },
      latencyMs: 231,
      trace: [
        { label: "Authentication", ms: 4 },
        { label: "MCP gateway", ms: 12 },
        { label: "Write confirmation", ms: 61 },
        { label: "Database", ms: 154 },
      ],
    }),
  },
];

interface HistoryEntry {
  id: number;
  tool: string;
  ok: boolean;
  status: number;
  ms: number;
  args: Record<string, unknown>;
}

export function InspectorDemo() {
  const [toolName, setToolName] = React.useState(TOOLS[0]!.name);
  const tool = TOOLS.find((t) => t.name === toolName)!;
  const [args, setArgs] = React.useState<Record<string, unknown>>(() =>
    defaultsForSchema(TOOLS[0]!.inputSchema),
  );
  const [response, setResponse] = React.useState<{
    ok: boolean;
    status: number;
    ms: number;
    body: unknown;
    trace: { label: string; ms: number }[];
  } | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [running, setRunning] = React.useState(false);
  const nextId = React.useRef(1);

  function selectTool(name: string) {
    const next = TOOLS.find((t) => t.name === name)!;
    setToolName(name);
    setArgs(defaultsForSchema(next.inputSchema));
    setResponse(null);
  }

  const missing = missingRequired(tool.inputSchema, args);

  function execute(overrideArgs?: Record<string, unknown>) {
    // Coerce the form's strings into the types the schema declares, exactly
    // as the product Inspector does before it puts them on the wire.
    const payload = overrideArgs ?? toArguments(tool.inputSchema, args).args;
    setRunning(true);
    // A short delay so the pending state is legible; nothing is over the wire.
    setTimeout(() => {
      let entry: HistoryEntry;
      try {
        const { result, latencyMs, trace } = tool.resolve(payload);
        setResponse({ ok: true, status: 200, ms: latencyMs, body: result, trace });
        entry = {
          id: nextId.current++,
          tool: tool.name,
          ok: true,
          status: 200,
          ms: latencyMs,
          args: payload,
        };
      } catch (e) {
        const err = e as Error & { code?: number };
        setResponse({
          ok: false,
          status: 400,
          ms: 12,
          body: {
            error: { code: err.code ?? -32603, message: err.message },
          },
          trace: [{ label: "Validation", ms: 12 }],
        });
        entry = {
          id: nextId.current++,
          tool: tool.name,
          ok: false,
          status: 400,
          ms: 12,
          args: payload,
        };
      }
      setHistory((h) => [entry, ...h].slice(0, 6));
      setRunning(false);
    }, 260);
  }

  const rpc = {
    jsonrpc: "2.0",
    id: nextId.current,
    method: "tools/call",
    params: { name: tool.name, arguments: args },
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          <span className="font-mono text-2xs text-fg">customer-mcp</span>
          <Badge mono>streamable http</Badge>
        </div>
        <span className="font-mono text-2xs text-faint">
          Demo environment · runs in your browser
        </span>
      </div>

      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Tools + history */}
        <div className="border-line lg:border-r">
          <p className="px-3 pb-1 pt-3 text-2xs font-medium uppercase tracking-wider text-faint">
            Tools
          </p>
          <ul className="px-1.5 pb-2">
            {TOOLS.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => selectTool(t.name)}
                  aria-current={t.name === toolName ? "true" : undefined}
                  className={cn(
                    "w-full truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-left font-mono text-sm transition-colors",
                    t.name === toolName
                      ? "bg-accent-surface text-accent-text"
                      : "text-muted hover:bg-panel hover:text-fg",
                  )}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>

          <p className="border-t border-line px-3 pb-1 pt-3 text-2xs font-medium uppercase tracking-wider text-faint">
            History
          </p>
          <ul className="px-1.5 pb-3">
            {history.length === 0 ? (
              <li className="px-2 py-1.5 text-2xs text-faint">
                Nothing executed yet.
              </li>
            ) : (
              history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      selectTool(h.tool);
                      setArgs(h.args);
                      execute(h.args);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-left transition-colors hover:bg-panel"
                  >
                    <span
                      className={cn(
                        "font-mono text-2xs",
                        h.ok ? "text-success" : "text-danger",
                      )}
                    >
                      {h.status}
                    </span>
                    <span className="truncate font-mono text-2xs text-muted">
                      {h.tool}
                    </span>
                    <span className="ml-auto font-mono text-2xs text-faint">
                      {h.ms}ms
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Request */}
        <div className="border-t border-line p-4 lg:border-l-0 lg:border-t-0 lg:border-r">
          <h3 className="font-mono text-base text-hi">{tool.name}</h3>
          <p className="mt-1 text-2xs leading-relaxed text-subtle">
            {tool.description}
          </p>

          <p className="mt-4 text-2xs font-medium uppercase tracking-wider text-faint">
            Arguments
          </p>
          <div className="mt-2">
            <SchemaForm
              idPrefix={`demo-${tool.name}`}
              schema={tool.inputSchema}
              values={args}
              onChange={setArgs}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              loading={running}
              disabled={missing.length > 0}
              onClick={() => execute()}
            >
              Execute
            </Button>
            <span className="font-mono text-2xs text-faint">
              {missing.length > 0
                ? `${missing.join(", ")} required`
                : "schema valid"}
            </span>
          </div>

          <p className="mt-4 text-2xs font-medium uppercase tracking-wider text-faint">
            JSON-RPC
          </p>
          <pre className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-[var(--bg-sunken)] p-2.5 font-mono text-2xs leading-relaxed text-muted">
            {JSON.stringify(rpc, null, 2)}
          </pre>
        </div>

        {/* Response */}
        <div className="border-t border-line p-4 lg:border-t-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-medium uppercase tracking-wider text-faint">
              Response
            </p>
            {response ? (
              <span className="flex items-center gap-2 font-mono text-2xs">
                <span className={response.ok ? "text-success" : "text-danger"}>
                  {response.status}
                </span>
                <span className="text-faint">{response.ms}ms</span>
              </span>
            ) : null}
          </div>

          {response ? (
            <>
              <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-md)] border border-line bg-[var(--bg-sunken)] p-2.5 font-mono text-2xs leading-relaxed text-fg">
                {JSON.stringify(response.body, null, 2)}
              </pre>

              <p className="mt-4 text-2xs font-medium uppercase tracking-wider text-faint">
                Trace
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {response.trace.map((span) => {
                  const total = response.trace.reduce((a, b) => a + b.ms, 0);
                  return (
                    <li key={span.label} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-2xs text-muted">
                        {span.label}
                      </span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-panel">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${(span.ms / total) * 100}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-2xs text-faint">
                        {span.ms}ms
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-6 text-2xs leading-relaxed text-subtle">
              Execute a tool to see the result, the JSON-RPC exchange and the
              span breakdown underneath it.
              <br />
              <br />
              Try <code className="font-mono text-muted">get_customer</code> with
              an invalid id to see how errors surface.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
