const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { INITIAL_TOKENS, USERS_COLLECTION } = require("./tokenService");
const { computeEntitlement, toMillis } = require("./entitlementService");

const ORDERS_COLLECTION = "lemonSqueezyOrders";
const SUBSCRIPTIONS_COLLECTION = "lemonSqueezySubscriptions";

// Lemon Squeezy retries webhook deliveries and lets operators resend them from
// the dashboard, so everything here must tolerate duplicates and reordering.
// Orders (lifetime, and legacy credit packs) are deduped once per order id.
// Subscription events are idempotent state-syncs: replaying one re-writes the
// same state, and the per-subscription updated_at guard drops stale deliveries.

function mintedUserDefaults() {
  return {
    tokensRemaining: INITIAL_TOKENS,
    createdAt: FieldValue.serverTimestamp(),
  };
}

// Maps a Lemon Squeezy subscription status to when the entitlement lapses.
// past_due keeps renews_at, which is already in the past by then — access
// lapses at the failed renewal (fail-closed); recovery arrives later as a
// subscription_updated with status active and a fresh renews_at.
function mapStatusToExpiry(status, renewsAt, endsAt, updatedAt) {
  if (["active", "on_trial", "past_due", "paused"].includes(status)) {
    return renewsAt ?? endsAt ?? updatedAt;
  }
  if (status === "cancelled") {
    // Grace: access runs until the end of the paid period.
    return endsAt ?? renewsAt ?? updatedAt;
  }
  // expired, unpaid, anything unknown: a past timestamp ⇒ not entitled.
  return endsAt ?? updatedAt;
}

// Upserts the plan state a subscription event describes. One transaction over
// the subscription mapping doc + the user doc.
async function applySubscriptionState({
  uid,
  subscriptionId,
  planId,
  status,
  renewsAt,
  endsAt,
  updatedAt,
  raw = {},
}) {
  const db = getFirebaseFirestore();
  const subRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(String(subscriptionId));

  return db.runTransaction(async (tx) => {
    const subSnap = await tx.get(subRef);
    const subData = subSnap.exists ? subSnap.data() : {};

    // custom_data can be absent on events for subscriptions created outside
    // the app; fall back to the mapping doc from earlier events.
    const resolvedUid = uid || subData.uid;
    if (!resolvedUid) {
      return { applied: false, reason: "NO_UID" };
    }

    const userRef = db.collection(USERS_COLLECTION).doc(resolvedUid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    // Out-of-order guard: updated_at is monotone per subscription. Strictly
    // older than what we already applied ⇒ a late retry of an old state; skip.
    // Equal re-applies the same state (idempotent).
    const prevUpdatedMs = toMillis(subData.updatedAt);
    const incomingUpdatedMs = toMillis(updatedAt);
    if (prevUpdatedMs && incomingUpdatedMs && incomingUpdatedMs < prevUpdatedMs) {
      return { applied: false, reason: "STALE_EVENT" };
    }

    tx.set(
      subRef,
      {
        uid: resolvedUid,
        planId,
        status,
        renewsAt: renewsAt ?? null,
        endsAt: endsAt ?? null,
        updatedAt,
        lastEventAt: FieldValue.serverTimestamp(),
        ...raw,
      },
      { merge: true }
    );

    // Lifetime supremacy: subscription churn never downgrades a lifetime
    // account — only record the subscription linkage for the portal.
    if (userData.plan === "lifetime") {
      tx.set(
        userRef,
        { subscriptionId: String(subscriptionId), subscriptionStatus: status },
        { merge: true }
      );
      return { applied: true };
    }

    const newExpiresAt = mapStatusToExpiry(status, renewsAt, endsAt, updatedAt);
    const newEntitles = Boolean(toMillis(newExpiresAt) > Date.now());

    // Cross-subscription guard: a late event from an OLD subscription (e.g.
    // its "expired" arriving after the user already started a new one) must
    // not clobber the new subscription's access.
    if (
      userData.subscriptionId &&
      userData.subscriptionId !== String(subscriptionId) &&
      computeEntitlement(userData).entitled &&
      !newEntitles
    ) {
      return { applied: false, reason: "OTHER_SUB_ACTIVE" };
    }

    tx.set(
      userRef,
      {
        ...(userSnap.exists ? {} : mintedUserDefaults()),
        plan: planId,
        planExpiresAt: newExpiresAt ?? null,
        subscriptionId: String(subscriptionId),
        subscriptionStatus: status,
        planUpdatedAt: updatedAt,
      },
      { merge: true }
    );
    return { applied: true };
  });
}

// Activates lifetime access exactly once per Lemon Squeezy order id.
async function activateLifetimeOnce({ uid, orderId, meta = {} }) {
  const db = getFirebaseFirestore();
  const orderRef = db.collection(ORDERS_COLLECTION).doc(String(orderId));
  const userRef = db.collection(USERS_COLLECTION).doc(uid);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (orderSnap.exists) {
      return { activated: false, reason: "ALREADY_PROCESSED" };
    }
    const userSnap = await tx.get(userRef);

    tx.set(
      userRef,
      {
        ...(userSnap.exists ? {} : mintedUserDefaults()),
        plan: "lifetime",
        planExpiresAt: null,
        planUpdatedAt: FieldValue.serverTimestamp(),
        lifetimeOrderId: String(orderId),
      },
      { merge: true }
    );
    tx.set(orderRef, {
      uid,
      type: "lifetime",
      planId: "lifetime",
      processedAt: FieldValue.serverTimestamp(),
      ...meta,
    });
    return { activated: true };
  });
}

// Single entry point for order_refunded. Branches on what the stored order doc
// says, which keeps refunds of legacy credit-pack orders (docs with .credits)
// working after the switch to plans.
async function revokeOrderOnce({ orderId }) {
  const db = getFirebaseFirestore();
  const orderRef = db.collection(ORDERS_COLLECTION).doc(String(orderId));

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      return { revoked: false, reason: "ORDER_NOT_FOUND" };
    }
    const order = orderSnap.data();
    if (order.refundedAt) {
      return { revoked: false, reason: "ALREADY_REFUNDED" };
    }

    const userRef = db.collection(USERS_COLLECTION).doc(order.uid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    if (order.type === "lifetime") {
      // Only clear the plan if this order is what granted it; a live
      // subscription re-establishes itself on its next webhook.
      if (
        userSnap.exists &&
        userData.plan === "lifetime" &&
        userData.lifetimeOrderId === String(orderId)
      ) {
        tx.set(
          userRef,
          {
            plan: null,
            planExpiresAt: null,
            planUpdatedAt: FieldValue.serverTimestamp(),
            lifetimeOrderId: null,
          },
          { merge: true }
        );
      }
      tx.update(orderRef, { refundedAt: FieldValue.serverTimestamp() });
      return { revoked: true };
    }

    // Legacy credit-pack order: claw the credits back, clamped so a
    // spent-down balance never goes negative.
    const current = userSnap.exists ? userData.tokensRemaining : 0;
    const newBalance = Math.max(0, current - order.credits);
    if (userSnap.exists) {
      tx.update(userRef, { tokensRemaining: newBalance });
    }
    tx.update(orderRef, { refundedAt: FieldValue.serverTimestamp() });
    return { revoked: true, newBalance };
  });
}

module.exports = {
  applySubscriptionState,
  activateLifetimeOnce,
  revokeOrderOnce,
  ORDERS_COLLECTION,
  SUBSCRIPTIONS_COLLECTION,
};
