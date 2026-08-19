const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");
const { Webhook } = require("standardwebhooks");

const {
  createPolarWebhookRouter,
  defaultVerifyEvent,
} = require("../routes/polarWebhook");
const { createPlans } = require("../config/plans");
const { computeEntitlement } = require("../services/entitlementService");

// Polar's raw webhook secret is a plain string; the route base64-encodes it for
// standardwebhooks. We sign in-test with the same normalized secret and use the
// REAL defaultVerifyEvent, so this exercises the actual verification path.
const RAW_SECRET = "polar-test-secret";
const wh = new Webhook(Buffer.from(RAW_SECRET).toString("base64"));

const PLAN_ENV = {
  POLAR_PRODUCT_ID_WEEKLY: "prod_weekly",
  POLAR_PRODUCT_ID_MONTHLY: "prod_monthly",
  POLAR_PRODUCT_ID_LIFETIME: "prod_lifetime",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

function signedHeaders(msgId, payload) {
  const now = new Date();
  return {
    "webhook-id": msgId,
    "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
    "webhook-signature": wh.sign(msgId, now, payload),
  };
}

// In-memory reimplementation of the (new, provider-neutral) purchaseService
// semantics, so event branching + expiry mapping is exercised without Firestore.
async function withServer({ users = {}, subs = {}, orders = {}, remoteSubs = {} } = {}, run) {
  const app = express();

  const applySubscriptionState = async ({ uid, subscriptionId, planId, status, planExpiresAt, updatedAt, raw = {} }) => {
    const sub = subs[subscriptionId] || {};
    const resolvedUid = uid || sub.uid;
    if (!resolvedUid) return { applied: false, reason: "NO_UID" };
    if (sub.updatedAt && updatedAt.getTime() < sub.updatedAt.getTime()) {
      return { applied: false, reason: "STALE_EVENT" };
    }
    subs[subscriptionId] = { ...sub, uid: resolvedUid, planId, status, planExpiresAt, updatedAt, ...raw };
    const user = users[resolvedUid] || {};
    const customerPatch = raw.polarCustomerId ? { polarCustomerId: raw.polarCustomerId } : {};
    if (user.plan === "lifetime") {
      users[resolvedUid] = { ...user, subscriptionId, subscriptionStatus: status, ...customerPatch };
      return { applied: true };
    }
    const newEntitles = Boolean(planExpiresAt && planExpiresAt.getTime() > Date.now());
    if (
      user.subscriptionId &&
      user.subscriptionId !== subscriptionId &&
      computeEntitlement(user).entitled &&
      !newEntitles
    ) {
      return { applied: false, reason: "OTHER_SUB_ACTIVE" };
    }
    users[resolvedUid] = {
      ...user,
      plan: planId,
      planExpiresAt,
      subscriptionId,
      subscriptionStatus: status,
      planUpdatedAt: updatedAt,
      ...customerPatch,
    };
    return { applied: true };
  };

  const activateLifetimeOnce = async ({ uid, orderId, meta = {} }) => {
    if (orders[orderId]) return { activated: false, reason: "ALREADY_PROCESSED" };
    users[uid] = {
      ...(users[uid] || {}),
      plan: "lifetime",
      planExpiresAt: null,
      lifetimeOrderId: orderId,
      ...(meta.polarCustomerId ? { polarCustomerId: meta.polarCustomerId } : {}),
    };
    orders[orderId] = { uid, type: "lifetime", ...meta };
    return { activated: true };
  };

  const revokeOrderOnce = async ({ orderId }) => {
    const order = orders[orderId];
    if (!order) return { revoked: false, reason: "ORDER_NOT_FOUND" };
    if (order.refundedAt) return { revoked: false, reason: "ALREADY_REFUNDED" };
    const user = users[order.uid] || {};
    if (user.plan === "lifetime" && user.lifetimeOrderId === orderId) {
      users[order.uid] = { ...user, plan: null, planExpiresAt: null, lifetimeOrderId: null };
    }
    order.refundedAt = new Date();
    return { revoked: true };
  };

  const getSubscription = async (id) => remoteSubs[id];

  app.use(
    "/webhooks/polar",
    express.raw({ type: "*/*" }),
    createPolarWebhookRouter({
      getWebhookSecret: () => RAW_SECRET,
      verifyEvent: defaultVerifyEvent,
      getPlans: () => createPlans(PLAN_ENV),
      applySubscriptionState,
      activateLifetimeOnce,
      revokeOrderOnce,
      getSubscription,
    })
  );
  app.use(express.json());

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl, { users, subs, orders });
  } finally {
    server.close();
    await once(server, "close");
  }
}

