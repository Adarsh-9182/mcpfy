import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts", "src/audit.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  dts: false,
  /*
   * The scoring engine and the MCP client live in the monorepo as private
   * packages, so they are bundled rather than declared as dependencies — a
   * published package cannot resolve `workspace:*`. The MCP SDK stays
   * external because it is a real, versioned dependency users may already
   * have installed.
   */
  noExternal: ["@mcpfy/readiness", "@mcpfy/inspector"],
  banner: { js: "#!/usr/bin/env node" },
});
