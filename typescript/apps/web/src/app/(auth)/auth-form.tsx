"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { Button, Description, Field, Input, Label } from "@mcpfy/ui";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup";

/**
 * §35 — errors say what happened. Better Auth returns a machine code plus a
 * message; we map the codes we can act on to copy that tells the reader what
 * to do next, and fall through to the server's message rather than replacing
 * it with "Something went wrong".
 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD:
    "That email and password combination does not match an account.",
  USER_ALREADY_EXISTS:
    "An account already exists for this email. Log in instead, or use a different address.",
  PASSWORD_TOO_SHORT: "Passwords must be at least 12 characters.",
};

export function AuthForm({
  mode,
  githubEnabled,
  next,
}: {
  mode: Mode;
  githubEnabled: boolean;
  next?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<"name" | "email" | "password", string>>
  >({});

  // Only same-origin paths are accepted, so a crafted ?next= cannot be used
  // as an open redirect to another host.
  const destination = (
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/app"
  ) as Route;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    const nextFieldErrors: typeof fieldErrors = {};
    if (!email.includes("@")) nextFieldErrors.email = "Enter a valid email address.";
    if (mode === "signup" && password.length < 12)
      nextFieldErrors.password = "Use at least 12 characters.";
    if (mode === "signup" && name.length < 1)
      nextFieldErrors.name = "Tell us what to call you.";
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setPending(true);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      const code = result.error.code ?? "";
      setError(MESSAGES[code] ?? result.error.message ?? "Sign in failed.");
      setPending(false);
      return;
    }

    // A brand-new account has no organization yet; /app sends it to onboarding.
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hi">
          {mode === "signup" ? "Create your account" : "Log in to MCPfy"}
        </h1>
        <p className="mt-1.5 text-base text-muted">
          {mode === "signup"
            ? "Deploy your first MCP server in a few minutes."
            : "Welcome back."}
        </p>
      </div>

      {githubEnabled ? (
        <>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() =>
              authClient.signIn.social({
                provider: "github",
                callbackURL: destination,
              })
            }
          >
            Continue with GitHub
          </Button>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
            <span className="text-2xs text-faint">or</span>
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>
        </>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {mode === "signup" ? (
          <Field error={fieldErrors.name}>
            <Label>Name</Label>
            <Input name="name" autoComplete="name" placeholder="Ada Lovelace" />
          </Field>
        ) : null}

        <Field error={fieldErrors.email}>
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
          />
        </Field>

        <Field error={fieldErrors.password}>
          <Label
            hint={
              mode === "login" ? undefined : "12 characters minimum"
            }
          >
            Password
          </Label>
          <Input
            name="password"
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
          {mode === "signup" ? (
            <Description>
              Stored as a salted hash. We never see or email your password.
            </Description>
          ) : null}
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-danger-border bg-danger-surface px-3 py-2 text-base text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {mode === "signup" ? "Create account" : "Log in"}
        </Button>
      </form>

      <p className="text-center text-base text-muted">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-accent-text hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/signup" className="text-accent-text hover:underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
