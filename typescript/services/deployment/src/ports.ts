import { createServer, Socket } from "node:net";

/**
 * Finds a free TCP port by binding to 0 and reading back what the kernel
 * chose, then releasing it.
 *
 * There is an unavoidable race between releasing the port and the child
 * process binding it, so `start` retries on EADDRINUSE. Asking the kernel is
 * still far better than scanning a range: it will not hand out a port another
 * process already holds, which a scan does under concurrency.
 */
export function freePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not determine a free port."));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Both loopback families, because "localhost" is not one address.
 *
 * A Node server given `listen(port)` with no host may bind IPv6 loopback
 * only, and then nothing on 127.0.0.1 can reach it — the server logs that it
 * is listening while every health check times out. Probing both and reporting
 * which one answered is what makes the endpoint URL correct rather than
 * merely plausible.
 */
export const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;

/** Formats a host for a URL; IPv6 literals need brackets. */
export function hostForUrl(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

/**
 * Resolves with the loopback host that accepted a connection on `port`.
 */
export async function waitForPort(
  port: number,
  {
    hosts = LOOPBACK_HOSTS,
    timeoutMs = 30_000,
    intervalMs = 150,
    signal,
  }: {
    hosts?: readonly string[];
    timeoutMs?: number;
    intervalMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    signal?.throwIfAborted();
    for (const host of hosts) {
      if (await canConnect(port, host)) return host;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Nothing accepted a connection on port ${port} (tried ${hosts.join(", ")}) ` +
          `within ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
    await sleep(intervalMs, signal);
  }
}

function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host);
  });
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
