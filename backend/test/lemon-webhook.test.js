const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const { once } = require("node:events");

const { createLemonWebhookRouter } = require("../routes/lemonWebhook");
const { createPlans } = require("../config/plans");
const { computeEntitlement } = require("../services/entitlementService");

const SECRET = "test-webhook-secret";
const PLAN_ENV = {
  LEMONSQUEEZY_VARIANT_ID_WEEKLY: "111111",
  LEMONSQUEEZY_VARIANT_ID_MONTHLY: "222222",
  LEMONSQUEEZY_VARIANT_ID_LIFETIME: "333333",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

function sign(body, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// Builds a server with the SAME mount ordering as index.js — the raw-body
// webhook route registered before the global express.json() — to prove the
// signature survives that ordering. The purchase-service fakes reimplement the
// real semantics in memory (stale guard, lifetime supremacy, cross-sub guard,
// order dedup) so lifecycle behavior is exercised without Firestore.
async function withServer({ users = {}, subs = {}, orders = {} } = {}, run) {
  const app = express();

  const mapStatusToExpiry = (status, renewsAt, endsAt, updatedAt) => {
    if (["active", "on_trial", "past_due", "paused"].includes(status)) {
      return renewsAt ?? endsAt ?? updatedAt;
    }
    if (status === "cancelled") return endsAt ?? renewsAt ?? updatedAt;
    return endsAt ?? updatedAt;
  };

  const applySubscriptionState = async ({
    uid,
    subscriptionId,
    planId,
    status,
    renewsAt,
    endsAt,
    updatedAt,
    raw = {},
  }) => {
    const sub = subs[subscriptionId] || {};
    const resolvedUid = uid || sub.uid;
    if (!resolvedUid) return { applied: false, reason: "NO_UID" };
    if (sub.updatedAt && updatedAt.getTime() < sub.updatedAt.getTime()) {
      return { applied: false, reason: "STALE_EVENT" };
    }
    subs[subscriptionId] = {
      ...sub,
      uid: resolvedUid,
      planId,
      status,
      renewsAt,
      endsAt,
      updatedAt,
      ...raw,
    };
    const user = users[resolvedUid] || {};
    if (user.plan === "lifetime") {
      users[resolvedUid] = { ...user, subscriptionId, subscriptionStatus: status };
      return { applied: true };
    }
    const newExpiresAt = mapStatusToExpiry(status, renewsAt, endsAt, updatedAt);
    const newEntitles = Boolean(newExpiresAt && newExpiresAt.getTime() > Date.now());
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
      planExpiresAt: newExpiresAt ?? null,
      subscriptionId,
      subscriptionStatus: status,
      planUpdatedAt: updatedAt,
    };
    return { applied: true };
  };

  const activateLifetimeOnce = async ({ uid, orderId, meta = {} }) => {
    if (orders[orderId]) return { activated: false, reason: "ALREADY_PROCESSED" };
    users[uid] = { ...(users[uid] || {}), plan: "lifetime", planExpiresAt: null, lifetimeOrderId: orderId };
    orders[orderId] = { uid, type: "lifetime", planId: "lifetime", ...meta };
    return { activated: true };
  };

  const revokeOrderOnce = async ({ orderId }) => {
    const order = orders[orderId];
    if (!order) return { revoked: false, reason: "ORDER_NOT_FOUND" };
    if (order.refundedAt) return { revoked: false, reason: "ALREADY_REFUNDED" };
    const user = users[order.uid] || {};
    if (order.type === "lifetime") {
      if (user.plan === "lifetime" && user.lifetimeOrderId === orderId) {
        users[order.uid] = { ...user, plan: null, planExpiresAt: null, lifetimeOrderId: null };
      }
      order.refundedAt = new Date().toISOString();
      return { revoked: true };
    }
    users[order.uid] = {
      ...user,
      tokensRemaining: Math.max(0, (user.tokensRemaining ?? 0) - order.credits),
    };
    order.refundedAt = new Date().toISOString();
    return { revoked: true };
  };

  app.use(
    "/webhooks/lemonsqueezy",
    express.raw({ type: "*/*" }),
    createLemonWebhookRouter({
      getWebhookSecret: () => SECRET,
      getPlans: () => createPlans(PLAN_ENV),
      applySubscriptionState,
      activateLifetimeOnce,
      revokeOrderOnce,
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

function post(baseUrl, body, signature) {
  const headers = { "Content-Type": "application/json" };
  if (signature !== null) headers["X-Signature"] = signature;
  return fetch(`${baseUrl}/webhooks/lemonsqueezy`, {
    method: "POST",
    headers,
    body,
  });
}

function subscriptionEventBody({
  event = "subscription_created",
  subId = "sub-1",
  uid = "user-1",
  variantId = 111111,
  status = "active",
  renewsAt = inDays(7),
  endsAt = null,
  updatedAt = new Date().toISOString(),
  customData = uid ? { user_id: uid } : undefined,
} = {}) {
  return JSON.stringify({
    meta: { event_name: event, custom_data: customData },
    data: {
      id: subId,
      attributes: {
        status,
        variant_id: variantId,
        renews_at: renewsAt,
        ends_at: endsAt,
        updated_at: updatedAt,
        customer_id: 42,
        order_id: 4242,
        test_mode: true,
      },
    },
  });
}

function orderCreatedBody({
  uid = "user-1",
  orderId = "999001",
  status = "paid",
  variantId = 333333,
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

// --- signature suite (unchanged behavior) ---

test("missing signature is rejected with 400 and nothing is applied", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const res = await post(baseUrl, subscriptionEventBody(), null);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "INVALID_SIGNATURE");
    assert.deepEqual(state.users, {});
  });
});

test("signature over different bytes (tampered body) is rejected", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const original = subscriptionEventBody({ variantId: 111111 });
    const tampered = subscriptionEventBody({ variantId: 222222 });
    const res = await post(baseUrl, tampered, sign(original));
    assert.equal(res.status, 400);
    assert.deepEqual(state.users, {});
  });
});

