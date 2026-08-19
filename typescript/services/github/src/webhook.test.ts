import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { parseEvent, shouldDeploy, verifySignature } from "./webhook";
import { appJwt, normalisePem, TokenCache } from "./app-auth";
import { GitHubClient } from "./client";

const SECRET = "whsec_test";
const sign = (payload: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`;

describe("webhook signatures", () => {
  test("accepts a signature it can reproduce", () => {
    const payload = '{"ref":"refs/heads/main"}';
    assert.deepEqual(verifySignature(payload, sign(payload), SECRET), { ok: true });
  });

  test("rejects a payload that was altered in flight", () => {
    // The whole point: without this, anyone who learns the URL can make
    // MCPfy build and run whatever they like.
    const signed = sign('{"ref":"refs/heads/main"}');
    const result = verifySignature('{"ref":"refs/heads/attacker"}', signed, SECRET);
    assert.equal(result.ok, false);
  });

  test("rejects a signature made with a different secret", () => {
    const payload = "{}";
    const result = verifySignature(payload, sign(payload, "wrong"), SECRET);
    assert.equal(result.ok, false);
  });

  test("rejects a missing header rather than passing it through", () => {
    assert.equal(verifySignature("{}", null, SECRET).ok, false);
  });

  test("refuses the legacy sha1 header", () => {
    // Accepting it would silently downgrade the check to a weaker hash.
    const result = verifySignature("{}", "sha1=abc123", SECRET);
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /sha256/);
  });

  test("refuses to verify when no secret is configured", () => {
    // An unset secret must fail closed. Failing open would mean a
    // misconfigured deployment silently accepts every caller.
    const payload = "{}";
    assert.equal(verifySignature(payload, sign(payload), "").ok, false);
  });

  test("a truncated signature does not throw", () => {
    assert.equal(verifySignature("{}", "sha256=ab", SECRET).ok, false);
  });
});

describe("event parsing", () => {
  const push = (over: Record<string, unknown> = {}) =>
    parseEvent("push", {
      ref: "refs/heads/main",
      after: "8f31d2ac0ffee1234567890abcdef1234567890a",
      deleted: false,
      installation: { id: 4242 },
      repository: { id: 99, full_name: "acme/customer-mcp" },
      head_commit: { message: "Add search tool\n\nlonger body" },
      pusher: { name: "ada" },
      ...over,
    });

  test("reads what a push needs to become a deployment", () => {
    const event = push();
    assert.equal(event.kind, "push");
    if (event.kind !== "push") return;
    assert.equal(event.branch, "main");
    assert.equal(event.installationId, "4242");
    assert.equal(event.repositoryFullName, "acme/customer-mcp");
    // Only the subject line: a commit body can be arbitrarily long.
    assert.equal(event.commitMessage, "Add search tool");
  });

  test("a tag push is not a branch push", () => {
    assert.equal(push({ ref: "refs/tags/v1.0.0" }).kind, "ignored");
  });

  test("unknown events are ignored, not errors", () => {
    // A webhook endpoint that 500s on events it does not handle gets
    // disabled by GitHub after enough failures.
    for (const name of ["star", "issues", "check_run", null]) {
      assert.equal(parseEvent(name, {}).kind, "ignored", String(name));
    }
  });

  test("ping is recognised so the setup check succeeds", () => {
    assert.equal(parseEvent("ping", {}).kind, "ignored");
  });

  test("installation events carry the account and selection", () => {
    const event = parseEvent("installation", {
      action: "created",
      installation: {
        id: 4242,
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
      },
    });
    assert.equal(event.kind, "installation");
    if (event.kind !== "installation") return;
    assert.equal(event.accountLogin, "acme");
    assert.equal(event.accountType, "Organization");
  });

  test("a malformed payload does not throw", () => {
    assert.doesNotThrow(() => parseEvent("push", null));
    assert.doesNotThrow(() => parseEvent("push", { ref: 12345 }));
  });
});

describe("deciding whether to build", () => {
  const event = (over: Record<string, unknown> = {}) =>
    ({
      kind: "push" as const,
      installationId: "1",
      repositoryFullName: "acme/x",
      repositoryId: "1",
      branch: "main",
      commitSha: "8f31d2a",
      commitMessage: null,
      pusher: null,
      deleted: false,
      ...over,
    });

  test("builds a push to the production branch", () => {
    assert.equal(shouldDeploy(event(), "main").deploy, true);
  });

  test("does not build another branch", () => {
    const result = shouldDeploy(event({ branch: "feature/x" }), "main");
    assert.equal(result.deploy, false);
    assert.match(result.reason, /feature\/x/);
  });

  test("does not build a deletion", () => {
    // Deploying a deleted branch would build whatever the last commit was
    // and call it production.
    assert.equal(shouldDeploy(event({ deleted: true }), "main").deploy, false);
  });

  test("does not build a branch creation pointing at nothing", () => {
    assert.equal(
      shouldDeploy(event({ commitSha: "0000000000000000000000000000000000000000" }), "main")
        .deploy,
      false,
    );
  });
});

describe("app authentication", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  test("signs a JWT with the shape GitHub expects", () => {
    const token = appJwt({ appId: "12345", privateKey });
    const [header, payload, signature] = token.split(".");
    assert.ok(signature && signature.length > 100);

    const decoded = JSON.parse(Buffer.from(header!, "base64url").toString());
    assert.equal(decoded.alg, "RS256");

    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    assert.equal(claims.iss, "12345");
    assert.ok(claims.exp - claims.iat <= 600, "GitHub caps the lifetime at 10 minutes");
  });

  test("backdates iat so a clock skew does not reject the token", () => {
    const now = Date.now();
    const token = appJwt({ appId: "1", privateKey }, now);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString(),
    );
    assert.ok(claims.iat < Math.floor(now / 1000));
  });

  test("repairs a PEM whose newlines were escaped by an env var", () => {
    const escaped = privateKey.replace(/\n/g, "\\n");
    assert.ok(normalisePem(escaped).includes("\n-----END"));
    assert.doesNotThrow(() => appJwt({ appId: "1", privateKey: escaped }));
  });

  test("a key that is not a key says so, rather than failing in the signer", () => {
    assert.throws(
      () => normalisePem("not-a-key"),
      /does not look like a PEM key/,
    );
  });

  test("caches a token until shortly before it expires", async () => {
    let mints = 0;
    const fetchImpl = (async () => {
      mints++;
      return new Response(
        JSON.stringify({
          token: "ghs_token",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    const cache = new TokenCache({ appId: "1", privateKey }, fetchImpl);
    await cache.get("4242");
    await cache.get("4242");
    await cache.get("4242");

    assert.equal(mints, 1, "should have minted once and reused it");
  });

  test("re-mints a token that is about to expire", async () => {
    let mints = 0;
    const fetchImpl = (async () => {
      mints++;
      return new Response(
        JSON.stringify({
          token: "ghs_token",
          // Inside the safety margin: a token expiring mid-request produces
          // a 401 from an operation that looked fine when it started.
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        { status: 201 },
      );
    }) as unknown as typeof fetch;

    const cache = new TokenCache({ appId: "1", privateKey }, fetchImpl);
    await cache.get("4242");
    await cache.get("4242");
    assert.equal(mints, 2);
  });

  test("an uninstalled app produces a message that says so", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 404 })) as unknown as typeof fetch;
    const cache = new TokenCache({ appId: "1", privateKey }, fetchImpl);
    await assert.rejects(() => cache.get("4242"), /uninstalled/);
  });
});

describe("reading a repository through the API", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  function client(routes: Record<string, unknown>) {
    const fetchImpl = (async (url: string | URL) => {
      const path = String(url).replace("https://api.github.com", "");
      if (path.includes("/access_tokens")) {
        return new Response(
          JSON.stringify({
            token: "ghs_x",
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          }),
          { status: 201 },
        );
      }
      const match = Object.entries(routes).find(([key]) => path.startsWith(key));
      return match
        ? new Response(JSON.stringify(match[1]), { status: 200 })
        : new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    return new GitHubClient(
      new TokenCache({ appId: "1", privateKey }, fetchImpl),
      "4242",
      fetchImpl,
    );
  }

  test("reads a file so detection can run without cloning", async () => {
    const tree = client({
      "/repos/acme/x/contents/package.json": {
        encoding: "base64",
        content: Buffer.from('{"name":"x"}').toString("base64"),
      },
    }).tree("acme/x", "main");

    assert.equal(await tree.read("package.json"), '{"name":"x"}');
  });

  test("a missing file reads as null, not an error", async () => {
    const tree = client({}).tree("acme/x", "main");
    assert.equal(await tree.read("pyproject.toml"), null);
  });

  test("lists a directory", async () => {
    const tree = client({
      "/repos/acme/x/contents/": [{ name: "package.json" }, { name: "src" }],
    }).tree("acme/x", "main");

    assert.deepEqual(await tree.list("."), ["package.json", "src"]);
  });

  test("a clone URL carries the token, not the app key", async () => {
    const url = await client({}).cloneUrl("acme/x");
    assert.match(url, /^https:\/\/x-access-token:ghs_x@github\.com\/acme\/x\.git$/);
  });
});
