import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * §25 — secrets at rest.
 *
 * AES-256-GCM with a per-secret IV. The key comes from SECRET_ENCRYPTION_KEY
 * (32 bytes, base64) and exists only in the server environment — it is never
 * bundled, never sent to the browser, and never written to the database
 * alongside the ciphertext it protects.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  preview: string;
}

function encryptionKey(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY is not set. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SECRET_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}.`,
    );
  }
  return key;
}

/** Last 4 characters only — enough to recognise a value, useless to steal. */
export function previewOf(value: string): string {
  return value.length <= 4 ? "…" : `…${value.slice(-4)}`;
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    preview: previewOf(plaintext),
  };
}

export function open(sealed: Omit<SealedSecret, "preview">): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* ---------------------------------------------------------------- API keys */

const KEY_PREFIX_LIVE = "mcpfy_live_";

export interface GeneratedApiKey {
  /** Shown to the user exactly once. Never stored. */
  plaintext: string;
  keyHash: string;
  prefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const plaintext = KEY_PREFIX_LIVE + randomBytes(24).toString("base64url");
  return {
    plaintext,
    keyHash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, KEY_PREFIX_LIVE.length + 4),
  };
}

/** SHA-256 is correct here: the input is 192 bits of CSPRNG output, so there
 *  is nothing for a slow KDF to protect against, and lookups happen on every
 *  API request. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * §39 — signature header for outgoing webhook deliveries.
 *
 * The timestamp is inside the signed string so a captured delivery cannot be
 * replayed later; receivers should reject signatures older than a few minutes.
 */
export function signWebhook(
  secret: string,
  payload: string,
  timestamp: number = Date.now(),
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  header: string,
  toleranceMs = 5 * 60 * 1000,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > toleranceMs) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return safeEqual(expected, parts.v1 ?? "");
}
