export const dynamic = "force-static";

/**
 * Everything a coding agent needs to build an MCP server that MCPfy can
 * deploy, in one paste.
 *
 * Served as plain text so it works from a browser, from curl, and from the
 * "Copy prompt for agents" button — all reading the same document. Every
 * command and package name here is real and published.
 */
const PROMPT = `# Building an MCP server with mcpfy

You are helping build a Model Context Protocol (MCP) server using the mcpfy
SDK, which will be deployed on MCPfy.

## Scaffold

    npx create-mcpfy-app@latest my-server

Answer "http" when asked for the transport — MCPfy serves MCP over HTTP, and
a stdio-only server cannot be health-checked or reached by a remote client.

## Server shape

    import { MCPServer, text, object } from "mcpfy-sdk/server";
    import { z } from "zod";

    const server = new MCPServer({
      name: "my-server",
      version: "1.0.0",
    });

    server.tool(
      {
        name: "search_customers",
        description: "Search customers by email domain, name or ID.",
        schema: z.object({
          query: z.string().describe("Free-text search term."),
          limit: z.number().optional().describe("Maximum rows to return."),
        }),
        outputSchema: z.object({ customers: z.array(z.unknown()) }),
      },
      async ({ query, limit }) => object({ customers: await find(query, limit) })
    );

    await server.listen({ transport: "http" });

## Rules that matter for deployment

1. Read the port from process.env.PORT. MCPfy allocates one and sets it.
   Hardcoding 3000 means the health check can never reach you.
2. Describe every tool and every argument. Descriptions are what an agent
   uses to decide whether to call your tool at all; an undescribed argument
   is effectively invisible.
3. Give every tool an outputSchema. It makes results structured rather than
   a wall of text, and MCPfy renders it in the registry.
4. Return errors as errors. Do not return a success payload whose text says
   "something went wrong" — MCP has an error channel, use it.
5. Keep tools narrow. One tool that does six things is harder for a model to
   select correctly than six tools that each do one.
6. Never read secrets from a file committed to the repository. MCPfy injects
   environment variables at start; read them from process.env.

## Local check

    npm run build
    PORT=3000 npm start

Then, in another terminal, confirm the handshake and tool list:

    npx mcpfy-proxy --url http://localhost:3000/mcp

## Deploying

Push to a git repository, then in MCPfy: create a server, choose "Build from
a git repository", and paste the repository URL. MCPfy clones it, detects the
framework and build commands, runs them, starts the process, completes a real
MCP handshake against it, and records every tool it advertises.

The build fails loudly and with the exact command output if anything goes
wrong; read the deployment log rather than guessing.

## Packages

- mcpfy-sdk         build tools, prompts, resources and widgets
- create-mcpfy-app  scaffold a working server in one command
- mcpfy-pulse       drop-in telemetry; never transmits argument values

All MIT licensed: https://github.com/mcpfyy/mcpfy
`;

export function GET() {
  return new Response(PROMPT, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
