const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const { createBillingRouter } = require("../routes/billing");
const { createRequireAuth } = require("../middleware/requireAuth");
const { createPlans } = require("../config/plans");

const PLAN_ENV = {
  LEMONSQUEEZY_VARIANT_ID_WEEKLY: "111111",
  LEMONSQUEEZY_VARIANT_ID_MONTHLY: "222222",
  LEMONSQUEEZY_VARIANT_ID_LIFETIME: "333333",
};

// Builds a server: requireAuth (fake verify) -> billing router with fakes for
// the Lemon Squeezy API and the entitlement lookup.
async function withServer(
  { planEnv = PLAN_ENV, checkoutImpl, subscriptionImpl, access } = {},
  run
) {
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

  const getSubscription =
    subscriptionImpl ??
    (async () => ({
      status: "active",
      customerPortalUrl: "https://portal.lemonsqueezy.com/test",
    }));

  const getUserAccess = async () =>
    access ?? { entitled: false, subscriptionId: null, tokensRemaining: 0 };

  app.use(
    "/billing",
    requireAuth,
    createBillingRouter({
      createCheckout,
      getSubscription,
      getUserAccess,
      getPlans: () => createPlans(planEnv),
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

function postCheckout(baseUrl, token, body = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/billing/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getPortal(baseUrl, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/billing/portal`, { headers });
}

test("token-less checkout is 401", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const res = await postCheckout(baseUrl, null, { planId: "weekly" });
    assert.equal(res.status, 401);
  });
});

test("anonymous user is 403 ANONYMOUS_FORBIDDEN and no checkout is created", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await postCheckout(baseUrl, "anon-token", { planId: "weekly" });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "ANONYMOUS_FORBIDDEN");
    assert.equal(state.calls.length, 0);
  });
});

test("unknown planId is 400 UNKNOWN_PLAN", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await postCheckout(baseUrl, "real-token", { planId: "yearly" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "UNKNOWN_PLAN");
    assert.equal(state.calls.length, 0);
  });
});

test("missing body is 400 UNKNOWN_PLAN", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/billing/checkout`, {
      method: "POST",
      headers: { Authorization: "Bearer real-token" },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "UNKNOWN_PLAN");
  });
});

test("happy path returns the checkout url and passes variantId + uid + email", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await postCheckout(baseUrl, "real-token", { planId: "monthly" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, "https://checkout.lemonsqueezy.com/test");
    assert.equal(body.planId, "monthly");
    assert.deepEqual(state.calls, [
      { variantId: "222222", uid: "real-1", email: "real@example.com" },
    ]);
  });
});

test("unset variant env is 500 BILLING_NOT_CONFIGURED", { concurrency: false }, async () => {
  await withServer({ planEnv: {} }, async (baseUrl) => {
    const res = await postCheckout(baseUrl, "real-token", { planId: "weekly" });
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
    const res = await postCheckout(baseUrl, "real-token", { planId: "weekly" });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "CHECKOUT_FAILED");
  });
});

// --- portal ---

test("portal without token is 401; anonymous is 403", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    assert.equal((await getPortal(baseUrl, null)).status, 401);
    const anon = await getPortal(baseUrl, "anon-token");
    assert.equal(anon.status, 403);
    assert.equal((await anon.json()).error.code, "ANONYMOUS_FORBIDDEN");
  });
});

test("portal without a subscription is 404 NO_SUBSCRIPTION", { concurrency: false }, async () => {
  await withServer(
    { access: { entitled: true, subscriptionId: null, tokensRemaining: 0 } },
    async (baseUrl) => {
      const res = await getPortal(baseUrl, "real-token");
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error.code, "NO_SUBSCRIPTION");
    }
  );
});

test("portal happy path returns a fresh customer portal url", { concurrency: false }, async () => {
  await withServer(
    { access: { entitled: true, subscriptionId: "sub-1", tokensRemaining: 0 } },
    async (baseUrl) => {
      const res = await getPortal(baseUrl, "real-token");
      assert.equal(res.status, 200);
      assert.equal((await res.json()).url, "https://portal.lemonsqueezy.com/test");
    }
  );
});

test("portal is 502 PORTAL_FAILED when the Lemon Squeezy fetch fails", { concurrency: false }, async () => {
  const failing = async () => {
    const err = new Error("Lemon Squeezy API error (500).");
    err.code = "LEMONSQUEEZY_API_ERROR";
    throw err;
  };
  await withServer(
    {
      access: { entitled: true, subscriptionId: "sub-1", tokensRemaining: 0 },
      subscriptionImpl: failing,
    },
    async (baseUrl) => {
      const res = await getPortal(baseUrl, "real-token");
      assert.equal(res.status, 502);
      assert.equal((await res.json()).error.code, "PORTAL_FAILED");
    }
  );
});
