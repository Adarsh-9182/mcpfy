"use client";

import * as React from "react";
import { Badge, CodeBlock, Tabs } from "@mcpfy/ui";

/**
 * §Distribution — generate the client configuration instead of making the
 * developer hand-write it. Each snippet is the actual file that client reads,
 * with this server's endpoint substituted in.
 */

const CLIENTS = [
  { value: "claude", label: "Claude Desktop" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code" },
  { value: "cli", label: "CLI" },
] as const;

type Client = (typeof CLIENTS)[number]["value"];

function snippetFor(client: Client, name: string, endpoint: string) {
  switch (client) {
    case "claude":
      return {
        filename: "claude_desktop_config.json",
        code: JSON.stringify(
          { mcpServers: { [name]: { type: "http", url: endpoint } } },
          null,
          2,
        ),
      };
    case "cursor":
      return {
        filename: ".cursor/mcp.json",
        code: JSON.stringify(
          { mcpServers: { [name]: { url: endpoint } } },
          null,
          2,
        ),
      };
    case "vscode":
      return {
        filename: ".vscode/mcp.json",
        code: JSON.stringify(
          { servers: { [name]: { type: "http", url: endpoint } } },
          null,
          2,
        ),
      };
    case "cli":
      return {
        filename: "terminal",
        code: `npx mcpfy-proxy --url ${endpoint}`,
      };
  }
}

export function ConnectPanel({
  serverName,
  endpoint,
}: {
  serverName: string;
  endpoint: string | null;
}) {
  const [client, setClient] = React.useState<Client>("claude");

  if (!endpoint) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-medium text-hi">MCP endpoint</span>
          <Badge tone="warning">Not available</Badge>
        </div>
        <p className="mt-1.5 text-2xs leading-relaxed text-muted">
          This server has no production endpoint yet. Connect one when you
          create the server, or deploy into it — client configuration appears
          here as soon as there is a URL to point at.
        </p>
      </div>
    );
  }

  const snippet = snippetFor(client, serverName, endpoint);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-2xs font-medium uppercase tracking-wider text-faint">
            MCP endpoint
          </p>
          <p className="mt-1 truncate font-mono text-base text-hi">{endpoint}</p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <Tabs
          label="MCP client"
          items={CLIENTS.map((c) => ({ value: c.value, label: c.label }))}
          value={client}
          onValueChange={(v) => setClient(v as Client)}
        />
      </div>

      <div className="p-4">
        <CodeBlock code={snippet.code} filename={snippet.filename} />
      </div>
    </div>
  );
}
