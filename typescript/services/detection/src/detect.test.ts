import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detect } from "./detect";
import { memoryTree } from "./memory-tree";

const pkg = (o: Record<string, unknown>) => JSON.stringify(o, null, 2);

describe("node detection", () => {
  test("identifies an mcpfy-sdk server and its scripts", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          name: "customer-mcp",
          scripts: { build: "tsc", start: "node dist/server.js" },
          dependencies: { "mcpfy-sdk": "^0.2.3" },
        }),
        "tsconfig.json": "{}",
        "pnpm-lock.yaml": "",
      }),
    );

    assert.equal(d.framework, "mcpfy_sdk");
    assert.equal(d.language, "typescript");
    assert.equal(d.packageManager, "pnpm");
    assert.equal(d.installCommand, "pnpm install --frozen-lockfile");
    assert.equal(d.warnings.length, 0);
    assert.equal(d.buildCommand, "pnpm build");
    assert.equal(d.startCommand, "pnpm start");
    assert.equal(d.confidence, "high");
  });

  test("prefers mcpfy-sdk over the official SDK it wraps", async () => {
    // mcpfy-sdk depends on @modelcontextprotocol/sdk, so both appear. The more
    // specific answer is the useful one.
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          dependencies: {
            "@modelcontextprotocol/sdk": "^1.29.0",
            "mcpfy-sdk": "^0.2.3",
          },
          scripts: { start: "node server.js" },
        }),
      }),
    );
    assert.equal(d.framework, "mcpfy_sdk");
  });

  test("falls back to the official SDK when that is all there is", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          dependencies: { "@modelcontextprotocol/sdk": "^1.29.0" },
          scripts: { start: "node server.js" },
        }),
      }),
    );
    assert.equal(d.framework, "mcp_sdk_typescript");
  });

  test("finds MCP libraries in devDependencies too", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          devDependencies: { "mcpfy-sdk": "^0.2.3" },
          scripts: { start: "node server.js" },
        }),
      }),
    );
    assert.equal(d.framework, "mcpfy_sdk");
  });

  test("reads the package manager from lockfiles", async () => {
    for (const [lockfile, manager] of [
      ["yarn.lock", "yarn"],
      ["bun.lockb", "bun"],
      ["package-lock.json", "npm"],
    ] as const) {
      const d = await detect(
        memoryTree({
          "package.json": pkg({ dependencies: { "mcpfy-sdk": "1" } }),
          [lockfile]: "",
        }),
      );
      assert.equal(d.packageManager, manager, lockfile);
    }
  });

  test("a frozen install is only used when a lockfile exists", async () => {
    // `npm ci` exits non-zero without a package-lock.json, so choosing it
    // blindly turns every lockfile-less repository into a failed build.
    const withLock = await detect(
      memoryTree({
        "package.json": pkg({ dependencies: { "mcpfy-sdk": "1" } }),
        "package-lock.json": "{}",
      }),
    );
    assert.equal(withLock.installCommand, "npm ci");

    const withoutLock = await detect(
      memoryTree({
        "package.json": pkg({ dependencies: { "mcpfy-sdk": "1" } }),
      }),
    );
    assert.equal(withoutLock.installCommand, "npm install");
    assert.ok(withoutLock.warnings.some((w) => /No lockfile/i.test(w)));
  });

  test("the packageManager field beats a stale lockfile", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          packageManager: "pnpm@10.15.0",
          dependencies: { "mcpfy-sdk": "1" },
        }),
        "package-lock.json": "",
      }),
    );
    assert.equal(d.packageManager, "pnpm");
  });

  test("picks the lowest supported node major from an engines range", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          engines: { node: "^20.19.0 || >=22.12.0" },
          dependencies: { "mcpfy-sdk": "1" },
        }),
      }),
    );
    assert.equal(d.runtime, "node20");
  });

  test("defaults to node22 when engines says nothing", async () => {
    const d = await detect(
      memoryTree({ "package.json": pkg({ dependencies: { "mcpfy-sdk": "1" } }) }),
    );
    assert.equal(d.runtime, "node22");
  });

  test("prefers an explicit http start script", async () => {
    // MCPfy serves over HTTP; a project offering both variants means the one.
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: {
            "start:stdio": "tsx src/server.ts",
            "start:http": "tsx src/server.ts --http",
          },
        }),
      }),
    );
    assert.equal(d.startCommand, "npm run start:http");
  });

  test("plain start beats a dev script", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: { dev: "tsx src/server.ts", start: "node dist/server.js" },
        }),
      }),
    );
    assert.equal(d.startCommand, "npm run start");
    assert.equal(
      d.warnings.some((w) => /development script/i.test(w)),
      false,
    );
  });

  test("falls back to a dev script but says so", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: { dev: "tsx src/server.ts" },
        }),
      }),
    );
    assert.equal(d.startCommand, "npm run dev");
    assert.ok(d.warnings.some((w) => /development script/i.test(w)));
  });

  test("warns instead of guessing when there is no start script", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({ dependencies: { "mcpfy-sdk": "1" } }),
      }),
    );
    assert.equal(d.startCommand, null);
    assert.ok(d.warnings.some((w) => /start command/i.test(w)));
  });

  test("survives malformed package.json", async () => {
    const d = await detect(memoryTree({ "package.json": "{ not json" }));
    assert.equal(d.framework, "unknown");
    assert.equal(d.confidence, "low");
    assert.ok(d.warnings.some((w) => /not valid JSON/.test(w)));
  });
});

