import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { THEME_SCRIPT } from "@/components/theme-toggle";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** §46 — technical SEO is part of the build, not a later pass. */
export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "MCPfy — Build, deploy and observe MCP servers",
    template: "%s · MCPfy",
  },
  description:
    "MCPfy is the developer platform for Model Context Protocol servers: deploy from GitHub, inspect protocol traffic, replay agent sessions, and run evaluations against every deployment.",
  keywords: [
    "MCP server hosting",
    "MCP server deployment",
    "MCP inspector",
    "MCP observability",
    "Model Context Protocol",
    "MCP server marketplace",
  ],
  openGraph: {
    type: "website",
    siteName: "MCPfy",
    url: APP_URL,
    title: "MCPfy — Build, deploy and observe MCP servers",
    description:
      "Deploy MCP servers from GitHub, inspect every JSON-RPC exchange, replay agent sessions and catch regressions before your users do.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>
        {/*
          Stamps data-theme from localStorage before the first paint.
          beforeInteractive puts it in the head as a blocking script — without
          it, a reader who chose dark gets a white flash on every load. The
          content is a constant in this repo, never user input.
        */}
        <Script id="mcpfy-theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
