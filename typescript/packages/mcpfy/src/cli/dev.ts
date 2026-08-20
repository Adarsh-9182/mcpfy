import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FrameLog, parseSseData } from "./frames.js";
import { inspectorHtml } from "./inspector-html.js";

/**
 * `mcpfy dev` — the local development loop.
 *
 * The point of this command is where it runs, not what it does. MCPfy already
 * had an inspector; it lived in the hosted dashboard, behind a signup. That
 * means the first useful thing the product does costs an account, while the
 * competing toolchain gives you the same thing from your own terminal in ten
 * seconds. Features were never the gap — location was.
 *
 * Shape:
 *
 *     browser ──► mcpfy dev (this) ──► your server (child process)
 *                      │
 *                      └── every JSON-RPC frame, recorded in memory
 *
 * A proxy rather than an in-process mount, for three reasons: the user's entry
 * file already calls `listen()` itself and we should not fight it; a crash in
 * their server must not take the inspector down with it, because the inspector
 * is where they will read the crash; and proxying is the only way to see the
 * bytes actually on the wire rather than what we hoped was sent.
 */

export interface DevOptions {
  entry: string;
  port: number;
  host: string;
  open: boolean;
  /** True when --port was given, so a busy port is an error, not a nudge. */
  portWasChosen?: boolean;
}

/** Asks the OS for a port nobody is using, then gives it straight back. */
async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const probe = createNetServer();
    probe.unref();
    probe.on("error", rej);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => res(port));
    });
  });
}

/**
 * Waits until the child answers, and reports *where* it answered.
 *
 * Both halves of that matter.
 *
 * The SDK's HTTP transport defaults to host "localhost", and on macOS with a
 * modern Node that resolves to ::1 first — so the server binds IPv6 only.
 * Probing 127.0.0.1 gets a connection refused forever, and the dev server
 * times out against a child that started perfectly. Which address won has to
 * be returned, because the proxy must then use the same one.
 *
 * The probe is also given a deadline of its own. A bare GET against a
 * Streamable HTTP endpoint can legitimately open an event stream and never
 * complete, in which case an un-aborted fetch would hang rather than fail, and
 * the retry loop would never take its second turn.
 */
const PROBE_HOSTS = ["127.0.0.1", "[::1]"] as const;

async function waitForChild(
  port: number,
  child: ChildProcess,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Your server exited with code ${child.exitCode} before it started listening.`,
      );
    }

    for (const host of PROBE_HOSTS) {
      const url = `http://${host}:${port}/mcp`;
      try {
        // Any answer at all proves something is bound — including a 4xx, which
        // is what most MCP endpoints return for a bare GET.
        await fetch(url, { method: "GET", signal: AbortSignal.timeout(1_000) });
        return url;
      } catch (err) {
        // A timeout means something *did* accept the connection and held it
        // open, which still proves the server is up.
        if (err instanceof Error && err.name === "TimeoutError") return url;
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  throw new Error(
    `Your server did not start listening on port ${port} within ${timeoutMs / 1000}s.`,
  );
}

function resolveEntry(entry: string): string {
  const candidates = entry
    ? [entry]
    : ["src/server.ts", "src/index.ts", "server.ts", "index.ts", "src/server.js", "index.js"];

  for (const candidate of candidates) {
    const full = resolve(process.cwd(), candidate);
    if (existsSync(full)) return full;
  }

  throw new Error(
    entry
      ? `Entry file not found: ${entry}`
      : `Could not find a server entry. Looked for ${candidates.join(", ")}.\n` +
        `Pass one explicitly: mcpfy dev path/to/server.ts`,
  );
}

export async function runDev(options: DevOptions): Promise<void> {
  const entry = resolveEntry(options.entry);
  const log = new FrameLog();

  /**
   * Set once the child answers. Until then the proxy reports that the server
   * is still starting rather than failing, which is what lets the inspector be
   * open and useful during the seconds a slow entry file takes to boot.
   */
  let upstream: string | null = null;

  const server = createServer((req, res) => {
    handle(req, res, () => upstream, log).catch((err) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    });
  });

  // Our port is claimed first, deliberately. Spawning the child and *then*
  // discovering the inspector port is taken meant printing "MCP server
  // listening" immediately followed by a fatal port error, and killing a
  // process that had just started correctly.
  const bound = await listenWithFallback(server, options);

  const childPort = await freePort();

  // TypeScript entries need a loader; JavaScript ones must not get one, since
  // tsx may not be installed in a plain-JS project.
  const isTs = /\.[cm]?tsx?$/.test(entry);
  const args = isTs
    ? ["--import", "tsx", entry, "--http", "--port", String(childPort)]
    : [entry, "--http", "--port", String(childPort)];

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PORT: String(childPort),
      // Tells the SDK it is behind our proxy so it does not also ship
      // telemetry for traffic we are already showing locally.
      MCPFY_GATEWAY: "dev",
      // The child listens on an internal port the developer has no use for.
      // We print the address that matters instead.
      MCPFY_SILENT: "1",
    },
  });

  const shutdown = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\nYour server exited with code ${code}.`);
      process.exit(code);
    }
  });

  const shown = options.host === "0.0.0.0" || options.host === "::" ? "localhost" : options.host;
  const base = `http://${shown}:${bound}`;

  try {
    upstream = await waitForChild(childPort, child);
  } catch (err) {
    shutdown();
    throw err;
  }

  console.log("");
  console.log(`  mcpfy dev`);
  console.log("");
  console.log(`  \u279c  MCP endpoint:  ${base}/mcp`);
  console.log(`  \u279c  Inspector:     ${base}`);
  console.log(`  \u279c  Entry:         ${entry.replace(process.cwd() + "/", "")}`);
  console.log("");
  console.log(`  No account needed. Nothing leaves this machine.`);
  console.log("");
}

