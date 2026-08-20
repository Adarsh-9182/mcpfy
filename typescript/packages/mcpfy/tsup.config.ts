import { defineConfig } from "tsup";

const external = [
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/ext-apps",
  "@mcp-ui/server",
  "zod",
  "jose",
  "mcpfy-pulse",
];

export default defineConfig([
  // The `mcpfy` binary. ESM only, so it cannot share the dual-format build the
  // library entries use. No banner: the source file already starts with a
  // shebang and tsup preserves it — adding one here emitted two, and the
  // second is a syntax error rather than a comment.
  {
    entry: { "src/cli/index": "src/cli/index.ts" },
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
  {
    entry: {
      "src/index": "src/index.ts",
      "src/server/index": "src/server/index.ts",
      "src/client/index": "src/client/index.ts",
      "src/auth/index": "src/auth/index.ts",
    },
    format: ["cjs", "esm"],
    outDir: "dist",
    platform: "node",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
  // Widget bridge: runs inside a widget's <iframe>, not Node — separate browser-target build.
  {
    entry: {
      "src/client-widget/index": "src/client-widget/index.ts",
    },
    format: ["esm"],
    outDir: "dist",
    platform: "browser",
    target: "es2022",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external,
  },
]);
