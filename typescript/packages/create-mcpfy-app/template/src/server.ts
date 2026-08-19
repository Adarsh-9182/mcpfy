import { MCPServer, markdown, object, text{{AUTH_IMPORT}} } from "mcpfy-sdk/server";
import { z } from "zod";

const server = new MCPServer({
  name: "{{PROJECT_NAME}}",
  version: "1.0.0",
  description: "An MCP server built with mcpfy.",{{AUTH_CONFIG}}
});

// Describe every tool and every argument. An agent chooses which tool to call
// by reading these — an undescribed argument is one the model has to guess at,
// and an undescribed tool is effectively invisible however well it works.
server.tool(
  {
    name: "add",
    description: "Add two numbers together and return their sum.",
    schema: z.object({
      a: z.number().describe("The first number to add."),
      b: z.number().describe("The second number to add."),
    }),
    outputSchema: z.object({
      sum: z.number().describe("The sum of a and b."),
    }),
  },
  async ({ a, b }) => object({ sum: a + b })
);

server.resource(
  {
    name: "greeting",
    uri: "app://greeting",
    title: "Greeting",
    description: "A short welcome message, as markdown.",
  },
  async () => markdown("# Hello from mcpfy!")
);

server.prompt(
  {
    name: "greet",
    description: "Generate a friendly greeting addressed to someone.",
    schema: z.object({
      name: z.string().describe("The name of the person to greet."),
    }),
  },
  async ({ name }) => text(`Hello, ${name}!`)
);

// Defaults to the transport chosen at scaffold time ({{DEFAULT_TRANSPORT}}); pass --http or
// --stdio to override for a single run without touching this file.
// HTTP port priority: --port N → PORT env → 3000 (npm scripts pass --port {{DEFAULT_PORT}}).
const transport = process.argv.includes("--http")
  ? "http"
  : process.argv.includes("--stdio")
    ? "stdio"
    : "{{DEFAULT_TRANSPORT}}";

await server.listen(transport === "http" ? { transport: "http" } : { transport: "stdio" });