test("signature with the wrong secret is rejected", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = subscriptionEventBody();
    const res = await post(baseUrl, body, sign(body, "wrong-secret"));
    assert.equal(res.status, 400);
    assert.deepEqual(state.users, {});
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

// --- subscription lifecycle ---

test("subscription_created (active) sets the plan and expiry from renews_at", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const renewsAt = inDays(7);
    const body = subscriptionEventBody({ renewsAt });
    assert.equal((await post(baseUrl, body, sign(body))).status, 200);
    const user = state.users["user-1"];
    assert.equal(user.plan, "weekly");
    assert.equal(user.planExpiresAt.toISOString(), renewsAt);
    assert.equal(computeEntitlement(user).entitled, true);
    assert.equal(state.subs["sub-1"].uid, "user-1");
  });
});

test("renewal (subscription_updated) pushes the expiry forward", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const created = subscriptionEventBody({ renewsAt: inDays(7), updatedAt: inDays(0) });
    await post(baseUrl, created, sign(created));

    const nextRenewsAt = inDays(14);
    const renewed = subscriptionEventBody({
      event: "subscription_updated",
      renewsAt: nextRenewsAt,
      updatedAt: inDays(7),
    });
    assert.equal((await post(baseUrl, renewed, sign(renewed))).status, 200);
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), nextRenewsAt);
  });
});

test("stale event (older updated_at) is skipped", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const freshRenews = inDays(14);
    const fresh = subscriptionEventBody({ renewsAt: freshRenews, updatedAt: inDays(0) });
    await post(baseUrl, fresh, sign(fresh));

    const stale = subscriptionEventBody({
      event: "subscription_updated",
      status: "cancelled",
      renewsAt: null,
      endsAt: inDays(1),
      updatedAt: inDays(-3),
    });
    assert.equal((await post(baseUrl, stale, sign(stale))).status, 200);
    assert.equal(state.users["user-1"].subscriptionStatus, "active");
    assert.equal(state.users["user-1"].planExpiresAt.toISOString(), freshRenews);
  });
});

test("cancelled keeps access until ends_at", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const created = subscriptionEventBody({ updatedAt: inDays(0) });
    await post(baseUrl, created, sign(created));

    const endsAt = inDays(3);
    const cancelled = subscriptionEventBody({
      event: "subscription_cancelled",
      status: "cancelled",
      renewsAt: null,
      endsAt,
      updatedAt: inDays(1),
    });
    await post(baseUrl, cancelled, sign(cancelled));
    const user = state.users["user-1"];
    assert.equal(user.planExpiresAt.toISOString(), endsAt);
    assert.equal(computeEntitlement(user).entitled, true);
  });
});

test("expired revokes entitlement", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const created = subscriptionEventBody({ updatedAt: inDays(0) });
    await post(baseUrl, created, sign(created));

    const expired = subscriptionEventBody({
      event: "subscription_expired",
      status: "expired",
      renewsAt: null,
      endsAt: inDays(-1),
      updatedAt: inDays(1),
    });
    await post(baseUrl, expired, sign(expired));
    assert.equal(computeEntitlement(state.users["user-1"]).entitled, false);
  });
});

test("subscription_payment_success is acked without touching state", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = JSON.stringify({
      meta: { event_name: "subscription_payment_success", custom_data: { user_id: "user-1" } },
      data: { id: "invoice-9", attributes: { status: "paid", test_mode: true } },
    });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.users, {});
    assert.deepEqual(state.subs, {});
  });
});

