const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { INITIAL_TOKENS, USERS_COLLECTION } = require("./tokenService");
const { computeEntitlement, toMillis } = require("./entitlementService");

const ORDERS_COLLECTION = "polarOrders";
const SUBSCRIPTIONS_COLLECTION = "polarSubscriptions";

// Polar retries webhook deliveries and lets operators resend them from the
// dashboard, so everything here must tolerate duplicates and reordering.
// Lifetime orders are deduped once per order id. Subscription events are
// idempotent state-syncs: replaying one re-writes the same state, and the
// per-subscription updatedAt guard drops stale deliveries. This module is
// provider-neutral — the caller computes planExpiresAt from the provider's
// fields and passes it in.

function mintedUserDefaults() {
  return {
    tokensRemaining: INITIAL_TOKENS,
    createdAt: FieldValue.serverTimestamp(),
  };
}

// Upserts the plan state a subscription event describes. One transaction over
// the subscription mapping doc + the user doc. planExpiresAt is precomputed by
// the caller (null/past ⇒ the subscription no longer entitles).
async function applySubscriptionState({
  uid,
  subscriptionId,
  planId,
  status,
  planExpiresAt,
  updatedAt,
  raw = {},
}) {
  const db = getFirebaseFirestore();
  const subRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(String(subscriptionId));

  return db.runTransaction(async (tx) => {
    const subSnap = await tx.get(subRef);
    const subData = subSnap.exists ? subSnap.data() : {};

    // metadata/external_customer_id can be absent on events for subscriptions
    // created outside the app; fall back to the mapping doc from earlier events.
    const resolvedUid = uid || subData.uid;
    if (!resolvedUid) {
      return { applied: false, reason: "NO_UID" };
    }

    const userRef = db.collection(USERS_COLLECTION).doc(resolvedUid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    // Out-of-order guard: updatedAt (Polar's modified_at) is monotone per
    // subscription. Strictly older than what we already applied ⇒ a late retry
    // of an old state; skip. Equal re-applies the same state (idempotent).
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
        planExpiresAt: planExpiresAt ?? null,
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
        {
          subscriptionId: String(subscriptionId),
          subscriptionStatus: status,
          ...(raw.polarCustomerId ? { polarCustomerId: raw.polarCustomerId } : {}),
        },
        { merge: true }
      );
      return { applied: true };
    }

    const newEntitles = Boolean(toMillis(planExpiresAt) > Date.now());

    // Cross-subscription guard: a late event from an OLD subscription (e.g. its
    // "revoked" arriving after the user already started a new one) must not
    // clobber the new subscription's access.
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
        planExpiresAt: planExpiresAt ?? null,
        subscriptionId: String(subscriptionId),
        subscriptionStatus: status,
        planUpdatedAt: updatedAt,
        ...(raw.polarCustomerId ? { polarCustomerId: raw.polarCustomerId } : {}),
      },
      { merge: true }
    );
    return { applied: true };
  });
}

// Activates lifetime access exactly once per Polar order id.
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
        ...(meta.polarCustomerId ? { polarCustomerId: meta.polarCustomerId } : {}),
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

// Revokes a refunded lifetime order, once, by order id.
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

    // Only clear the plan if this order is what granted it; a live subscription
    // re-establishes itself on its next webhook.
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
  });
}

module.exports = {
  applySubscriptionState,
  activateLifetimeOnce,
  revokeOrderOnce,
  ORDERS_COLLECTION,
  SUBSCRIPTIONS_COLLECTION,
};
