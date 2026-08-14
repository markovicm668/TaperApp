const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const { createBillingRouter } = require("../routes/billing");
const { createRequireAuth } = require("../middleware/requireAuth");
const { createCreditPacks } = require("../config/creditPacks");

const PACK_ENV = {
  LEMONSQUEEZY_VARIANT_ID_SMALL: "111111",
  LEMONSQUEEZY_VARIANT_ID_MEDIUM: "222222",
  LEMONSQUEEZY_VARIANT_ID_LARGE: "333333",
};

// Builds a server: requireAuth (fake verify) -> billing router with a fake
// Lemon Squeezy createCheckout that records what it was called with.
async function withServer({ packEnv = PACK_ENV, checkoutImpl } = {}, run) {
  const app = express();
  app.use(express.json());

  const requireAuth = createRequireAuth({
    verifyIdToken: async (token) => {
      if (token === "anon-token") {
        return { uid: "anon-1", firebase: { sign_in_provider: "anonymous" } };
      }
      if (token === "real-token") {
        return {
          uid: "real-1",
          email: "real@example.com",
          firebase: { sign_in_provider: "google.com" },
        };
      }
      throw new Error("invalid token");
    },
  });

  const calls = [];
  const createCheckout =
    checkoutImpl ??
    (async (args) => {
      calls.push(args);
      return { url: "https://checkout.lemonsqueezy.com/test" };
    });

  app.use(
    "/billing",
    requireAuth,
    createBillingRouter({
      createCheckout,
      getPacks: () => createCreditPacks(packEnv),
    })
  );

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl, { calls });
  } finally {
    server.close();
    await once(server, "close");
  }
}

function post(baseUrl, token, body = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/billing/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("token-less checkout is 401", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const res = await post(baseUrl, null, { packId: "small" });
    assert.equal(res.status, 401);
  });
});

test("anonymous user is 403 ANONYMOUS_FORBIDDEN and no checkout is created", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, "anon-token", { packId: "small" });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "ANONYMOUS_FORBIDDEN");
    assert.equal(state.calls.length, 0);
  });
});

test("unknown packId is 400 UNKNOWN_PACK", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, "real-token", { packId: "mega" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "UNKNOWN_PACK");
    assert.equal(state.calls.length, 0);
  });
});

test("missing body is 400 UNKNOWN_PACK", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/billing/checkout`, {
      method: "POST",
      headers: { Authorization: "Bearer real-token" },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "UNKNOWN_PACK");
  });
});

test("happy path returns the checkout url and passes variantId + uid + email", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, "real-token", { packId: "medium" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, "https://checkout.lemonsqueezy.com/test");
    assert.equal(body.packId, "medium");
    assert.deepEqual(state.calls, [
      { variantId: "222222", uid: "real-1", email: "real@example.com" },
    ]);
  });
});

test("unset variant env is 500 BILLING_NOT_CONFIGURED", { concurrency: false }, async () => {
  await withServer({ packEnv: {} }, async (baseUrl) => {
    const res = await post(baseUrl, "real-token", { packId: "small" });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error.code, "BILLING_NOT_CONFIGURED");
  });
});

test("Lemon Squeezy API failure is 502 CHECKOUT_FAILED", { concurrency: false }, async () => {
  const failing = async () => {
    const err = new Error("Lemon Squeezy API error (500).");
    err.code = "LEMONSQUEEZY_API_ERROR";
    throw err;
  };
  await withServer({ checkoutImpl: failing }, async (baseUrl) => {
    const res = await post(baseUrl, "real-token", { packId: "small" });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "CHECKOUT_FAILED");
  });
});
