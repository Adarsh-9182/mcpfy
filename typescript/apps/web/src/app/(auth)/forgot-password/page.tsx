import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { emailTransport } from "@/lib/email";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  if (await getViewer()) redirect("/app");

  return (
    <ForgotPasswordForm
      // In development the link is printed to the server log instead of
      // being sent. Telling the developer that is the difference between a
      // testable flow and one that looks broken.
      devTransport={
        emailTransport() === "console" && process.env.NODE_ENV !== "production"
      }
    />
  );
}
