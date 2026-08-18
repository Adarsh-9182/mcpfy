import type { Metadata } from "next";
import { Badge, Button } from "@mcpfy/ui";

export const metadata: Metadata = {
  title: "Open source",
  description:
    "MCPfy's SDK, scaffolder and telemetry packages are MIT licensed and developed in public.",
  alternates: { canonical: "/open-source" },
};

const PACKAGES = [
  {
    name: "mcpfy-sdk",
    version: "0.2.3",
    blurb:
      "Build and consume MCP tools, prompts, resources and UI widgets. HTTP and stdio transports, with full access to the official SDK underneath.",
    npm: "https://www.npmjs.com/package/mcpfy-sdk",
  },
  {
    name: "create-mcpfy-app",
    version: "0.2.2",
    blurb:
      "Scaffold a working MCP server — one tool, one prompt, one resource, TypeScript configured — with a single command.",
    npm: "https://www.npmjs.com/package/create-mcpfy-app",
  },
  {
    name: "mcpfy-pulse",
    version: "0.1.2",
    blurb:
      "Telemetry for any MCP server. Wrap a transport or proxy a command over stdio to capture method, size, duration and outcome. Argument values are never transmitted.",
    npm: "https://www.npmjs.com/package/mcpfy-pulse",
  },
] as const;

export default function OpenSourcePage() {
  return (
    <article>
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent-text">
        Open source
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-hi">
        MCPfy is built in the open.
      </h1>
      <p className="mt-3 max-w-2xl text-md leading-relaxed text-muted">
        The pieces that run inside your process — the SDK, the scaffolder, the
        telemetry proxy — are MIT licensed and developed in public. You should
        be able to read, fork and audit anything you are asked to import.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <a href="https://github.com/mcpfyy/mcpfy">
          <Button variant="primary" size="lg">
            Star on GitHub
          </Button>
        </a>
        <a href="https://github.com/mcpfyy/mcpfy/blob/main/CONTRIBUTING.md">
          <Button variant="secondary" size="lg">
            Contributing guide
          </Button>
        </a>
      </div>

      <h2 className="mt-14 text-xl font-semibold tracking-tight text-hi">
        Packages
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {PACKAGES.map((pkg) => (
          <li
            key={pkg.name}
            className="rounded-[var(--radius-lg)] border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={pkg.npm}
                className="font-mono text-base text-hi hover:text-accent-text"
              >
                {pkg.name}
              </a>
              <Badge mono>v{pkg.version}</Badge>
              <Badge tone="success">MIT</Badge>
            </div>
            <p className="mt-2 text-base leading-relaxed text-muted">
              {pkg.blurb}
            </p>
          </li>
        ))}
      </ul>

      <h2 className="mt-14 text-xl font-semibold tracking-tight text-hi">
        Where the line sits
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        The SDK, CLI and inspector components are open source. The hosted
        control plane — the gateway, the deployment engine, the analytics store
        and the billing system — is not. If a package runs on your machine, you
        can read it; if it runs on ours, you pay for it. That is the whole rule.
      </p>

      <h2 className="mt-14 text-xl font-semibold tracking-tight text-hi">
        Contributing
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        The roadmap grows from real requests rather than an internal backlog.
        Open an issue for anything missing, or start with the contributing
        guide for the pull-request workflow.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {[
          { label: "Issues", href: "https://github.com/mcpfyy/mcpfy/issues" },
          {
            label: "Roadmap",
            href: "https://github.com/mcpfyy/mcpfy/blob/main/ROADMAP.md",
          },
          {
            label: "Contributing",
            href: "https://github.com/mcpfyy/mcpfy/blob/main/CONTRIBUTING.md",
          },
        ].map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-flex items-center rounded-[var(--radius-sm)] border border-line-default bg-panel px-2.5 py-1.5 text-base text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {link.label} →
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