let msgCounter = 0;
function post(baseUrl, eventObj, { tamper = false, badSig = false } = {}) {
  const payload = JSON.stringify(eventObj);
  const msgId = `msg_${++msgCounter}`;
  const headers = { "Content-Type": "application/json", ...signedHeaders(msgId, payload) };
  if (badSig) headers["webhook-signature"] = "v1,ZGVhZGJlZWY=";
  const body = tamper ? payload + " " : payload;
  return fetch(`${baseUrl}/webhooks/polar`, { method: "POST", headers, body });
}

function subscriptionEvent({
  type = "subscription.created",
  id = "sub_1",
  uid = "user-1",
  productId = "prod_weekly",
  status = "active",
  currentPeriodEnd = inDays(7),
  endsAt = null,
  cancelAtPeriodEnd = false,
  modifiedAt = new Date().toISOString(),
  customerId = "cus_1",
  withMetadata = true,
} = {}) {
  return {
    type,
    data: {
      id,
      status,
      product_id: productId,
      current_period_end: currentPeriodEnd,
      ends_at: endsAt,
      cancel_at_period_end: cancelAtPeriodEnd,
      modified_at: modifiedAt,
      customer_id: customerId,
      ...(withMetadata ? { metadata: { user_id: uid }, external_customer_id: uid } : {}),
    },
  };
}

function orderEvent({
  type = "order.created",
  id = "order_1",
  uid = "user-1",
  productId = "prod_lifetime",
  status = "paid",
  billingReason = "purchase_only",
  customerId = "cus_1",
  subscription = undefined,
  subscriptionId = undefined,
} = {}) {
  return {
    type,
    data: {
      id,
      status,
      paid: status === "paid",
      product_id: productId,
      billing_reason: billingReason,
      customer_id: customerId,
      metadata: { user_id: uid },
      external_customer_id: uid,
      ...(subscription ? { subscription } : {}),
      ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
    },
  };
}

test("subscription.created (active) sets plan + expiry from current_period_end", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const periodEnd = inDays(7);
    const res = await post(baseUrl, subscriptionEvent({ currentPeriodEnd: periodEnd }));
    assert.equal(res.status, 200);
    const user = state.users["user-1"];
    assert.equal(user.plan, "weekly");
    assert.equal(user.planExpiresAt.toISOString(), periodEnd);
    assert.equal(user.polarCustomerId, "cus_1");
    assert.equal(computeEntitlement(user).entitled, true);
  });
});

test("subscription.updated renewal pushes the expiry forward", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    await post(baseUrl, subscriptionEvent({ currentPeriodEnd: inDays(7), modifiedAt: inDays(0) }));
    const nextEnd = inDays(14);
    await post(baseUrl, subscriptionEvent({ type: "subscription.updated", currentPeriodEnd: nextEnd, modifiedAt: inDays(7) }));
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), nextEnd);
  });
});

test("order.created subscription_cycle (embedded subscription) advances expiry", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    await post(baseUrl, subscriptionEvent({ currentPeriodEnd: inDays(7), modifiedAt: inDays(0) }));
    const nextEnd = inDays(14);
    const embedded = subscriptionEvent({ currentPeriodEnd: nextEnd, modifiedAt: inDays(7) }).data;
    const res = await post(baseUrl, orderEvent({
      id: "order_cycle", productId: "prod_weekly", billingReason: "subscription_cycle", subscription: embedded,
    }));
    assert.equal(res.status, 200);
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), nextEnd);
  });
});

test("order.created subscription_cycle without embed uses getSubscription fallback", { concurrency: false }, async () => {
  const nextEnd = inDays(21);
  const remote = subscriptionEvent({ id: "sub_1", currentPeriodEnd: nextEnd, modifiedAt: inDays(7) }).data;
  await withServer({ remoteSubs: { sub_r: remote } }, async (baseUrl, state) => {
    await post(baseUrl, subscriptionEvent({ currentPeriodEnd: inDays(7), modifiedAt: inDays(0) }));
    const res = await post(baseUrl, orderEvent({
      id: "order_cycle2", productId: "prod_weekly", billingReason: "subscription_cycle", subscriptionId: "sub_r",
    }));
    assert.equal(res.status, 200);
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), nextEnd);
  });
});

