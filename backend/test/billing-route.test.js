const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const { createBillingRouter } = require("../routes/billing");
const { createRequireAuth } = require("../middleware/requireAuth");
const { createPlans } = require("../config/plans");

const PLAN_ENV = {
  POLAR_PRODUCT_ID_WEEKLY: "prod_weekly",
  POLAR_PRODUCT_ID_MONTHLY: "prod_monthly",
  POLAR_PRODUCT_ID_LIFETIME: "prod_lifetime",
};

async function withServer(
  { planEnv = PLAN_ENV, checkoutImpl, portalImpl, access } = {},
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
        return { uid: "real-1", email: "real@example.com", firebase: { sign_in_provider: "google.com" } };
      }
      throw new Error("invalid token");
    },
  });

  const calls = [];
  const createCheckout =
    checkoutImpl ??
    (async (args) => {
      calls.push(args);
      return { url: "https://polar.sh/checkout/test" };
    });

  const getCustomerPortalUrl =
    portalImpl ?? (async () => "https://polar.sh/portal/test");

  const getUserAccess = async () =>
    access ?? { entitled: false, polarCustomerId: null, tokensRemaining: 0 };

  app.use(
    "/billing",
    requireAuth,
    createBillingRouter({
      createCheckout,
      getCustomerPortalUrl,
      getUserAccess,
      getPlans: () => createPlans(planEnv),
      getAppOrigin: () => "https://app.example.com",
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
  return fetch(`${baseUrl}/billing/checkout`, { method: "POST", headers, body: JSON.stringify(body) });
}

function getPortal(baseUrl, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/billing/portal`, { headers });
}

test("token-less checkout is 401", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    assert.equal((await postCheckout(baseUrl, null, { planId: "weekly" })).status, 401);
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

test("happy path returns the checkout url and passes productId + uid + email", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await postCheckout(baseUrl, "real-token", { planId: "monthly" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, "https://polar.sh/checkout/test");
    assert.equal(body.planId, "monthly");
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].productId, "prod_monthly");
    assert.equal(state.calls[0].uid, "real-1");
    assert.equal(state.calls[0].email, "real@example.com");
    assert.equal(state.calls[0].embedOrigin, "https://app.example.com");
  });
});

test("unset product env is 500 BILLING_NOT_CONFIGURED", { concurrency: false }, async () => {
  await withServer({ planEnv: {} }, async (baseUrl) => {
    const res = await postCheckout(baseUrl, "real-token", { planId: "weekly" });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error.code, "BILLING_NOT_CONFIGURED");
  });
});

test("Polar API failure is 502 CHECKOUT_FAILED", { concurrency: false }, async () => {
  const failing = async () => {
    const err = new Error("Polar API error (500).");
    err.code = "POLAR_API_ERROR";
    throw err;
  };
  await withServer({ checkoutImpl: failing }, async (baseUrl) => {
    const res = await postCheckout(baseUrl, "real-token", { planId: "weekly" });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "CHECKOUT_FAILED");
  });
});

test("portal without token is 401; anonymous is 403", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    assert.equal((await getPortal(baseUrl, null)).status, 401);
    const anon = await getPortal(baseUrl, "anon-token");
    assert.equal(anon.status, 403);
    assert.equal((await anon.json()).error.code, "ANONYMOUS_FORBIDDEN");
  });
});

test("portal without a customer id is 404 NO_SUBSCRIPTION", { concurrency: false }, async () => {
  await withServer(
    { access: { entitled: true, polarCustomerId: null, tokensRemaining: 0 } },
    async (baseUrl) => {
      const res = await getPortal(baseUrl, "real-token");
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error.code, "NO_SUBSCRIPTION");
    }
  );
});

test("portal happy path returns a fresh customer portal url", { concurrency: false }, async () => {
  await withServer(
    { access: { entitled: true, polarCustomerId: "cus_1", tokensRemaining: 0 } },
    async (baseUrl) => {
      const res = await getPortal(baseUrl, "real-token");
      assert.equal(res.status, 200);
      assert.equal((await res.json()).url, "https://polar.sh/portal/test");
    }
  );
});

test("portal is 502 PORTAL_FAILED when the Polar fetch fails", { concurrency: false }, async () => {
  const failing = async () => {
    const err = new Error("Polar API error (500).");
    err.code = "POLAR_API_ERROR";
    throw err;
  };
  await withServer(
    { access: { entitled: true, polarCustomerId: "cus_1", tokensRemaining: 0 }, portalImpl: failing },
    async (baseUrl) => {
      const res = await getPortal(baseUrl, "real-token");
      assert.equal(res.status, 502);
      assert.equal((await res.json()).error.code, "PORTAL_FAILED");
    }
  );
});
