import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getViewer } from "@/lib/session";
import { OnboardingForm } from "./form";
import { Wordmark } from "@/components/marketing/logo";

export const metadata: Metadata = { title: "Create your organization" };

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  // Already a member of something — nothing to do here.
  if (await getViewer()) redirect("/app");

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="border-b border-line">
        <div className="mx-auto flex h-15 max-w-[1240px] items-center px-6 lg:px-8">
          <Wordmark />
        </div>
      </header>
      <main
        id="main"
        className="flex flex-1 items-center justify-center px-6 py-12"
      >
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight text-hi">
            Create your organization
          </h1>
          <p className="mt-1.5 text-base leading-relaxed text-muted">
            Servers, deployments, secrets and analytics all belong to an
            organization. You can invite teammates once it exists.
          </p>
          <div className="mt-6">
            <OnboardingForm defaultName={suggestName(session.user)} />
          </div>
        </div>
      </main>
    </div>
  );
}

function suggestName(user: { name?: string | null; email: string }): string {
  const domain = user.email.split("@")[1] ?? "";
  const generic = [
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "proton.me",
    "yahoo.com",
  ];
  if (domain && !generic.includes(domain)) {
    const label = domain.split(".")[0] ?? "";
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const first = user.name?.split(" ")[0];
  return first ? `${first}'s workspace` : "";
}
