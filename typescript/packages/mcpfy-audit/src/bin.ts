import { audit, identify, type AuditTarget } from "./audit";
import { renderReport } from "./report";

const USAGE = `
  mcpfy-audit — audit any MCP server

  Usage
    mcpfy-audit <url>                 audit an MCP endpoint over HTTP
    mcpfy-audit --command "<cmd>"     run a local server over stdio

  Options
    --json                 print the report as JSON instead
    --header "<k: v>"      add a request header (repeatable)
    --token <value>        shorthand for an Authorization bearer header
    --timeout <ms>         connection timeout, default 20000
    --min-score <n>        exit non-zero below this score
    --help                 show this

  Examples
    npx mcpfy-audit https://example.com/mcp
    npx mcpfy-audit --command "node dist/server.js"
    npx mcpfy-audit https://example.com/mcp --token "$API_KEY" --min-score 80

  Exit codes
    0  no blocking failures
    1  score below --min-score
    2  a blocking check failed
    3  could not run the audit at all

  Nothing is uploaded. The report is printed and forgotten.
`;

interface Options extends AuditTarget {
  json: boolean;
  minScore: number | null;
}

type ParseResult =
  | { ok: true; options: Options }
  | { ok: false; error?: string };

function parse(argv: string[]): ParseResult {
  const options: Options = { json: false, minScore: null, headers: {} };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--help":
      case "-h":
        return { ok: false };
      case "--json":
        options.json = true;
        break;
      case "--command":
      case "-c": {
        // Everything in the string after the executable is treated as its
        // arguments, so `--command "node server.js --http"` works as typed.
        const raw = argv[++i] ?? "";
        const parts = raw.split(/\s+/).filter(Boolean);
        options.command = parts[0];
        options.args = parts.slice(1);
        break;
      }
      case "--header": {
        const raw = argv[++i] ?? "";
        const at = raw.indexOf(":");
        if (at > 0) {
          options.headers![raw.slice(0, at).trim()] = raw.slice(at + 1).trim();
        }
        break;
      }
      case "--token":
        options.bearerToken = argv[++i];
        break;
      case "--timeout": {
        const ms = Number(argv[++i]);
        if (!Number.isFinite(ms) || ms <= 0) {
          return { ok: false, error: "--timeout needs a positive number of milliseconds." };
        }
        options.timeoutMs = ms;
        break;
      }
      case "--min-score": {
        const n = Number(argv[++i]);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return { ok: false, error: "--min-score needs a number between 0 and 100." };
        }
        options.minScore = n;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          return { ok: false, error: `Unknown option: ${arg}` };
        }
        positional.push(arg);
    }
  }

  if (!options.command && positional[0]) options.url = positional[0];

  if (!options.command && !options.url) {
    return { ok: false, error: "Give an MCP endpoint URL, or --command to run a local server." };
  }

  if (options.url && !/^https?:\/\//i.test(options.url)) {
    return {
      ok: false,
      error: `"${options.url}" is not an http(s) URL. For a local server use --command instead.`,
    };
  }

  return { ok: true, options };
}

const parsed = parse(process.argv.slice(2));

if (!parsed.ok) {
  if (parsed.error) {
    process.stderr.write(`\n  ${parsed.error}\n${USAGE}`);
    process.exit(3);
  }
  process.stdout.write(USAGE);
  process.exit(0);
}

const { options } = parsed;

const target = options.command
  ? `${options.command} ${(options.args ?? []).join(" ")}`.trim()
  : options.url!;

try {
  // The identity probe is best-effort: it decorates the header, and a server
  // that will not answer ping is still worth auditing.
  const [report, server] = await Promise.all([
    audit(options),
    identify(options).catch(() => null),
  ]);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ target, server, report }, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(report, target, server)}\n`);
  }

  // Exit codes chosen so this works as a CI gate: a blocking failure or a
  // score below the requested floor fails the build; advisories never do.
  if (report.summary.blockers > 0) process.exit(2);
  if (options.minScore !== null && report.score < options.minScore) process.exit(1);
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n  mcpfy-audit could not run: ${message}\n\n`);
  process.exit(3);
}
