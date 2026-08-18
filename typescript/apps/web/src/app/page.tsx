import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Hero } from "@/components/marketing/hero";
import {
  Architecture,
  Capabilities,
  CallToAction,
  Inspector,
  OpenSource,
  Security,
} from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "MCPfy — Build, deploy and observe MCP servers",
  alternates: { canonical: "/" },
};

/** §46 — structured data so the platform is indexable as software, not prose. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MCPfy",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description:
    "Developer platform for Model Context Protocol servers: deploy from GitHub, inspect protocol traffic, replay agent sessions and run evaluations.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default async function HomePage() {
  const viewer = await getViewer();

  return (
    <>
      <script
        type="application/ld+json"
        // Static object literal defined above; no user input reaches this.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <SiteHeader signedIn={Boolean(viewer)} />
      <main id="main">
        <Hero />
        <Architecture />
        <Inspector />
        <Capabilities />
        <Security />
        <OpenSource />
        <CallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
