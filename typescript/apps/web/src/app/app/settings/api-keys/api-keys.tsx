"use client";

import * as React from "react";
import { useActionState } from "react";
import { Badge, Button, CodeBlock, Field, Input, Label, cn } from "@mcpfy/ui";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeys({
  keys,
  canManage,
  role,
  formOnly = false,
}: {
  keys: KeyRow[];
  canManage: boolean;
  role: string;
  formOnly?: boolean;
}) {
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof createApiKeyAction>>,
    FormData
  >(createApiKeyAction, {});

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <form
          action={action}
          className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        >
          <Field error={state.error} className="min-w-56 flex-1">
            <Label>New key name</Label>
            <Input name="name" placeholder="Claude Desktop — laptop" />
          </Field>
          <Button type="submit" variant="primary" size="md" loading={pending}>
            Create key
          </Button>
        </form>
      ) : null}

      {/*
        Shown once and never again. Making this loud is not decoration: a user
        who scrolls past it has permanently lost the value, and their only
        recourse is to create another key.
      */}
      {state.plaintext ? (
        <div className="rounded-[var(--radius-lg)] border border-accent-border bg-accent-surface p-4">
          <p className="text-base font-medium text-hi">
            Copy “{state.name}” now
          </p>
          <p className="mt-1 text-2xs leading-relaxed text-muted">
            This is the only time it will be shown. MCPfy stores a hash, so it
            cannot be recovered — if you lose it, revoke it and create another.
          </p>
          <CodeBlock className="mt-3" code={state.plaintext} language="text" />
        </div>
      ) : null}

      {formOnly ? null : <KeyTable keys={keys} canManage={canManage} role={role} />}
    </div>
  );
}

function KeyTable({
  keys,
  canManage,
}: {
  keys: KeyRow[];
  canManage: boolean;
  role: string;
}) {
  if (keys.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
      <table className="w-full text-base">
        <caption className="sr-only">API keys for this organization</caption>
        <thead>
          <tr className="border-b border-line">
            {["Name", "Key", "Created", "Last used", ""].map((header, i) => (
              <th
                key={header || i}
                scope="col"
                className="px-4 py-2.5 text-left text-2xs font-medium uppercase tracking-wider text-subtle"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr
              key={key.id}
              className={cn(
                "border-b border-line last:border-0",
                key.revokedAt && "opacity-50",
              )}
            >
              <td className="px-4 py-3 text-hi">
                <span className="flex items-center gap-2">
                  {key.name}
                  {key.revokedAt ? <Badge tone="danger">revoked</Badge> : null}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-sm text-muted">
                {key.prefix}…
              </td>
              <td className="px-4 py-3 font-mono text-2xs text-faint">
                {key.createdAt.slice(0, 10)}
              </td>
              <td className="px-4 py-3 font-mono text-2xs text-faint">
                {key.lastUsedAt ? key.lastUsedAt.slice(0, 10) : "never"}
              </td>
              <td className="px-4 py-3 text-right">
                {canManage && !key.revokedAt ? <RevokeButton id={key.id} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(revokeApiKeyAction, {});
  const [confirming, setConfirming] = React.useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-[var(--radius-xs)] px-2 py-1 font-mono text-2xs text-subtle transition-colors hover:text-danger"
      >
        revoke
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      {/* Revoking breaks whatever is using the key, so it asks first. */}
      <span className="text-2xs text-muted">Break clients using it?</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-[var(--radius-xs)] px-2 py-1 font-mono text-2xs text-subtle hover:text-fg"
      >
        cancel
      </button>
      <Button type="submit" variant="danger" size="sm" loading={pending}>
        Revoke
      </Button>
      {state.error ? (
        <span className="text-2xs text-danger">{state.error}</span>
      ) : null}
    </form>
  );
}
