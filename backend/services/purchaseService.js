const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { INITIAL_TOKENS, USERS_COLLECTION } = require("./tokenService");

const ORDERS_COLLECTION = "lemonSqueezyOrders";

// Lemon Squeezy retries webhook deliveries and lets operators resend them from
// the dashboard, so every grant/revoke must be idempotent. The per-order dedup
// doc and the balance change are written in ONE transaction — tokenService's
// addTokens can't be reused here because it opens its own transaction, which
// would let a concurrent duplicate delivery grant twice.

async function grantOrderTokensOnce({ uid, amount, orderId, meta = {} }) {
  const db = getFirebaseFirestore();
  const orderRef = db.collection(ORDERS_COLLECTION).doc(String(orderId));
  const userRef = db.collection(USERS_COLLECTION).doc(uid);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (orderSnap.exists) {
      return { granted: false, reason: "ALREADY_PROCESSED" };
    }

    const userSnap = await tx.get(userRef);
    const current = userSnap.exists
      ? userSnap.data().tokensRemaining
      : INITIAL_TOKENS;
    const newBalance = current + amount;

    if (userSnap.exists) {
      tx.update(userRef, { tokensRemaining: newBalance });
    } else {
      tx.set(userRef, {
        tokensRemaining: newBalance,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(orderRef, {
      uid,
      credits: amount,
      processedAt: FieldValue.serverTimestamp(),
      ...meta,
    });
    return { granted: true, newBalance };
  });
}

async function revokeOrderTokensOnce({ orderId }) {
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
    const current = userSnap.exists ? userSnap.data().tokensRemaining : 0;
    // Partial refunds also arrive as order_refunded; policy for now is a full
    // revoke of the pack, clamped so a spent-down balance never goes negative.
    const newBalance = Math.max(0, current - order.credits);

    if (userSnap.exists) {
      tx.update(userRef, { tokensRemaining: newBalance });
    }
    tx.update(orderRef, { refundedAt: FieldValue.serverTimestamp() });
    return { revoked: true, newBalance };
  });
}

module.exports = {
  grantOrderTokensOnce,
  revokeOrderTokensOnce,
  ORDERS_COLLECTION,
};
