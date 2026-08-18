"use client";

import { useActionState } from "react";
import { Button, Description, Field, Input, Label } from "@mcpfy/ui";
import { createOrganizationAction, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    createOrganizationAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field error={state.error}>
        <Label>Organization name</Label>
        <Input
          name="name"
          defaultValue={defaultName}
          placeholder="Acme"
          autoFocus
        />
        <Description>
          You can rename it later. The URL slug is generated from this name.
        </Description>
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Create organization
      </Button>
    </form>
  );
}
