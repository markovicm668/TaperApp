const { getFirebaseFirestore } = require("./firebaseAdmin");

// A paid plan grants unlimited usage: entitled users bypass token charging
// entirely. Entitlement is always DERIVED from the user doc, never stored as a
// boolean — subscriptions extend planExpiresAt only via webhooks, so if
// webhooks stop arriving the access lapses on its own (fail-closed) and the
// user degrades to the free credit system.

// Accepts a Firestore Timestamp, a Date, or an ISO string — webhook payloads
// and tests pass Dates/strings while docs read back Timestamps.
function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// Pure — safe to call inside existing Firestore transactions on already-read
// data, so gated requests never pay an extra read for the plan check.
function computeEntitlement(userData = {}, now = Date.now()) {
  const plan = userData.plan ?? null;
  if (plan === "lifetime") {
    return { entitled: true, plan, planExpiresAt: null };
  }
  const expiresMs = toMillis(userData.planExpiresAt);
  return {
    entitled: Boolean(plan && expiresMs && expiresMs > now),
    plan,
    planExpiresAt: userData.planExpiresAt ?? null,
  };
}

// One Firestore read; used by the read-only eligibility gate and the billing
// portal route. tokenService is required lazily to avoid a require cycle
// (tokenService imports computeEntitlement from this module at load time).
async function getUserAccess(uid) {
  const { INITIAL_TOKENS, USERS_COLLECTION } = require("./tokenService");
  const snap = await getFirebaseFirestore()
    .collection(USERS_COLLECTION)
    .doc(uid)
    .get();
  const data = snap.exists ? snap.data() : {};
  return {
    ...computeEntitlement(data),
    tokensRemaining: snap.exists ? data.tokensRemaining : INITIAL_TOKENS,
    subscriptionId: data.subscriptionId ?? null,
    subscriptionStatus: data.subscriptionStatus ?? null,
    polarCustomerId: data.polarCustomerId ?? null,
  };
}

module.exports = { computeEntitlement, getUserAccess, toMillis };