test("event without custom_data resolves uid via the mapping doc; without one it is a no-op", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const orphan = subscriptionEventBody({ uid: null, customData: undefined, updatedAt: inDays(0) });
    assert.equal((await post(baseUrl, orphan, sign(orphan))).status, 200);
    assert.deepEqual(state.users, {});

    const created = subscriptionEventBody({ updatedAt: inDays(0) });
    await post(baseUrl, created, sign(created));

    const followUp = subscriptionEventBody({
      event: "subscription_updated",
      uid: null,
      customData: undefined,
      renewsAt: inDays(14),
      updatedAt: inDays(1),
    });
    await post(baseUrl, followUp, sign(followUp));
    assert.equal(state.users["user-1"].planExpiresAt.getTime() > Date.now() + 13 * DAY_MS, true);
  });
});

test("duplicate subscription_created delivery is idempotent", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = subscriptionEventBody({ updatedAt: inDays(0) });
    await post(baseUrl, body, sign(body));
    const before = JSON.stringify(state.users["user-1"]);
    await post(baseUrl, body, sign(body));
    assert.equal(JSON.stringify(state.users["user-1"]), before);
  });
});

test("late expired event from an OLD subscription does not clobber the new active one", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const newSub = subscriptionEventBody({ subId: "sub-new", renewsAt: inDays(30), updatedAt: inDays(0) });
    await post(baseUrl, newSub, sign(newSub));

    const oldSubExpired = subscriptionEventBody({
      subId: "sub-old",
      event: "subscription_expired",
      status: "expired",
      renewsAt: null,
      endsAt: inDays(-1),
      updatedAt: inDays(0),
    });
    assert.equal((await post(baseUrl, oldSubExpired, sign(oldSubExpired))).status, 200);
    const user = state.users["user-1"];
    assert.equal(user.subscriptionId, "sub-new");
    assert.equal(computeEntitlement(user).entitled, true);
  });
});

// --- lifetime orders ---

test("lifetime order activates permanent access; duplicate delivery is a no-op", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody();
    assert.equal((await post(baseUrl, body, sign(body))).status, 200);
    const user = state.users["user-1"];
    assert.equal(user.plan, "lifetime");
    assert.equal(computeEntitlement(user).entitled, true);
    assert.equal(state.orders["999001"].type, "lifetime");

    const before = JSON.stringify(state.users["user-1"]);
    await post(baseUrl, body, sign(body));
    assert.equal(JSON.stringify(state.users["user-1"]), before);
  });
});

test("order_created for a subscription variant is acked without recording an order", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = orderCreatedBody({ variantId: 111111 });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.orders, {});
    assert.deepEqual(state.users, {});
  });
});

test("unknown variant (order and subscription) records nothing so a resend can recover", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const order = orderCreatedBody({ variantId: 555555 });
    assert.equal((await post(baseUrl, order, sign(order))).status, 200);

    const sub = subscriptionEventBody({ variantId: 555555 });
    assert.equal((await post(baseUrl, sub, sign(sub))).status, 200);

    assert.deepEqual(state.orders, {});
    assert.deepEqual(state.users, {});
    assert.deepEqual(state.subs, {});
  });
});

test("unpaid lifetime order and order without uid are acked without activation", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const pending = orderCreatedBody({ status: "pending" });
    assert.equal((await post(baseUrl, pending, sign(pending))).status, 200);

    const noUid = orderCreatedBody({ uid: null });
    assert.equal((await post(baseUrl, noUid, sign(noUid))).status, 200);

    assert.deepEqual(state.users, {});
  });
});

test("refund of a lifetime order revokes the plan once", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const created = orderCreatedBody();
    await post(baseUrl, created, sign(created));
    assert.equal(state.users["user-1"].plan, "lifetime");

    const refund = JSON.stringify({
      meta: { event_name: "order_refunded" },
      data: { id: "999001", attributes: { status: "refunded" } },
    });
    assert.equal((await post(baseUrl, refund, sign(refund))).status, 200);
    assert.equal(state.users["user-1"].plan, null);
    assert.equal(computeEntitlement(state.users["user-1"]).entitled, false);

    const before = JSON.stringify(state.users["user-1"]);
    await post(baseUrl, refund, sign(refund));
    assert.equal(JSON.stringify(state.users["user-1"]), before);
  });
});

test("refund of a legacy credit-pack order still claws back tokens (clamped at 0)", { concurrency: false }, async () => {
  await withServer(
    {
      users: { "user-1": { tokensRemaining: 10 } },
      orders: { "888001": { uid: "user-1", credits: 25 } },
    },
    async (baseUrl, state) => {
      const refund = JSON.stringify({
        meta: { event_name: "order_refunded" },
        data: { id: "888001", attributes: { status: "refunded" } },
      });
      assert.equal((await post(baseUrl, refund, sign(refund))).status, 200);
      assert.equal(state.users["user-1"].tokensRemaining, 0);
    }
  );
});

test("unrelated events are acked with 200", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    const body = JSON.stringify({
      meta: { event_name: "license_key_created" },
      data: { id: "1" },
    });
    const res = await post(baseUrl, body, sign(body));
    assert.equal(res.status, 200);
    assert.deepEqual(state.users, {});
  });
});
