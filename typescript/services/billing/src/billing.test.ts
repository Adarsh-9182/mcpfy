import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHmac } from "node:crypto";
import { PLANS, planOf, isUpgrade } from "./plans";
import { check, meters, type Usage } from "./entitlements";
import {
  createCheckoutSession,
  isActive,
  parseEvent,
  planForPrice,
  verifyWebhook,
  type StripeConfig,
} from "./stripe";

const usage = (over: Partial<Usage> = {}): Usage => ({
  servers: 0,
  requestsThisPeriod: 0,
  members: 1,
  ...over,
});

describe("plans", () => {
  test("an unknown plan falls back to free instead of throwing", () => {
    // A drifted billing record must not lock someone out of their dashboard.
    assert.equal(planOf("enterprise-plus").id, "free");
    assert.equal(planOf(null).id, "free");
  });

  test("limits are null for unlimited, never a large number", () => {
    // Infinity does not survive JSON and 999999 becomes a support ticket.
    assert.equal(PLANS.startup.limits.servers, null);
    assert.equal(PLANS.enterprise.limits.requestsPerMonth, null);
  });

  test("every paid plan includes everything below it", () => {
    const order = ["free", "hobby", "startup"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = PLANS[order[i - 1]!].limits;
      const higher = PLANS[order[i]!].limits;
      const atLeast = (a: number | null, b: number | null) =>
        a === null ? true : b !== null && a >= b;

      assert.ok(atLeast(higher.servers, lower.servers), order[i]);
      assert.ok(atLeast(higher.members, lower.members), order[i]);
      assert.ok(higher.retentionDays >= lower.retentionDays, order[i]);
    }
  });

  test("upgrade ordering is by tier, not price", () => {
    assert.ok(isUpgrade("free", "hobby"));
    assert.ok(isUpgrade("hobby", "enterprise"));
    assert.equal(isUpgrade("startup", "hobby"), false);
    assert.equal(isUpgrade("free", "free"), false);
  });
});

describe("entitlements", () => {
  test("allows a server under the limit", () => {
    assert.equal(check("free", { kind: "create_server" }, usage({ servers: 1 })).allowed, true);
  });

  test("refuses at the limit, and names the plan that would allow it", () => {
    const decision = check("free", { kind: "create_server" }, usage({ servers: 2 }));
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.match(decision.reason, /Free plan includes 2 servers/);
    assert.equal(decision.upgradeTo, "hobby");
  });

  test("suggests the cheapest sufficient plan, not the most expensive", () => {
    // Pointing everyone at Enterprise is how an upgrade prompt becomes noise.
    const decision = check("free", { kind: "invite_member" }, usage({ members: 1 }));
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.upgradeTo, "hobby");
  });

  test("skips a tier that would not actually help", () => {
    const decision = check("hobby", { kind: "create_server" }, usage({ servers: 10 }));
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.upgradeTo, "startup");
  });

  test("deploying is never blocked by usage", () => {
    // Cutting off the ability to ship a fix because traffic was high is the
    // opposite of what someone in that situation needs.
    const decision = check(
      "free",
      { kind: "deploy" },
      usage({ requestsThisPeriod: 10_000_000, servers: 99 }),
    );
    assert.equal(decision.allowed, true);
  });

  test("feature flags are refused with an upgrade target", () => {
    const preview = check("free", { kind: "use_preview_environments" }, usage());
    assert.equal(preview.allowed, false);
    if (preview.allowed) return;
    assert.equal(preview.upgradeTo, "hobby");

    assert.equal(
      check("hobby", { kind: "use_preview_environments" }, usage()).allowed,
      true,
    );
  });

  test("an unlimited plan allows everything countable", () => {
    for (const action of [
      { kind: "create_server" } as const,
      { kind: "invite_member" } as const,
      { kind: "add_custom_domain" } as const,
    ]) {
      assert.equal(
        check("enterprise", action, usage({ servers: 5000, members: 900 })).allowed,
        true,
        action.kind,
      );
    }
  });
});

describe("meters", () => {
  test("warns at 80 percent, not at 100", () => {
    // Warning at 100 is not a warning, it is a notification of something
    // that already happened.
    const [servers] = meters("hobby", usage({ servers: 8 }));
    assert.equal(servers!.state, "approaching");
  });

  test("marks exceeded when over", () => {
    const [servers] = meters("free", usage({ servers: 3 }));
    assert.equal(servers!.state, "exceeded");
    assert.equal(servers!.fraction, 1, "never reports over 100 percent");
  });

  test("an unlimited meter has no fraction and is never alarming", () => {
    const [servers] = meters("startup", usage({ servers: 4000 }));
    assert.equal(servers!.limit, null);
    assert.equal(servers!.fraction, null);
    assert.equal(servers!.state, "ok");
  });
});

