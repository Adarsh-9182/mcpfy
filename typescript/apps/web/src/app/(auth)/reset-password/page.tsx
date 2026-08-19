import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  /*
   * Better Auth redirects here with ?error=INVALID_TOKEN when a link has
   * expired or been used. Saying so plainly, with the way forward, beats a
   * form that accepts a new password and then refuses it.
   */
  if (!token || error) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hi">
            This link no longer works
          </h1>
          <p className="mt-1.5 text-base leading-relaxed text-muted">
            Reset links expire after an hour and can only be used once. Ask for
            a fresh one and it will work.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="text-base text-accent-text hover:underline"
        >
          Send a new reset link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
