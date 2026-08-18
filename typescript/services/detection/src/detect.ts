import type {
  Detection,
  Evidence,
  Language,
  McpFramework,
  PackageManager,
  Runtime,
  SourceTree,
} from "./types";

/** npm package name → the framework it implies. Order matters: first match wins. */
const NODE_FRAMEWORKS: [string, McpFramework][] = [
  ["mcpfy-sdk", "mcpfy_sdk"],
  ["mcp-use", "mcp_use"],
  ["@modelcontextprotocol/sdk", "mcp_sdk_typescript"],
];

/** PyPI distribution name → framework. Names are matched case-insensitively. */
const PYTHON_FRAMEWORKS: [string, McpFramework][] = [
  ["fastmcp", "fastmcp"],
  ["mcp-use", "mcp_use"],
  ["mcp", "mcp_sdk_python"],
];

const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/**
 * Two forms per manager: the reproducible one when a lockfile pins the tree,
 * and the resolving one when it does not. `npm ci` fails outright without a
 * package-lock.json, so choosing by lockfile presence is not a preference —
 * it is the difference between a build that runs and one that cannot.
 */
const INSTALL: Record<PackageManager, { locked: string; unlocked: string }> = {
  npm: { locked: "npm ci", unlocked: "npm install" },
  pnpm: {
    locked: "pnpm install --frozen-lockfile",
    unlocked: "pnpm install",
  },
  yarn: {
    locked: "yarn install --frozen-lockfile",
    unlocked: "yarn install",
  },
  bun: {
    locked: "bun install --frozen-lockfile",
    unlocked: "bun install",
  },
  pip: {
    locked: "pip install -r requirements.txt",
    unlocked: "pip install .",
  },
  uv: { locked: "uv sync --frozen", unlocked: "uv sync" },
  poetry: {
    locked: "poetry install --no-root",
    unlocked: "poetry install --no-root",
  },
};

const RUN: Record<PackageManager, string> = {
  npm: "npm run",
  pnpm: "pnpm",
  yarn: "yarn",
  bun: "bun run",
  pip: "python",
  uv: "uv run",
  poetry: "poetry run",
};

/**
 * Identifies how to build and start the MCP server in `tree`.
 *
 * Never throws: an unreadable or unrecognisable repository returns
 * `framework: "unknown"` with warnings explaining what was missing, because
 * the import screen needs something to render either way.
 */
export async function detect(tree: SourceTree): Promise<Detection> {
  const evidence: Evidence[] = [];
  const warnings: string[] = [];

  const root = await findProjectRoot(tree, evidence);

  const at = (file: string) => (root === "." ? file : `${root}/${file}`);
  const packageJsonRaw = await tree.read(at("package.json"));

  if (packageJsonRaw) {
    return detectNode(tree, root, at, packageJsonRaw, evidence, warnings);
  }

  const pyproject = await tree.read(at("pyproject.toml"));
  const requirements = await tree.read(at("requirements.txt"));
  if (pyproject || requirements) {
    return detectPython(
      tree,
      root,
      at,
      pyproject,
      requirements,
      evidence,
      warnings,
    );
  }

  const dockerfile = await tree.read(at("Dockerfile"));
  if (dockerfile) {
    evidence.push({
      file: at("Dockerfile"),
      reason: "No package manifest found, but a Dockerfile is present.",
    });
    return {
      framework: "docker",
      runtime: "docker",
      language: "other",
      rootDirectory: root,
      packageManager: null,
      installCommand: null,
      buildCommand: null,
      startCommand: null,
      confidence: "medium",
      evidence,
      warnings: [
        "The image is expected to listen on the port given by $PORT and serve MCP over HTTP.",
      ],
    };
  }

  warnings.push(
    "No package.json, pyproject.toml, requirements.txt or Dockerfile was found. " +
      "Set the root directory if the server lives in a subdirectory.",
  );

  return {
    framework: "unknown",
    runtime: "node22",
    language: "other",
    rootDirectory: root,
    packageManager: null,
    installCommand: null,
    buildCommand: null,
    startCommand: null,
    confidence: "low",
    evidence,
    warnings,
  };
}

/* ------------------------------------------------------------------ Node */

