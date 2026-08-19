import type { Metadata } from "next";
import Link from "next/link";
import { Badge, CodeBlock } from "@mcpfy/ui";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Build an MCP server with mcpfy-sdk, add telemetry with mcpfy-pulse, and connect it to Claude, Cursor or VS Code.",
  alternates: { canonical: "/docs" },
};

/**
 * Every snippet here is checked against the published packages. §31's full
 * documentation site (search, language tabs, API reference) is a later phase;
 * this page covers what actually ships today rather than sketching an outline
 * of pages that do not exist.
 */

const SERVER = `import { MCPServer, text } from "mcpfy-sdk/server";

const server = new MCPServer({
  name: "customer-mcp",
  version: "1.0.0",
});

server.tool(
  {
    name: "search_customers",
    description: "Search customers by name or ID.",
  },
  async ({ query }) => text(\`Searching for \${query}\`)
);

await server.listen();`;

const CLIENT = `import { MCPClient } from "mcpfy-sdk/client";

const client = new MCPClient({
  mcpServers: {
    local: { command: "node", args: ["server.js"] },
  },
});

const session = await client.createSession("local");
console.log(await session.callTool("search_customers", { query: "acme" }));`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "customer-mcp": {
      "type": "http",
      "url": "https://customer-mcp.example.com/mcp"
    }
  }
}`;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 first:mt-0">
      <h2 className="text-xl font-semibold tracking-tight text-hi">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <article>
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent-text">
        Documentation
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-hi">
        Build an MCP server
      </h1>
      <p className="mt-3 text-md leading-relaxed text-muted">
        The MCPfy SDK is MIT licensed and works standalone — you do not need an
        account to use anything on this page.
      </p>

      <Section id="quickstart" title="Quickstart">
        <p className="text-base leading-relaxed text-muted">
          One command scaffolds a server with a tool, a prompt, a resource and
          TypeScript already configured.
        </p>
        <CodeBlock
          language="bash"
          code={`npx create-mcpfy-app@latest my-server
cd my-server
npm run dev`}
        />
      </Section>

      <Section id="server" title="Writing tools">
        <p className="text-base leading-relaxed text-muted">
          Tools, prompts and resources share one shape. Transports (HTTP and
          stdio) are handled by <code className="font-mono text-fg">listen()</code>.
        </p>
        <CodeBlock language="typescript" filename="server.ts" code={SERVER} />
      </Section>

      <Section id="client" title="Calling a server">
        <CodeBlock language="typescript" filename="client.ts" code={CLIENT} />
      </Section>

      <Section id="telemetry" title="Telemetry">
        <p className="text-base leading-relaxed text-muted">
          <code className="font-mono text-fg">mcpfy-pulse</code> wraps any
          transport, or proxies any MCP server over stdio, to record method,
          duration, payload size and outcome. It never records argument values
          or resource contents.
        </p>
        <CodeBlock
          language="bash"
          code={`npx mcpfy-proxy --url https://customer-mcp.example.com/mcp`}
        />
      </Section>

      <Section id="connect" title="Connecting a client">
        <p className="text-base leading-relaxed text-muted">
          Drop this into your Claude Desktop configuration. MCPfy generates the
          equivalent for Cursor and VS Code on each server&rsquo;s page.
        </p>
        <CodeBlock
          language="json"
          filename="claude_desktop_config.json"
          code={CLAUDE_CONFIG}
        />
      </Section>

      <Section id="control-plane" title="Operate MCPfy from your editor">
        <p className="text-base leading-relaxed text-muted">
          MCPfy exposes its own control plane as an MCP server. Point Claude or
          Cursor at it and you can deploy a server, read why a build failed and
          audit readiness without leaving the conversation.
        </p>
        <CodeBlock
          language="json"
          filename="claude_desktop_config.json"
          code={`{
  "mcpServers": {
    "mcpfy": {
      "type": "http",
      "url": "${APP_URL}/mcp",
      "headers": { "Authorization": "Bearer MCPFY_API_KEY" }
    }
  }
}`}
        />
        <p className="text-base leading-relaxed text-muted">
          The key&rsquo;s role decides which tools appear. A viewer key lists
          only the read tools; a developer key adds{" "}
          <code className="font-mono text-fg">deploy_server</code>. There are no
          destructive tools — deleting things stays in the dashboard, where a
          person is looking at it.
        </p>
      </Section>

      <Section id="platform" title="Platform">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">In development</Badge>
          <span className="text-2xs text-subtle">
            Deployment, inspector, analytics and evaluations
          </span>
        </div>
        <p className="text-base leading-relaxed text-muted">
          The hosted platform is being built in phases. Server creation and
          client configuration work today; GitHub-driven deployment,
          observability and evaluations are next. Progress is tracked in{" "}
          <a
            href="https://github.com/mcpfyy/mcpfy/blob/main/ROADMAP.md"
            className="text-accent-text hover:underline"
          >
            ROADMAP.md
          </a>
          .
        </p>
        <p className="text-base text-muted">
          <Link href="/signup" className="text-accent-text hover:underline">
            Create an account
          </Link>{" "}
          to connect a server you already run.
        </p>
      </Section>
    </article>
  );
}
