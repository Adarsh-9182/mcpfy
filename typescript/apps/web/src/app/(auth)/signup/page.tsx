import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth-form";
import { githubConfigured } from "@/lib/env";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getViewer()) redirect("/app");
  const { next } = await searchParams;
  return <AuthForm mode="signup" githubEnabled={githubConfigured} next={next} />;
}