interface PackageJson {
  name?: string;
  type?: string;
  engines?: { node?: string };
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function detectNode(
  tree: SourceTree,
  root: string,
  at: (file: string) => string,
  raw: string,
  evidence: Evidence[],
  warnings: string[],
): Promise<Detection> {
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch {
    warnings.push(
      `${at("package.json")} is not valid JSON, so nothing could be read from it.`,
    );
    return {
      framework: "unknown",
      runtime: "node22",
      language: "javascript",
      rootDirectory: root,
      packageManager: null,
      installCommand: null,
      buildCommand: null,
      startCommand: null,
      confidence: "low",
      evidence,
      warnings,
    };
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  let framework: McpFramework = "unknown";
  for (const [name, value] of NODE_FRAMEWORKS) {
    if (name in deps) {
      framework = value;
      evidence.push({
        file: at("package.json"),
        reason: `Depends on ${name}.`,
      });
      break;
    }
  }

  if (framework === "unknown") {
    warnings.push(
      "No MCP library was found in the dependencies. If the server imports one " +
        "indirectly, set the framework manually.",
    );
  }

  const { packageManager, lockfile } = await detectNodePackageManager(
    tree,
    root,
    pkg,
    evidence,
  );
  if (!lockfile) {
    warnings.push(
      "No lockfile was found, so dependency versions will resolve at build " +
        "time and may drift between deployments.",
    );
  }
  const runtime = nodeRuntime(pkg, evidence, at);
  const language = (await tree.read(at("tsconfig.json")))
    ? "typescript"
    : "javascript";
  if (language === "typescript") {
    evidence.push({ file: at("tsconfig.json"), reason: "TypeScript project." });
  }

  const scripts = pkg.scripts ?? {};
  const run = RUN[packageManager];

  const buildScript = scripts.build ? "build" : null;
  const startScript = pickStartScript(scripts);

  if (buildScript) {
    evidence.push({
      file: at("package.json"),
      reason: `scripts.${buildScript} is defined.`,
    });
  }
  if (startScript) {
    evidence.push({
      file: at("package.json"),
      reason: `scripts.${startScript} is defined.`,
    });
    if (startScript.startsWith("dev")) {
      warnings.push(
        `Only a development script (scripts.${startScript}) was found. It will ` +
          `work, but a production start script is usually faster and quieter.`,
      );
    }
  } else {
    warnings.push(
      "No start script was found. Set the start command before deploying.",
    );
  }

  return {
    framework,
    runtime,
    language,
    rootDirectory: root,
    packageManager,
    installCommand: lockfile
      ? INSTALL[packageManager].locked
      : INSTALL[packageManager].unlocked,
    buildCommand: buildScript ? `${run} ${buildScript}` : null,
    startCommand: startScript ? `${run} ${startScript}` : null,
    confidence: framework === "unknown" ? "medium" : "high",
    evidence,
    warnings,
  };
}

/**
 * MCPfy serves MCP over HTTP, so an explicit `:http` variant is the best
 * answer when a project offers several. Development scripts are last: they
 * run, but they are a fallback, and the caller is warned when one is chosen.
 */
const START_SCRIPTS = [
  "start:http",
  "start",
  "serve:http",
  "serve",
  "dev:http",
  "dev",
] as const;

function pickStartScript(scripts: Record<string, string>): string | null {
  for (const name of START_SCRIPTS) {
    if (scripts[name]) return name;
  }
  return null;
}

async function detectNodePackageManager(
  tree: SourceTree,
  root: string,
  pkg: PackageJson,
  evidence: Evidence[],
): Promise<{ packageManager: PackageManager; lockfile: string | null }> {
  // The packageManager field is authoritative when present — Corepack uses it.
  const declared = pkg.packageManager?.split("@")[0];
  const found = await findLockfile(tree, root, evidence);

  if (declared && declared in INSTALL) {
    evidence.push({
      file: root === "." ? "package.json" : `${root}/package.json`,
      reason: `packageManager field declares ${declared}.`,
    });
    return { packageManager: declared as PackageManager, lockfile: found?.file ?? null };
  }

  if (found) return { packageManager: found.manager, lockfile: found.file };
  return { packageManager: "npm", lockfile: null };
}

/** Lockfiles can live at the workspace root rather than beside the manifest. */
async function findLockfile(
  tree: SourceTree,
  root: string,
  evidence: Evidence[],
): Promise<{ manager: PackageManager; file: string } | null> {

  for (const directory of root === "." ? ["."] : [root, "."]) {
    const entries = await tree.list(directory);
    for (const [file, manager] of LOCKFILES) {
      if (entries.includes(file)) {
        const path = directory === "." ? file : `${directory}/${file}`;
        evidence.push({ file: path, reason: `${file} implies ${manager}.` });
        return { manager, file: path };
      }
    }
  }
  return null;
}

function nodeRuntime(
  pkg: PackageJson,
  evidence: Evidence[],
  at: (file: string) => string,
): Runtime {
  const range = pkg.engines?.node;
  if (!range) return "node22";

  // Take the lowest major mentioned; that is what the project promises to run on.
  const majors = [...range.matchAll(/(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 18 && n < 100);
  const lowest = majors.length > 0 ? Math.min(...majors) : null;

  if (lowest === null) return "node22";
  evidence.push({
    file: at("package.json"),
    reason: `engines.node is "${range}".`,
  });
  return lowest <= 20 ? "node20" : "node22";
}

/* ---------------------------------------------------------------- Python */

async function detectPython(
  tree: SourceTree,
  root: string,
  at: (file: string) => string,
  pyproject: string | null,
  requirements: string | null,
  evidence: Evidence[],
  warnings: string[],
): Promise<Detection> {
  const haystack = `${pyproject ?? ""}\n${requirements ?? ""}`;

  let framework: McpFramework = "unknown";
  for (const [name, value] of PYTHON_FRAMEWORKS) {
    if (mentionsPythonDependency(haystack, name)) {
      framework = value;
      evidence.push({
        file: pyproject ? at("pyproject.toml") : at("requirements.txt"),
        reason: `Depends on ${name}.`,
      });
      break;
    }
  }

  if (framework === "unknown") {
    warnings.push(
      "No MCP library was found in the Python dependencies. If the server " +
        "imports one indirectly, set the framework manually.",
    );
  }

  const entries = await tree.list(root);
  let packageManager: PackageManager = "pip";
  let locked = false;
  if (entries.includes("uv.lock")) {
    packageManager = "uv";
    locked = true;
    evidence.push({ file: at("uv.lock"), reason: "uv.lock implies uv." });
  } else if (entries.includes("poetry.lock")) {
    packageManager = "poetry";
    locked = true;
    evidence.push({
      file: at("poetry.lock"),
      reason: "poetry.lock implies Poetry.",
    });
  } else if (requirements) {
    // A pinned requirements.txt is the closest thing pip has to a lockfile.
    locked = true;
  } else {
    warnings.push(
      "No lockfile was found, so dependencies will resolve at build time.",
    );
  }

  const runtime = pythonRuntime(pyproject, evidence, at);
  const entrypoint = await findPythonEntrypoint(tree, root, entries, evidence);

  if (!entrypoint) {
    warnings.push(
      "No server.py, main.py or app.py was found. Set the start command manually.",
    );
  }

  return {
    framework,
    runtime,
    language: "python",
    rootDirectory: root,
    packageManager,
    installCommand: locked
      ? INSTALL[packageManager].locked
      : INSTALL[packageManager].unlocked,
    buildCommand: null,
    startCommand: entrypoint
      ? packageManager === "pip"
        ? `python ${entrypoint}`
        : `${RUN[packageManager]} python ${entrypoint}`
      : null,
    confidence: framework === "unknown" ? "medium" : "high",
    evidence,
    warnings,
  };
}

/**
 * Matches a distribution name at a dependency boundary, so "mcp" does not
 * match "mcp-use" or "fastmcp" and silently pick the wrong framework.
 */
function mentionsPythonDependency(haystack: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|["'\\s,\\[])${escaped}($|["'\\s,\\]=<>~!;])`, "im").test(
    haystack,
  );
}

function pythonRuntime(
  pyproject: string | null,
  evidence: Evidence[],
  at: (file: string) => string,
): Runtime {
  const match = pyproject?.match(/requires-python\s*=\s*["']([^"']+)["']/);
  if (!match?.[1]) return "python312";
  evidence.push({
    file: at("pyproject.toml"),
    reason: `requires-python is "${match[1]}".`,
  });
  const minor = match[1].match(/3\.(\d+)/);
  return minor?.[1] && Number(minor[1]) <= 11 ? "python311" : "python312";
}

async function findPythonEntrypoint(
  tree: SourceTree,
  root: string,
  entries: string[],
  evidence: Evidence[],
): Promise<string | null> {
  for (const candidate of ["server.py", "main.py", "app.py", "__main__.py"]) {
    if (entries.includes(candidate)) {
      evidence.push({
        file: root === "." ? candidate : `${root}/${candidate}`,
        reason: "Looks like the entry point.",
      });
      return candidate;
    }
  }
  // A src/ layout is common enough to be worth one more look.
  const src = await tree.list(root === "." ? "src" : `${root}/src`);
  for (const candidate of ["server.py", "main.py", "app.py"]) {
    if (src.includes(candidate)) {
      evidence.push({
        file: root === "." ? `src/${candidate}` : `${root}/src/${candidate}`,
        reason: "Looks like the entry point.",
      });
      return `src/${candidate}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ root */

/**
 * Most repositories put the manifest at the top. Ones that do not are usually
 * a monorepo, so we look one level down and take the first directory that
 * carries a manifest — anything deeper needs the user to say so explicitly.
 */
async function findProjectRoot(
  tree: SourceTree,
  evidence: Evidence[],
): Promise<string> {
  const top = await tree.list(".");
  if (
    top.includes("package.json") ||
    top.includes("pyproject.toml") ||
    top.includes("requirements.txt") ||
    top.includes("Dockerfile")
  ) {
    return ".";
  }

  const skip = new Set([
    "node_modules",
    ".git",
    ".github",
    "dist",
    "build",
    "docs",
    "examples",
    "test",
    "tests",
    ".venv",
  ]);

  for (const entry of top) {
    if (skip.has(entry) || entry.includes(".")) continue;
    const nested = await tree.list(entry);
    if (nested.includes("package.json") || nested.includes("pyproject.toml")) {
      evidence.push({
        file: entry,
        reason: "No manifest at the repository root; found one here.",
      });
      return entry;
    }
  }

  return ".";
}
