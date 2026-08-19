import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { githubConfigured, googleConfigured } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getViewer()) redirect("/app");
  const { next } = await searchParams;
  return <AuthForm
      mode="login"
      githubEnabled={githubConfigured}
      googleEnabled={googleConfigured}
      next={next}
    />;
}
