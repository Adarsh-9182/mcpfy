import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so
  // Next compiles them alongside the app.
  transpilePackages: [
    "@mcpfy/ui",
    "@mcpfy/db",
    "@mcpfy/detection",
    "@mcpfy/deployment",
    "@mcpfy/inspector",
    "@mcpfy/gateway",
    "@mcpfy/readiness",
    "@mcpfy/control-mcp",
  ],
  typedRoutes: true,
  experimental: {
    // PGlite and postgres-js are Node-only; keep them out of the client graph.
    serverActions: { bodySizeLimit: "2mb" },
  },
  serverExternalPackages: [
    "@electric-sql/pglite",
    "postgres",
    // Spawns child processes and opens sockets; must not be bundled.
    "mcpfy-sdk",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default config;
