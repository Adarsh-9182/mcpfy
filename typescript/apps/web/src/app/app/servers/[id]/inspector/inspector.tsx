"use client";

import * as React from "react";
import {
  Badge,
  Button,
  SchemaForm,
  Tabs,
  cn,
  defaultsForSchema,
  missingRequired,
  toArguments,
  type JsonSchema,
} from "@mcpfy/ui";

/* ------------------------------------------------------------------ types */

interface Tool {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
}
interface Resource {
  uri: string;
  name: string | null;
  mimeType: string | null;
}
interface Prompt {
  name: string;
  description: string | null;
  arguments: Record<string, unknown>[] | null;
}
interface Environment {
  name: string;
  endpointUrl: string | null;
}

interface Frame {
  seq: number;
  direction: "outgoing" | "incoming";
  at: number;
  method?: string;
  id?: string | number;
  message: unknown;
  bytes: number;
}
interface Exchange {
  method: string;
  id?: string | number;
  request: Frame;
  response?: Frame;
  durationMs?: number;
}
interface InspectResult {
  ok: boolean;
  result?: unknown;
  isToolError?: boolean;
  error?: { code?: number; message: string };
  totalMs: number;
  operationMs?: number;
  serverInfo?: { name?: string; version?: string };
  protocolVersion?: string;
  frames: Frame[];
  exchanges: Exchange[];
}

interface HistoryEntry {
  id: number;
  label: string;
  ok: boolean;
  toolError: boolean;
  ms: number;
  replay: () => void;
}

type Kind = "tools" | "resources" | "prompts";

/* -------------------------------------------------------------- component */

/**
 * §13 — the Inspector.
 *
 * Everything shown here comes back from one round trip to the real server:
 * the result, every JSON-RPC frame that produced it, and the timing of each.
 * Nothing is reconstructed client-side, which is what makes the protocol view
 * trustworthy enough to debug against.
 */
