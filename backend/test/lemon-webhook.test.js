const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const { once } = require("node:events");

const { createLemonWebhookRouter } = require("../routes/lemonWebhook");
const { createCreditPacks } = require("../config/creditPacks");

const SECRET = "test-webhook-secret";
const PACK_ENV = {
  LEMONSQUEEZY_VARIANT_ID_SMALL: "111111",
  LEMONSQUEEZY_VARIANT_ID_MEDIUM: "222222",
  LEMONSQUEEZY_VARIANT_ID_LARGE: "333333",
};

function sign(body, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// Builds a server with the SAME mount ordering as index.js — the raw-body
// webhook route registered before the global express.json() — to prove the
// signature survives that ordering. Grants/revokes are faked in-memory with
// the real services' idempotency semantics.
async function withServer({ balances = {}, orders = {} } = {}, run) {
  const app = express();

  const grantOrderTokensOnce = async ({ uid, amount, orderId, meta = {} }) => {
    if (orders[orderId]) return { granted: false, reason: "ALREADY_PROCESSED" };
    balances[uid] = (balances[uid] ?? 0) + amount;
    orders[orderId] = { uid, credits: amount, ...meta };
    return { granted: true, newBalance: balances[uid] };
  };

  const revokeOrderTokensOnce = async ({ orderId }) => {
    const order = orders[orderId];
    if (!order) return { revoked: false, reason: "ORDER_NOT_FOUND" };
    if (order.refundedAt) return { revoked: false, reason: "ALREADY_REFUNDED" };
    balances[order.uid] = Math.max(0, (balances[order.uid] ?? 0) - order.credits);
    order.refundedAt = new Date().toISOString();
    return { revoked: true, newBalance: balances[order.uid] };
  };

  app.use(
    "/webhooks/lemonsqueezy",
    express.raw({ type: "*/*" }),
    createLemonWebhookRouter({
      getWebhookSecret: () => SECRET,
      grantOrderTokensOnce,
      revokeOrderTokensOnce,
      getPacks: () => createCreditPacks(PACK_ENV),
    })
  );
  app.use(express.json());

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl, { balances, orders });
  } finally {
    server.close();
    await once(server, "close");
  }
}

function post(baseUrl, body, signature) {
  const headers = { "Content-Type": "application/json" };
  if (signature !== null) headers["X-Signature"] = signature;
  return fetch(`${baseUrl}/webhooks/lemonsqueezy`, {
    method: "POST",
    headers,
    body,
  });
}

function orderCreatedBody({
  uid = "user-1",
  orderId = "999001",
  status = "paid",
  variantId = 111111,
  customData = uid ? { user_id: uid } : undefined,
} = {}) {
  return JSON.stringify({
    meta: { event_name: "order_created", custom_data: customData },
    data: {
      id: orderId,
      attributes: {
        status,
        test_mode: true,
        first_order_item: { variant_id: variantId },
      },
    },
  });
}

test("valid paid order grants pack credits and records the order", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody({ variantId: 111111 });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.equal(state.balances["user-1"], 25);
    assert.equal(state.orders["999001"].packId, "small");
    assert.equal(state.orders["999001"].testMode, true);
  });
});

test("duplicate delivery of the same order does not double-grant", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody({ variantId: 222222 });
    assert.equal((await post(baseUrl, body, sign(body))).status, 200);
    assert.equal(state.balances["user-1"], 75);

    const second = await post(baseUrl, body, sign(body));
    assert.equal(second.status, 200);
    assert.equal(state.balances["user-1"], 75);
  });
});

test("missing signature is rejected with 400 and nothing is granted", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, orderCreatedBody(), null);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_SIGNATURE");
    assert.deepEqual(state.balances, {});
  });
});

test("signature over different bytes (tampered body) is rejected", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const original = orderCreatedBody({ variantId: 111111 });
    const tampered = orderCreatedBody({ variantId: 333333 });
    const res = await post(baseUrl, tampered, sign(original));
    assert.equal(res.status, 400);
    assert.deepEqual(state.balances, {});
  });
});

test("signature with the wrong secret is rejected", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody();
    const res = await post(baseUrl, body, sign(body, "wrong-secret"));
    assert.equal(res.status, 400);
    assert.deepEqual(state.balances, {});
  });
});

test("unknown variant acks 200 but grants nothing and records no order (resend stays possible)", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody({ variantId: 555555 });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.balances, {});
    assert.deepEqual(state.orders, {});
  });
});

test("order without custom_data uid acks 200 without granting", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody({ uid: null });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.balances, {});
  });
});

test("unpaid order status acks 200 without granting", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody({ status: "pending" });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.balances, {});
  });
});

test("order_refunded revokes once; a second delivery is a no-op", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const created = orderCreatedBody({ variantId: 111111 });
    await post(baseUrl, created, sign(created));
    assert.equal(state.balances["user-1"], 25);

    const refund = JSON.stringify({
      meta: { event_name: "order_refunded" },
      data: { id: "999001", attributes: { status: "refunded" } },
    });
    assert.equal((await post(baseUrl, refund, sign(refund))).status, 200);
    assert.equal(state.balances["user-1"], 0);

    assert.equal((await post(baseUrl, refund, sign(refund))).status, 200);
    assert.equal(state.balances["user-1"], 0);
  });
});

test("valid signature over a non-JSON body is 400 INVALID_PAYLOAD", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const body = "not json at all";
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_PAYLOAD");
  });
});

test("unrelated events are acked with 200", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = JSON.stringify({
      meta: { event_name: "subscription_created" },
      data: { id: "1" },
    });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.balances, {});
  });
});
