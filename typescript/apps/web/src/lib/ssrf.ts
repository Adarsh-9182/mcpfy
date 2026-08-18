import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * §25 — SSRF protection for user-supplied MCP endpoints.
 *
 * The platform connects outward to URLs that users type in, which makes it a
 * confused deputy: without this check, "https://169.254.169.254/…" would let
 * anyone read our cloud instance metadata through our own credentials.
 *
 * We reject on scheme, on literal private addresses, and on hostnames that
 * *resolve* to private addresses — the last of which is what catches an
 * attacker-controlled domain pointed at 127.0.0.1.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts as [number, number];
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe80")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  // IPv4-mapped, e.g. ::ffff:127.0.0.1
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

export interface SafeUrlOptions {
  /** Local development needs to reach localhost; production never does. */
  allowLoopback?: boolean;
}

/**
 * Validates and normalises an outbound URL. Throws `UnsafeUrlError` with a
 * message intended for the user, since they typed the value.
 */
export async function assertSafeUrl(
  raw: string,
  { allowLoopback = process.env.NODE_ENV !== "production" }: SafeUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That is not a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("Endpoints must use http or https.");
  }

  if (url.protocol === "http:" && !allowLoopback) {
    throw new UnsafeUrlError("Endpoints must use https.");
  }

  if (url.username || url.password) {
    throw new UnsafeUrlError(
      "Remove the credentials from the URL and add them as headers instead.",
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname) && !allowLoopback) {
    throw new UnsafeUrlError(`${url.hostname} is not reachable from MCPfy.`);
  }

  const addresses: string[] = [];
  if (isIP(hostname)) {
    addresses.push(hostname);
  } else {
    try {
      const resolved = await lookup(hostname, { all: true });
      addresses.push(...resolved.map((r) => r.address));
    } catch {
      throw new UnsafeUrlError(`${url.hostname} could not be resolved.`);
    }
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`${url.hostname} could not be resolved.`);
  }

  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      const loopback = address === "127.0.0.1" || address === "::1";
      if (loopback && allowLoopback) continue;
      throw new UnsafeUrlError(
        `${url.hostname} resolves to a private address (${address}). ` +
          `MCPfy only connects to publicly reachable endpoints.`,
      );
    }
  }

  return url;
}