export function Inspector({
  serverId,
  environments,
  defaultEndpoint,
  tools,
  resources,
  prompts,
  canExecute,
  role,
}: {
  serverId: string;
  environments: Environment[];
  defaultEndpoint: string | null;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  canExecute: boolean;
  role: string;
}) {
  const [kind, setKind] = React.useState<Kind>("tools");
  const [selected, setSelected] = React.useState<string | null>(
    tools[0]?.name ?? resources[0]?.uri ?? prompts[0]?.name ?? null,
  );
  const [endpoint, setEndpoint] = React.useState(defaultEndpoint ?? "");
  const [useCustom, setUseCustom] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<InspectResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [view, setView] = React.useState<"result" | "protocol">("result");
  const nextId = React.useRef(1);

  const tool = tools.find((t) => t.name === selected) ?? null;
  const prompt = prompts.find((p) => p.name === selected) ?? null;

  const activeSchema: JsonSchema | null =
    kind === "tools"
      ? ((tool?.inputSchema as JsonSchema | null) ?? null)
      : kind === "prompts"
        ? promptSchema(prompt)
        : null;

  // Reset the form whenever the target changes; carrying arguments across
  // tools produces confusing "unexpected property" errors.
  React.useEffect(() => {
    setValues(defaultsForSchema(activeSchema));
    setFieldErrors({});
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, selected]);

  function select(nextKind: Kind, name: string) {
    setKind(nextKind);
    setSelected(name);
  }

  async function execute(
    method: string,
    payload: Record<string, unknown>,
    label: string,
  ) {
    setRunning(true);
    try {
      const response = await fetch(`/api/v1/servers/${serverId}/inspect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method,
          ...payload,
          ...(useCustom && endpoint ? { endpoint_url: endpoint } : {}),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        const failed: InspectResult = {
          ok: false,
          error: { message: body?.error?.message ?? "The request failed." },
          totalMs: 0,
          frames: [],
          exchanges: [],
        };
        setResult(failed);
        setView("result");
        return failed;
      }

      const data = body.data as InspectResult;
      setResult(data);
      setView("result");

      setHistory((prev) =>
        [
          {
            id: nextId.current++,
            label,
            ok: data.ok,
            toolError: Boolean(data.isToolError),
            ms: data.operationMs ?? data.totalMs,
            replay: () => void execute(method, payload, label),
          },
          ...prev,
        ].slice(0, 12),
      );

      return data;
    } finally {
      setRunning(false);
    }
  }

  function onExecute() {
    if (kind === "tools" && tool) {
      const missing = missingRequired(activeSchema, values);
      const { args, errors } = toArguments(activeSchema, values);
      if (missing.length > 0 || Object.keys(errors).length > 0) {
        setFieldErrors({
          ...Object.fromEntries(missing.map((m) => [m, "Required."])),
          ...errors,
        });
        return;
      }
      setFieldErrors({});
      void execute("tools/call", { name: tool.name, arguments: args }, `${tool.name}()`);
      return;
    }

    if (kind === "resources" && selected) {
      void execute("resources/read", { uri: selected }, selected);
      return;
    }

    if (kind === "prompts" && prompt) {
      const { args, errors } = toArguments(activeSchema, values);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      void execute("prompts/get", { name: prompt.name, arguments: args }, prompt.name);
    }
  }

  const items =
    kind === "tools"
      ? tools.map((t) => ({ key: t.name, label: t.name, detail: t.description }))
      : kind === "resources"
        ? resources.map((r) => ({ key: r.uri, label: r.name ?? r.uri, detail: r.uri }))
        : prompts.map((p) => ({ key: p.name, label: p.name, detail: p.description }));

  const endpointInUse = useCustom ? endpoint : defaultEndpoint;

  return (
    <div className="flex flex-col gap-4">
      <ConnectionBar
        environments={environments}
        defaultEndpoint={defaultEndpoint}
        endpoint={endpoint}
        setEndpoint={setEndpoint}
        useCustom={useCustom}
        setUseCustom={setUseCustom}
        onPing={() => void execute("ping", {}, "ping")}
        onRefresh={() => void execute("tools/list", {}, "tools/list")}
        running={running}
        result={result}
      />

      {!endpointInUse ? (
        <p className="rounded-[var(--radius-lg)] border border-warning-border bg-warning-surface px-4 py-3 text-base text-warning">
          This server has no live endpoint. Deploy it, or tick “Custom
          endpoint” above and point the Inspector at a server you already run.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Capabilities + history */}
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
            <Tabs
              label="Capability"
              className="px-1.5 pt-1"
              value={kind}
              onValueChange={(v) => setKind(v as Kind)}
              items={[
                { value: "tools", label: "Tools", count: tools.length },
                { value: "resources", label: "Res.", count: resources.length },
                { value: "prompts", label: "Pr.", count: prompts.length },
              ]}
            />
            <ul className="max-h-72 overflow-y-auto p-1.5">
              {items.length === 0 ? (
                <li className="px-2 py-3 text-2xs leading-relaxed text-subtle">
                  Nothing discovered. Discovery runs when a deployment passes
                  its health check.
                </li>
              ) : (
                items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => select(kind, item.key)}
                      aria-current={item.key === selected ? "true" : undefined}
                      className={cn(
                        "w-full truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-left font-mono text-sm transition-colors",
                        item.key === selected
                          ? "bg-accent-surface text-accent-text"
                          : "text-muted hover:bg-panel hover:text-fg",
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
            <p className="border-b border-line px-3 py-2 text-2xs font-medium uppercase tracking-wider text-faint">
              History
            </p>
            <ul className="max-h-52 overflow-y-auto p-1.5">
              {history.length === 0 ? (
                <li className="px-2 py-2 text-2xs text-faint">
                  Nothing executed yet.
                </li>
              ) : (
                history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={h.replay}
                      title="Replay this call"
                      className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-left transition-colors hover:bg-panel"
                    >
                      <span
                        className={cn(
                          "font-mono text-2xs",
                          !h.ok
                            ? "text-danger"
                            : h.toolError
                              ? "text-warning"
                              : "text-success",
                        )}
                      >
                        {!h.ok ? "err" : h.toolError ? "!" : "ok"}
                      </span>
                      <span className="truncate font-mono text-2xs text-muted">
                        {h.label}
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
        </div>

        {/* Request */}
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
          {selected ? (
            <>
              <h2 className="break-all font-mono text-base text-hi">{selected}</h2>
              {(tool?.description ?? prompt?.description) ? (
                <p className="mt-1 text-2xs leading-relaxed text-subtle">
                  {tool?.description ?? prompt?.description}
                </p>
              ) : null}

              <p className="mt-4 text-2xs font-medium uppercase tracking-wider text-faint">
                {kind === "resources" ? "Request" : "Arguments"}
              </p>
              <div className="mt-2">
                {kind === "resources" ? (
                  <p className="font-mono text-sm text-muted">
                    resources/read <span className="text-faint">{selected}</span>
                  </p>
                ) : (
                  <SchemaForm
                    idPrefix={`inspector-${kind}`}
                    schema={activeSchema}
                    values={values}
                    onChange={setValues}
                    errors={fieldErrors}
                    emptyLabel={
                      kind === "tools"
                        ? "This tool takes no arguments."
                        : "This prompt takes no arguments."
                    }
                  />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  loading={running}
                  disabled={!canExecute || !endpointInUse}
                  onClick={onExecute}
                >
                  Execute
                </Button>
                {!canExecute ? (
                  <span className="text-2xs text-warning">
                    Your role ({role}) can read schemas but not execute.
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-base text-muted">
              Select a tool, resource or prompt on the left.
            </p>
          )}
        </div>

        {/* Response */}
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
            <Tabs
              label="Response view"
              value={view}
              className="border-0"
              onValueChange={(v) => setView(v as "result" | "protocol")}
              items={[
                { value: "result", label: "Result" },
                {
                  value: "protocol",
                  label: "JSON-RPC",
                  count: result?.exchanges.length,
                },
              ]}
            />
            {result ? (
              <span className="flex shrink-0 items-center gap-2 pr-1 font-mono text-2xs">
                <span
                  className={
                    !result.ok
                      ? "text-danger"
                      : result.isToolError
                        ? "text-warning"
                        : "text-success"
                  }
                >
                  {!result.ok ? "failed" : result.isToolError ? "tool error" : "ok"}
                </span>
                <span className="text-faint">
                  {result.operationMs ?? result.totalMs}ms
                </span>
              </span>
            ) : null}
          </div>

          <div className="p-3">
            {!result ? (
              <p className="py-6 text-center text-2xs leading-relaxed text-subtle">
                Execute something to see the result, every JSON-RPC frame that
                produced it, and how long each one took.
              </p>
            ) : view === "result" ? (
              <ResultView result={result} />
            ) : (
              <ProtocolView exchanges={result.exchanges} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function ConnectionBar({
  environments,
  defaultEndpoint,
  endpoint,
  setEndpoint,
  useCustom,
  setUseCustom,
  onPing,
  onRefresh,
  running,
  result,
}: {
  environments: Environment[];
  defaultEndpoint: string | null;
  endpoint: string;
  setEndpoint: (v: string) => void;
  useCustom: boolean;
  setUseCustom: (v: boolean) => void;
  onPing: () => void;
  onRefresh: () => void;
  running: boolean;
  result: InspectResult | null;
}) {
  const customId = React.useId();

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-medium uppercase tracking-wider text-faint">
            Endpoint
          </p>
          {useCustom ? (
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://your-server.example.com/mcp"
              aria-label="Custom MCP endpoint"
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-line-default bg-raised px-2 py-1 font-mono text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            />
          ) : (
            <p className="mt-1 truncate font-mono text-base text-hi">
              {defaultEndpoint ?? (
                <span className="text-faint">not deployed</span>
              )}
            </p>
          )}
        </div>

        <label
          htmlFor={customId}
          className="flex items-center gap-2 text-2xs text-muted"
        >
          <input
            id={customId}
            type="checkbox"
            checked={useCustom}
            onChange={(e) => setUseCustom(e.target.checked)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Custom endpoint
        </label>

        <div className="flex items-center gap-2">
          <Button size="md" onClick={onPing} loading={running}>
            Ping
          </Button>
          <Button size="md" onClick={onRefresh}>
            tools/list
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {environments.map((env) => (
          <Badge key={env.name} mono tone={env.endpointUrl ? "accent" : "neutral"}>
            {env.name}
          </Badge>
        ))}
        {result?.protocolVersion ? (
          <Badge mono tone="success">
            {result.protocolVersion}
          </Badge>
        ) : null}
        {result?.serverInfo?.name ? (
          <Badge mono>
            {result.serverInfo.name}
            {result.serverInfo.version ? ` ${result.serverInfo.version}` : ""}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function ResultView({ result }: { result: InspectResult }) {
  if (!result.ok) {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-md)] border border-danger-border bg-danger-surface p-3"
      >
        <p className="text-base font-medium text-danger">The call did not complete</p>
        <p className="mt-1 whitespace-pre-wrap text-2xs leading-relaxed text-fg">
          {result.error?.message}
        </p>
        <p className="mt-2 text-2xs text-muted">
          Nothing reached the tool — this is a transport, auth or connection
          problem. The JSON-RPC tab shows how far the exchange got.
        </p>
      </div>
    );
  }

  return (
    <>
      {result.isToolError ? (
        <p className="mb-2 rounded-[var(--radius-md)] border border-warning-border bg-warning-surface px-2.5 py-1.5 text-2xs leading-relaxed text-warning">
          The call succeeded and the tool reported an error. That is a problem
          in the tool, not in the connection.
        </p>
      ) : null}
      <pre className="max-h-[26rem] overflow-auto rounded-[var(--radius-md)] border border-line bg-[var(--bg-sunken)] p-2.5 font-mono text-2xs leading-relaxed text-fg">
        {JSON.stringify(result.result, null, 2)}
      </pre>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs text-faint">
        <span>
          <dt className="inline">connect+op </dt>
          <dd className="inline text-muted">{result.totalMs}ms</dd>
        </span>
        <span>
          <dt className="inline">operation </dt>
          <dd className="inline text-muted">{result.operationMs}ms</dd>
        </span>
        <span>
          <dt className="inline">frames </dt>
          <dd className="inline text-muted">{result.frames.length}</dd>
        </span>
      </dl>
    </>
  );
}

/**
 * §13 raw protocol view — every exchange, in order, expandable.
 *
 * The handshake is shown too. It is the part developers never see and the
 * part that breaks most often when a server is behind a proxy or an auth
 * layer, so hiding it to keep the list tidy would remove the main reason to
 * look at this tab at all.
 */
function ProtocolView({ exchanges }: { exchanges: Exchange[] }) {
  if (exchanges.length === 0) {
    return <p className="py-6 text-center text-2xs text-subtle">No frames recorded.</p>;
  }

  return (
    <ul className="flex max-h-[30rem] flex-col gap-1.5 overflow-y-auto">
      {exchanges.map((exchange, i) => (
        <li key={i}>
          <details className="rounded-[var(--radius-md)] border border-line bg-[var(--bg-sunken)]">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-2.5 py-1.5 font-mono text-2xs">
              <span
                className={cn(
                  exchange.response ? "text-accent-text" : "text-warning",
                )}
              >
                {exchange.request.direction === "outgoing" ? "→" : "←"}
              </span>
              <span className="text-fg">{exchange.method}</span>
              {exchange.id !== undefined ? (
                <span className="text-faint">id {exchange.id}</span>
              ) : (
                <span className="text-faint">notification</span>
              )}
              <span className="ml-auto flex items-center gap-2 text-faint">
                <span>
                  {exchange.request.bytes}
                  {exchange.response ? ` / ${exchange.response.bytes}` : ""} B
                </span>
                {exchange.durationMs !== undefined ? (
                  <span className="text-muted">{exchange.durationMs}ms</span>
                ) : null}
              </span>
            </summary>
            <div className="border-t border-line px-2.5 py-2">
              <p className="text-2xs font-medium uppercase tracking-wider text-faint">
                Request
              </p>
              <pre className="mt-1 overflow-x-auto font-mono text-2xs leading-relaxed text-muted">
                {JSON.stringify(exchange.request.message, null, 2)}
              </pre>
              {exchange.response ? (
                <>
                  <p className="mt-2 text-2xs font-medium uppercase tracking-wider text-faint">
                    Response
                  </p>
                  <pre className="mt-1 overflow-x-auto font-mono text-2xs leading-relaxed text-fg">
                    {JSON.stringify(exchange.response.message, null, 2)}
                  </pre>
                </>
              ) : (
                <p className="mt-2 text-2xs text-warning">
                  No response was recorded for this frame.
                </p>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** MCP prompt arguments are a flat list, not JSON Schema — adapt them. */
function promptSchema(prompt: Prompt | null): JsonSchema | null {
  if (!prompt?.arguments || prompt.arguments.length === 0) return null;
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];

  for (const argument of prompt.arguments) {
    const name = String(argument.name ?? "");
    if (!name) continue;
    properties[name] = {
      type: "string",
      ...(typeof argument.description === "string"
        ? { description: argument.description }
        : {}),
    };
    if (argument.required === true) required.push(name);
  }

  return { type: "object", properties, required };
}