describe("python detection", () => {
  test("identifies FastMCP with a uv lockfile", async () => {
    const d = await detect(
      memoryTree({
        "pyproject.toml": `[project]
name = "customer-mcp"
requires-python = ">=3.12"
dependencies = ["fastmcp>=2.0"]
`,
        "uv.lock": "",
        "server.py": "",
      }),
    );
    assert.equal(d.framework, "fastmcp");
    assert.equal(d.runtime, "python312");
    assert.equal(d.packageManager, "uv");
    assert.equal(d.startCommand, "uv run python server.py");
  });

  test("identifies the official python SDK from requirements.txt", async () => {
    const d = await detect(
      memoryTree({ "requirements.txt": "mcp==1.2.0\nhttpx\n", "main.py": "" }),
    );
    assert.equal(d.framework, "mcp_sdk_python");
    assert.equal(d.packageManager, "pip");
    assert.equal(d.startCommand, "python main.py");
  });

  test("does not mistake fastmcp for the mcp package", async () => {
    // "mcp" is a substring of "fastmcp"; a naive includes() picks the wrong one.
    const d = await detect(
      memoryTree({ "requirements.txt": "fastmcp>=2.0\n", "server.py": "" }),
    );
    assert.equal(d.framework, "fastmcp");
  });

  test("does not mistake mcp-use for the mcp package", async () => {
    const d = await detect(
      memoryTree({ "requirements.txt": "mcp-use==1.0.0\n", "server.py": "" }),
    );
    assert.equal(d.framework, "mcp_use");
  });

  test("reads python 3.11 from requires-python", async () => {
    const d = await detect(
      memoryTree({
        "pyproject.toml": `requires-python = ">=3.11"\ndependencies = ["mcp"]`,
        "poetry.lock": "",
        "app.py": "",
      }),
    );
    assert.equal(d.runtime, "python311");
    assert.equal(d.packageManager, "poetry");
  });

  test("looks in src/ for the entry point", async () => {
    const d = await detect(
      memoryTree({
        "requirements.txt": "mcp\n",
        "src/server.py": "",
      }),
    );
    assert.equal(d.startCommand, "python src/server.py");
  });
});

describe("fallbacks", () => {
  test("uses Docker only when no manifest explains the project", async () => {
    const d = await detect(memoryTree({ Dockerfile: "FROM node:22" }));
    assert.equal(d.framework, "docker");
    assert.equal(d.runtime, "docker");
  });

  test("a Dockerfile does not override a real manifest", async () => {
    const d = await detect(
      memoryTree({
        Dockerfile: "FROM node:22",
        "package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: { start: "node server.js" },
        }),
      }),
    );
    assert.equal(d.framework, "mcpfy_sdk");
  });

  test("finds a project nested one level down", async () => {
    const d = await detect(
      memoryTree({
        "README.md": "",
        "server/package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: { start: "node index.js" },
        }),
      }),
    );
    assert.equal(d.rootDirectory, "server");
    assert.equal(d.framework, "mcpfy_sdk");
  });

  test("finds a lockfile at the workspace root above a nested project", async () => {
    const d = await detect(
      memoryTree({
        "pnpm-lock.yaml": "",
        "README.md": "",
        "server/package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: { start: "node index.js" },
        }),
      }),
    );
    assert.equal(d.rootDirectory, "server");
    assert.equal(d.packageManager, "pnpm");
  });

  test("reports unknown with a usable warning on an empty repository", async () => {
    const d = await detect(memoryTree({ "README.md": "# hello" }));
    assert.equal(d.framework, "unknown");
    assert.equal(d.confidence, "low");
    assert.ok(d.warnings.some((w) => /root directory/i.test(w)));
  });

  test("always returns evidence for a confident answer", async () => {
    const d = await detect(
      memoryTree({
        "package.json": pkg({
          dependencies: { "mcpfy-sdk": "1" },
          scripts: { start: "node server.js" },
        }),
      }),
    );
    assert.equal(d.confidence, "high");
    assert.ok(d.evidence.length > 0);
    assert.ok(d.evidence.every((e) => e.file && e.reason));
  });
});
