#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDev } from "./dev.js";

/**
 * The `mcpfy` command.
 *
 * It lives in the SDK rather than a separate package on purpose: the developer
 * has already installed mcpfy-sdk to write their server, and asking them to
 * install a second thing before they can look at what they wrote is the kind
 * of friction that decides which toolchain someone keeps.
 */

const USAGE = `mcpfy — develop and inspect MCP servers

Usage: mcpfy <command> [options]

Commands:
  dev [entry]        Run your server with an inspector attached

Options:
  -p, --port <n>     Port for the inspector and proxy (default: 6274)
  --host <host>      Host to bind (default: 127.0.0.1)
  -h, --help         Show this help
  -v, --version      Print the version

Examples:
  mcpfy dev
  mcpfy dev src/server.ts --port 7000

With no entry, mcpfy looks for src/server.ts, src/index.ts, server.ts or
index.ts in the current directory.
`;

function ownVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/src/cli/index.js -> up to the package root.
    for (const up of ["..", "../..", "../../..", "../../../.."]) {
      try {
        const pkg = JSON.parse(readFileSync(join(here, up, "package.json"), "utf8"));
        if (pkg.name === "mcpfy-sdk") return String(pkg.version);
      } catch {
        /* keep walking */
      }
    }
  } catch {
    /* fall through */
  }
  return "unknown";
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    console.log(ownVersion());
    process.exit(0);
  }

  const command = argv[0];
  if (command !== "dev") {
    fail(`Unknown command "${command}". Run "mcpfy --help" to see the commands.`);
  }

  let entry = "";
  let port = 6274;
  let host = "127.0.0.1";
  let portWasChosen = false;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg === "--port" || arg === "-p") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        fail(`Invalid --port "${argv[i]}" — expected a port between 0 and 65535.`);
      }
      port = value;
      portWasChosen = true;
    } else if (arg.startsWith("--port=")) {
      const value = Number(arg.slice(7));
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        fail(`Invalid --port "${arg.slice(7)}" — expected a port between 0 and 65535.`);
      }
      port = value;
      portWasChosen = true;
    } else if (arg === "--host") {
      host = argv[++i] ?? host;
    } else if (arg.startsWith("-")) {
      // Same rule as the scaffolder: an unrecognised flag is a mistake worth
      // stopping for, not something to quietly drop.
      fail(`Unknown option "${arg}". Run "mcpfy dev --help" to see the options.`);
    } else if (!entry) {
      entry = arg;
    } else {
      fail(`Unexpected argument "${arg}" — the entry was already given as "${entry}".`);
    }
  }

  try {
    await runDev({ entry, port, host, open: false, portWasChosen });
  } catch (err) {
    fail(`\n${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
