import { createSign } from "node:crypto";

/**
 * GitHub App authentication.
 *
 * Two tokens, and confusing them is the usual mistake. The *app* JWT is
 * signed with the private key and proves "I am this app"; it can only list
 * installations. An *installation* token is minted per installation and is
 * what actually reads a repository. Installation tokens expire after an hour,
 * so they are cached with a margin rather than minted per request.
 */

export interface AppCredentials {
  appId: string;
  /** PEM private key, as downloaded from GitHub. */
  privateKey: string;
}

/** Base64url without padding, which is what JWT requires. */
function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Signs an app JWT (RS256).
 *
 * `iat` is backdated by a minute: GitHub rejects a token whose issued-at is in
 * the future, and a small clock skew between our host and theirs is enough to
 * cause that intermittently.
 */
export function appJwt(credentials: AppCredentials, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iat: issuedAt,
      exp: issuedAt + 540, // 9 minutes; GitHub's ceiling is 10.
      iss: credentials.appId,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();

  const signature = b64url(signer.sign(normalisePem(credentials.privateKey)));
  return `${header}.${payload}.${signature}`;
}

/**
 * Environment variables mangle PEM newlines in several ways depending on how
 * they were set, and a key with literal "\n" fails signing with an error that
 * says nothing useful. Normalising here means one confusing failure mode less.
 */
export function normalisePem(key: string): string {
  const cleaned = key.trim().replace(/\\n/g, "\n");
  if (!cleaned.includes("-----BEGIN")) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY does not look like a PEM key. Paste the whole " +
        "file, including the BEGIN and END lines.",
    );
  }
  return cleaned;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

type Fetcher = typeof fetch;

const API = "https://api.github.com";

const HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "mcpfy",
};

/** Mints an installation token. Callers should cache it; see `TokenCache`. */
export async function mintInstallationToken(
  credentials: AppCredentials,
  installationId: string,
  fetchImpl: Fetcher = fetch,
): Promise<InstallationToken> {
  const response = await fetchImpl(
    `${API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: { ...HEADERS, authorization: `Bearer ${appJwt(credentials)}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub refused to mint a token for installation ${installationId} ` +
        `(${response.status}). The app may have been uninstalled, or its ` +
        `credentials may be wrong.`,
    );
  }

  const body = (await response.json()) as { token: string; expires_at: string };
  return { token: body.token, expiresAt: new Date(body.expires_at) };
}

/**
 * Caches installation tokens until shortly before they expire.
 *
 * The margin matters: a token that expires mid-request produces a 401 from an
 * operation that looked fine when it started.
 */
export class TokenCache {
  private readonly cache = new Map<string, InstallationToken>();
  private readonly marginMs = 5 * 60 * 1000;

  constructor(
    private readonly credentials: AppCredentials,
    private readonly fetchImpl: Fetcher = fetch,
  ) {}

  async get(installationId: string): Promise<string> {
    const existing = this.cache.get(installationId);
    if (existing && existing.expiresAt.getTime() - Date.now() > this.marginMs) {
      return existing.token;
    }

    const minted = await mintInstallationToken(
      this.credentials,
      installationId,
      this.fetchImpl,
    );
    this.cache.set(installationId, minted);
    return minted.token;
  }

  forget(installationId: string): void {
    this.cache.delete(installationId);
  }
}

export { API as GITHUB_API, HEADERS as GITHUB_HEADERS };
