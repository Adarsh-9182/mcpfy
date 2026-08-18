"use client";

import { useActionState } from "react";
import { Button } from "@mcpfy/ui";
import { cancelDeploymentAction } from "../../actions";

export function CancelButton({
  serverId,
  deploymentId,
}: {
  serverId: string;
  deploymentId: string;
}) {
  const [state, action, pending] = useActionState(cancelDeploymentAction, {});

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="serverId" value={serverId} />
      <input type="hidden" name="deploymentId" value={deploymentId} />
      <Button type="submit" variant="danger" size="md" loading={pending}>
        Cancel deployment
      </Button>
      {state.error ? (
        <p role="alert" className="text-2xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
