"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Badge,
  Button,
  Description,
  Field,
  Input,
  Label,
  Select,
  cn,
} from "@mcpfy/ui";
import { createServerAction, type CreateServerState } from "../actions";

type Source = "url" | "cli" | "github";

const SOURCES: {
  id: Source;
  title: string;
  body: string;
  available: boolean;
  unavailableReason?: string;
}[] = [
  {
    id: "url",
    title: "Connect an endpoint",
    body: "Point MCPfy at an MCP server you already run. Traffic routes through the gateway so you get auth, logs and traces.",
    available: true,
  },
  {
    id: "cli",
    title: "Empty server",
    body: "Create the record now and push code later with `mcpfy deploy`.",
    available: true,
  },
  {
    id: "github",
    title: "Import from GitHub",
    body: "Detect the framework, build on every push and get a preview endpoint per branch.",
    available: false,
    unavailableReason:
      "The build and deploy pipeline is not live yet. Connecting a repository would create a server that can never deploy, so the option is disabled rather than misleading.",
  },
];

export function CreateServerForm({ githubReady }: { githubReady: boolean }) {
  const [source, setSource] = React.useState<Source>("url");
  const [state, action, pending] = useActionState<CreateServerState, FormData>(
    createServerAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-xs font-medium text-muted">Source</legend>
        <div className="mt-2 flex flex-col gap-2">
          {SOURCES.map((option) => {
            const disabled = !option.available;
            const selected = source === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[var(--radius-lg)] border p-3.5 transition-colors",
                  disabled && "cursor-not-allowed opacity-60",
                  selected && !disabled
                    ? "border-accent bg-accent-surface"
                    : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="source"
                  value={option.id}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setSource(option.id)}
                  className="mt-1 size-3.5 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-hi">
                      {option.title}
                    </span>
                    {disabled ? <Badge tone="warning">Phase 2</Badge> : null}
                    {option.id === "github" && !githubReady ? (
                      <Badge>OAuth not configured</Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-2xs leading-relaxed text-muted">
                    {option.body}
                  </span>
                  {disabled ? (
                    <span className="mt-1.5 block text-2xs leading-relaxed text-subtle">
                      {option.unavailableReason}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field error={state.fieldErrors?.name}>
        <Label>Server name</Label>
        <Input name="name" placeholder="customer-mcp" autoFocus />
        <Description>
          Used for the URL slug and shown in client configuration.
        </Description>
      </Field>

      {source === "url" ? (
        <>
          <Field error={state.fieldErrors?.endpointUrl}>
            <Label>MCP endpoint</Label>
            <Input
              name="endpointUrl"
              mono
              placeholder="https://customer-mcp.example.com/mcp"
            />
            <Description>
              Must be publicly reachable over HTTPS. Private and link-local
              addresses are rejected.
            </Description>
          </Field>

          <Field>
            <Label>Transport</Label>
            <Select name="transport" defaultValue="streamable_http">
              <option value="streamable_http">Streamable HTTP</option>
              <option value="sse">Server-sent events</option>
            </Select>
          </Field>
        </>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-danger-border bg-danger-surface px-3 py-2 text-base text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          Create server
        </Button>
        <span className="text-2xs text-faint">
          Tool discovery runs after the first successful connection.
        </span>
      </div>
    </form>
  );
}
