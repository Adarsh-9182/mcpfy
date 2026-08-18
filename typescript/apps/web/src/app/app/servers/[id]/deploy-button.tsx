"use client";

import { useActionState } from "react";
import { Button, Tooltip } from "@mcpfy/ui";
import { deployServerAction } from "../actions";

/**
 * §48 — a server with no repository has nothing to build, so the button is
 * disabled and explains itself rather than failing on click.
 */
export function DeployButton({
  serverId,
  connected,
  environment = "production",
}: {
  serverId: string;
  connected: boolean;
  environment?: string;
}) {
  const [state, action, pending] = useActionState(deployServerAction, {});

  if (!connected) {
    return (
      <Tooltip label="Connect a repository to deploy this server">
        <Button variant="primary" size="md" disabled>
          Deploy
        </Button>
      </Tooltip>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="serverId" value={serverId} />
      <input type="hidden" name="environment" value={environment} />
      <Button type="submit" variant="primary" size="md" loading={pending}>
        Deploy
      </Button>
      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-2xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
