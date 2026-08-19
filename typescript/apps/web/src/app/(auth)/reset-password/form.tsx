"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Description, Field, Input, Label } from "@mcpfy/ui";
import { authClient } from "@/lib/auth-client";

const MIN_LENGTH = 12;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    if (password.length < MIN_LENGTH) {
      setFieldError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    // Checked here rather than after submission: a mistyped confirmation
    // should not consume the single-use token.
    if (password !== confirm) {
      setFieldError("The two passwords do not match.");
      return;
    }

    setPending(true);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);

    if (result.error) {
      setError(
        result.error.message ??
          "That link could not be used. Ask for a fresh one.",
      );
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hi">
            Password changed
          </h1>
          <p className="mt-1.5 text-base leading-relaxed text-muted">
            Every other session was signed out, so anyone using the old
            password has been logged out too.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            router.push("/login");
            router.refresh();
          }}
        >
          Log in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hi">
          Choose a new password
        </h1>
        <p className="mt-1.5 text-base leading-relaxed text-muted">
          This link works once.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field error={fieldError}>
          <Label hint={`${MIN_LENGTH} characters minimum`}>New password</Label>
          <Input name="password" type="password" autoComplete="new-password" autoFocus />
          <Description>
            Stored as a salted hash. We never see or email your password.
          </Description>
        </Field>

        <Field>
          <Label>Confirm</Label>
          <Input name="confirm" type="password" autoComplete="new-password" />
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-danger-border bg-danger-surface px-3 py-2 text-base text-danger"
          >
            {error}{" "}
            <Link href="/forgot-password" className="underline underline-offset-2">
              Send a new link
            </Link>
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={pending}>
          Change password
        </Button>
      </form>
    </div>
  );
}