test("stale modified_at is skipped", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const freshEnd = inDays(14);
    await post(baseUrl, subscriptionEvent({ currentPeriodEnd: freshEnd, modifiedAt: inDays(0) }));
    await post(baseUrl, subscriptionEvent({ type: "subscription.updated", status: "revoked", currentPeriodEnd: null, endsAt: inDays(-1), modifiedAt: inDays(-3) }));
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), freshEnd);
    assert.equal(state.users["user-1"].subscriptionStatus, "active");
  });
});

test("subscription.canceled with cancel_at_period_end keeps access until ends_at", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    await post(baseUrl, subscriptionEvent({ modifiedAt: inDays(0) }));
    const endsAt = inDays(3);
    await post(baseUrl, subscriptionEvent({
      type: "subscription.canceled", status: "active", cancelAtPeriodEnd: true, endsAt, currentPeriodEnd: endsAt, modifiedAt: inDays(1),
    }));
    const user = state.users["user-1"];
    assert.equal(user.planExpiresAt.toISOString(), endsAt);
    assert.equal(computeEntitlement(user).entitled, true);
  });
});

test("subscription.revoked removes entitlement", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    await post(baseUrl, subscriptionEvent({ modifiedAt: inDays(0) }));
    await post(baseUrl, subscriptionEvent({
      type: "subscription.revoked", status: "revoked", currentPeriodEnd: null, endsAt: inDays(-1), modifiedAt: inDays(1),
    }));
    assert.equal(computeEntitlement(state.users["user-1"]).entitled, false);
  });
});

test("lifetime order activates permanent access; duplicate is a no-op", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, orderEvent());
    assert.equal(res.status, 200);
    const user = state.users["user-1"];
    assert.equal(user.plan, "lifetime");
    assert.equal(computeEntitlement(user).entitled, true);
    assert.equal(state.orders["order_1"].type, "lifetime");
    const before = JSON.stringify(state.users["user-1"]);
    await post(baseUrl, orderEvent());
    assert.equal(JSON.stringify(state.users["user-1"]), before);
  });
});

test("subscription's initial order is acked without granting lifetime", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, orderEvent({ productId: "prod_monthly", billingReason: "subscription_initial" }));
    assert.equal(res.status, 200);
    assert.deepEqual(state.users, {});
    assert.deepEqual(state.orders, {});
  });
});

test("unknown product (subscription and order) records nothing", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    assert.equal((await post(baseUrl, subscriptionEvent({ productId: "prod_unknown" }))).status, 200);
    assert.equal((await post(baseUrl, orderEvent({ productId: "prod_unknown" }))).status, 200);
    assert.deepEqual(state.users, {});
    assert.deepEqual(state.orders, {});
    assert.deepEqual(state.subs, {});
  });
});

test("refund of a lifetime order revokes once", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    await post(baseUrl, orderEvent());
    assert.equal(state.users["user-1"].plan, "lifetime");
    const refund = { type: "order.refunded", data: { order_id: "order_1" } };
    assert.equal((await post(baseUrl, refund)).status, 200);
    assert.equal(state.users["user-1"].plan, null);
    const before = JSON.stringify(state.users["user-1"]);
    await post(baseUrl, refund);
    assert.equal(JSON.stringify(state.users["user-1"]), before);
  });
});

test("uid resolves via the mapping doc when metadata is absent", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    await post(baseUrl, subscriptionEvent({ modifiedAt: inDays(0) }));
    const nextEnd = inDays(30);
    await post(baseUrl, subscriptionEvent({
      type: "subscription.updated", withMetadata: false, currentPeriodEnd: nextEnd, modifiedAt: inDays(1),
    }));
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), nextEnd);
  });
});

test("bad signature is rejected with 400 and nothing is applied", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, subscriptionEvent(), { badSig: true });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_SIGNATURE");
    assert.deepEqual(state.users, {});
  });
});

test("tampered body fails verification", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, subscriptionEvent(), { tamper: true });
    assert.equal(res.status, 400);
    assert.deepEqual(state.users, {});
  });
});

test("unrelated events are acked with 200", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, { type: "benefit_grant.created", data: { id: "bg_1" } });
    assert.equal(res.status, 200);
    assert.deepEqual(state.users, {});
  });
});