/**
 * Binds the inspector, working around a port that is already taken.
 *
 * A busy port is the most common thing that goes wrong when starting a dev
 * server, and the default behaviour — an unhandled EADDRINUSE — printed a Node
 * stack trace at someone whose only mistake was leaving a tab open. There is
 * nothing in that trace they can act on.
 *
 * Which response is right depends on whether they picked the port. An explicit
 * --port is a request, and silently binding a different one would send them to
 * a URL that answers with somebody else's server. The default port is only a
 * default, so stepping to the next free one and saying so is kinder than
 * refusing to start.
 */
async function listenWithFallback(
  server: ReturnType<typeof createServer>,
  options: DevOptions,
): Promise<number> {
  const MAX_TRIES = 20;
  let port = options.port;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      await new Promise<void>((res, rej) => {
        const onError = (err: NodeJS.ErrnoException) => {
          server.removeListener("listening", onListening);
          rej(err);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          res();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, options.host);
      });

      if (port !== options.port) {
        console.log(`\n  Port ${options.port} was busy — using ${port} instead.`);
      }
      return port;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE") throw err;

      if (options.portWasChosen) {
        throw new Error(
          `Port ${port} is already in use.\n` +
            `Something else is listening there — stop it, or pass a different --port.`,
        );
      }

      port += 1;
    }
  }

  throw new Error(
    `Could not find a free port between ${options.port} and ${options.port + MAX_TRIES}.`,
  );
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  getUpstream: () => string | null,
  log: FrameLog,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/" || url.pathname === "/inspector") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(inspectorHtml());
    return;
  }

  if (url.pathname === "/__frames") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ frames: log.frames }));
    return;
  }

  if (url.pathname === "/__frames/clear" && req.method === "POST") {
    log.clear();
    res.writeHead(204).end();
    return;
  }

  if (url.pathname === "/__events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const unsubscribe = log.subscribe((frame) => {
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    });
    req.on("close", unsubscribe);
    return;
  }

  const upstream = getUpstream();
  if (!upstream) {
    // Still booting. 503 with Retry-After is the honest answer, and the
    // inspector shows it as "connecting" rather than as a failure.
    res.writeHead(503, { "content-type": "application/json", "retry-after": "1" });
    res.end(JSON.stringify({ error: "The server is still starting." }));
    return;
  }

  await proxy(req, res, upstream, log);
}

async function proxy(
  req: IncomingMessage,
  res: ServerResponse,
  upstream: string,
  log: FrameLog,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  if (body.length > 0) {
    try {
      log.record("request", JSON.parse(body.toString("utf8")));
    } catch {
      /* not JSON — nothing to show, and not our problem to reject */
    }
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    // Hop-by-hop headers describe *this* connection and must not be forwarded
    // onto a different one.
    if (["host", "connection", "keep-alive", "transfer-encoding", "upgrade"].includes(key)) {
      continue;
    }
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }

  const upstreamResponse = await fetch(upstream, {
    method: req.method,
    headers,
    body: body.length > 0 ? body : undefined,
    // @ts-expect-error - Node's fetch requires this for a request body stream.
    duplex: "half",
  });

  const outHeaders: Record<string, string> = {};
  upstreamResponse.headers.forEach((value, key) => {
    if (["content-encoding", "content-length", "transfer-encoding"].includes(key)) return;
    outHeaders[key] = value;
  });
  res.writeHead(upstreamResponse.status, outHeaders);

  const contentType = upstreamResponse.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream") && upstreamResponse.body) {
    // Streamed responses are teed, not buffered: buffering an SSE stream to
    // record it would defeat the streaming the client asked for.
    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
      for (const payload of parseSseData(decoder.decode(value, { stream: true }))) {
        log.record("response", payload);
      }
    }
    res.end();
    return;
  }

  const text = await upstreamResponse.text();
  if (text) {
    try {
      log.record("response", JSON.parse(text));
    } catch {
      /* not JSON */
    }
  }
  res.end(text);
}