describe("stripe webhooks", () => {
  const SECRET = "whsec_test";
  const sign = (payload: string, at = Date.now(), secret = SECRET) => {
    const t = Math.floor(at / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
    return `t=${t},v1=${v1}`;
  };

  test("accepts a signature it can reproduce", () => {
    const payload = '{"type":"customer.subscription.updated"}';
    assert.deepEqual(verifyWebhook(payload, sign(payload), SECRET), { ok: true });
  });

  test("refuses a forged body", () => {
    // Without this, anyone who finds the URL can grant themselves enterprise
    // by posting JSON.
    const signed = sign('{"type":"a"}');
    assert.equal(verifyWebhook('{"type":"b"}', signed, SECRET).ok, false);
  });

  test("refuses a replayed event", () => {
    const payload = "{}";
    const old = Date.now() - 20 * 60 * 1000;
    assert.equal(verifyWebhook(payload, sign(payload, old), SECRET).ok, false);
  });

  test("fails closed when no secret is configured", () => {
    const payload = "{}";
    assert.equal(verifyWebhook(payload, sign(payload), "").ok, false);
  });

  test("refuses a malformed header instead of throwing", () => {
    assert.equal(verifyWebhook("{}", "garbage", SECRET).ok, false);
    assert.equal(verifyWebhook("{}", "t=abc,v1=def", SECRET).ok, false);
  });
});

describe("stripe events", () => {
  const prices = { hobby: "price_hobby", startup: "price_startup" };

  test("reads a plan change", () => {
    const event = parseEvent(
      {
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            cancel_at_period_end: false,
            current_period_end: 1800000000,
            items: { data: [{ price: { id: "price_startup" } }] },
          },
        },
      },
      prices,
    );

    assert.equal(event.kind, "subscription");
    if (event.kind !== "subscription") return;
    assert.equal(event.planId, "startup");
    assert.equal(event.customerId, "cus_1");
    assert.ok(event.currentPeriodEnd instanceof Date);
  });

  test("an unknown price maps to null rather than a guess", () => {
    // A mismatched price usually means test and live keys crossed. Guessing
    // there grants or revokes access on bad data.
    assert.equal(planForPrice("price_from_another_account", prices), null);
    assert.equal(planForPrice(undefined, prices), null);
  });

  test("cancellation is its own event", () => {
    const event = parseEvent(
      { type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1" } } },
      prices,
    );
    assert.equal(event.kind, "ended");
  });

  test("unhandled types are ignored, not errors", () => {
    for (const type of ["invoice.paid", "charge.succeeded", "payout.created"]) {
      assert.equal(parseEvent({ type, data: { object: {} } }, prices).kind, "ignored", type);
    }
    assert.doesNotThrow(() => parseEvent(null, prices));
  });

  test("access continues while a payment is being retried", () => {
    // Cutting a customer off the hour a card expires turns a renewal problem
    // into a cancellation.
    assert.equal(isActive("past_due"), true);
    assert.equal(isActive("trialing"), true);
    assert.equal(isActive("active"), true);
    assert.equal(isActive("canceled"), false);
    assert.equal(isActive("incomplete_expired"), false);
  });
});

describe("checkout", () => {
  const config: StripeConfig = {
    secretKey: "sk_test",
    webhookSecret: "whsec",
    prices: { hobby: "price_hobby" },
  };

  const request = {
    planId: "hobby" as const,
    organizationId: "org_1",
    organizationName: "Acme",
    customerEmail: "ada@example.com",
    successUrl: "https://mcpfy.test/app/settings/billing?upgraded=1",
    cancelUrl: "https://mcpfy.test/pricing",
  };

  test("carries the organization id so the webhook needs no lookup table", async () => {
    let sent = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      return new Response(JSON.stringify({ url: "https://checkout.stripe.com/x" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await createCheckoutSession(config, request, fetchImpl);
    assert.equal(result.url, "https://checkout.stripe.com/x");

    const form = new URLSearchParams(sent);
    assert.equal(form.get("subscription_data[metadata][organizationId]"), "org_1");
    assert.equal(form.get("line_items[0][price]"), "price_hobby");
    assert.equal(form.get("customer_email"), "ada@example.com");
  });

  test("reuses an existing customer instead of creating a duplicate", async () => {
    let sent = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      return new Response(JSON.stringify({ url: "https://x" }), { status: 200 });
    }) as unknown as typeof fetch;

    await createCheckoutSession(
      config,
      { ...request, existingCustomerId: "cus_9" },
      fetchImpl,
    );

    const form = new URLSearchParams(sent);
    assert.equal(form.get("customer"), "cus_9");
    assert.equal(form.get("customer_email"), null);
  });

  test("a missing price names the variable to set", async () => {
    await assert.rejects(
      () => createCheckoutSession(config, { ...request, planId: "startup" }, fetch),
      /STRIPE_PRICE_STARTUP/,
    );
  });

  test("a Stripe error surfaces Stripe's message", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "No such price" } }), {
        status: 400,
      })) as unknown as typeof fetch;

    await assert.rejects(
      () => createCheckoutSession(config, request, fetchImpl),
      /No such price/,
    );
  });
});
