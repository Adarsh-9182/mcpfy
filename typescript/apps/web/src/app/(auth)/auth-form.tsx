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
  googleEnabled,
  next,
}: {
  mode: Mode;
  githubEnabled: boolean;
  googleEnabled: boolean;
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

      {githubEnabled || googleEnabled ? (
        <>
          <div className="flex flex-col gap-2">
            {githubEnabled ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                icon={<GitHubMark />}
                onClick={() =>
                  authClient.signIn.social({
                    provider: "github",
                    callbackURL: destination,
                  })
                }
              >
                Continue with GitHub
              </Button>
            ) : null}
            {googleEnabled ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                icon={<GoogleMark />}
                onClick={() =>
                  authClient.signIn.social({
                    provider: "google",
                    callbackURL: destination,
                  })
                }
              >
                Continue with Google
              </Button>
            ) : null}
          </div>
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
              mode === "login" ? (
                <Link
                  href="/forgot-password"
                  className="text-accent-text hover:underline"
                >
                  Forgot?
                </Link>
              ) : (
                "12 characters minimum"
              )
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


/* Marks are inline so the buttons carry no external asset and no icon font. */

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
