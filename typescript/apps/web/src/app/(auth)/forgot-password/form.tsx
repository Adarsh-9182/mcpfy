"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Description, Field, Input, Label } from "@mcpfy/ui";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm({ devTransport }: { devTransport: boolean }) {
  const [sent, setSent] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setPending(true);
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "The request could not be sent.");
      return;
    }

    setSent(email);
  }

  /*
   * The confirmation is deliberately the same whether or not the address is
   * registered. Saying "no account with that email" turns this form into a
   * way to test which addresses have accounts here.
   */
  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hi">
            Check your email
          </h1>
          <p className="mt-1.5 text-base leading-relaxed text-muted">
            If an account exists for{" "}
            <span className="font-mono text-fg">{sent}</span>, a reset link is
            on its way. It expires in an hour.
          </p>
        </div>

        {devTransport ? (
          <p className="rounded-[var(--radius-md)] border border-warning-border bg-warning-surface px-3 py-2.5 text-2xs leading-relaxed text-warning">
            No email provider is configured, so nothing was actually sent — the
            link was printed to the server log instead. Look in the terminal
            running <code className="font-mono">pnpm dev</code>.
          </p>
        ) : null}

        <Link href="/login" className="text-base text-accent-text hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hi">
          Reset your password
        </h1>
        <p className="mt-1.5 text-base leading-relaxed text-muted">
          We will email you a link to choose a new one.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field error={error}>
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            autoFocus
          />
          <Description>
            The address you signed up with. Accounts created through GitHub or
            Google have no password — sign in that way instead.
          </Description>
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending}>
          Send reset link
        </Button>
      </form>

      <p className="text-center text-base text-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-accent-text hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
