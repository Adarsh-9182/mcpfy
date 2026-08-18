import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { randomBytes } from "node:crypto";

process.env.SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const {
  seal,
  open,
  previewOf,
  generateApiKey,
  hashApiKey,
  signWebhook,
  verifyWebhookSignature,
} = await import("./crypto");

describe("secret sealing", () => {
  test("round-trips a value", () => {
    const sealed = seal("postgres://user:hunter2@db/prod");
    assert.equal(open(sealed), "postgres://user:hunter2@db/prod");
  });

  test("never stores the plaintext in any stored field", () => {
    const sealed = seal("hunter2-super-secret");
    for (const field of [sealed.ciphertext, sealed.iv, sealed.authTag]) {
      assert.equal(field.includes("hunter2"), false);
    }
  });

  test("uses a fresh IV so identical values differ at rest", () => {
    const a = seal("same-value");
    const b = seal("same-value");
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.notEqual(a.iv, b.iv);
  });

  test("a tampered ciphertext fails the auth tag rather than decrypting", () => {
    const sealed = seal("value");
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes.writeUInt8(bytes.readUInt8(0) ^ 0xff, 0);
    assert.throws(() =>
      open({ ...sealed, ciphertext: bytes.toString("base64") }),
    );
  });

  test("preview exposes at most the last four characters", () => {
    assert.equal(previewOf("sk-live-abcd1234"), "…1234");
    assert.equal(previewOf("abc"), "…");
  });
});

describe("api keys", () => {
  test("the hash is stored, the plaintext is not derivable from it", () => {
    const key = generateApiKey();
    assert.equal(key.keyHash, hashApiKey(key.plaintext));
    assert.equal(key.keyHash.includes(key.plaintext), false);
  });

  test("keys are unique across generations", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateApiKey().plaintext),
    );
    assert.equal(seen.size, 200);
  });

  test("prefix identifies the key without revealing it", () => {
    const key = generateApiKey();
    assert.ok(key.plaintext.startsWith(key.prefix));
    assert.ok(key.prefix.length < key.plaintext.length);
  });
});

describe("webhook signatures", () => {
  test("verifies a signature it produced", () => {
    const sig = signWebhook("whsec_1", '{"event":"deployment.completed"}');
    assert.ok(
      verifyWebhookSignature("whsec_1", '{"event":"deployment.completed"}', sig),
    );
  });

  test("rejects a different secret", () => {
    const sig = signWebhook("whsec_1", "{}");
    assert.equal(verifyWebhookSignature("whsec_2", "{}", sig), false);
  });

  test("rejects a modified payload", () => {
    const sig = signWebhook("whsec_1", '{"amount":1}');
    assert.equal(verifyWebhookSignature("whsec_1", '{"amount":9000}', sig), false);
  });

  test("rejects a replayed delivery outside the tolerance window", () => {
    const old = Date.now() - 10 * 60 * 1000;
    const sig = signWebhook("whsec_1", "{}", old);
    assert.equal(verifyWebhookSignature("whsec_1", "{}", sig), false);
  });

  test("accepts a recent delivery inside the tolerance window", () => {
    const recent = Date.now() - 30 * 1000;
    const sig = signWebhook("whsec_1", "{}", recent);
    assert.ok(verifyWebhookSignature("whsec_1", "{}", sig));
  });
});
