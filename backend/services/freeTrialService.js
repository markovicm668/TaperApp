const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

// One-time free-analysis trial for anonymous (Firebase anonymous-auth) users,
// tracked per anonymous uid. Kept in its own collection so real-account data
// in `users` stays clean.
//
// Because anonymous uids are free to mint (sign out / incognito = fresh uid =
// fresh trial), trials are additionally throttled per client IP in
// `anonTrialIps/{hmac(ip)}`: a rolling window of consumption timestamps.
const ANON_TRIALS_COLLECTION = "anonTrials";
const ANON_TRIAL_IPS_COLLECTION = "anonTrialIps";
const ANON_TRIALS_PER_IP = 2;
const ANON_TRIAL_IP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Ops kill-switch (e.g. a big NAT is being over-blocked): disables only the
// per-IP layer; the per-uid trial and the save charge remain in force.
function ipLimitDisabled() {
  return process.env.ANON_IP_LIMIT_DISABLED === "true";
}

function getTrialRef(uid) {
  return getFirebaseFirestore().collection(ANON_TRIALS_COLLECTION).doc(uid);
}

function getIpRef(ipHash) {
  return getFirebaseFirestore().collection(ANON_TRIAL_IPS_COLLECTION).doc(ipHash);
}

// Pure rolling-window decision: prune entries older than the window, then
// allow only if fewer than `limit` remain.
function evaluateIpWindow(usedAtMillis, nowMillis, limit, windowMs) {
  const prunedMillis = (usedAtMillis || []).filter((ms) => nowMillis - ms < windowMs);
  return { allowed: prunedMillis.length < limit, prunedMillis };
}

function readUsedAtMillis(snap) {
  if (!snap.exists) return [];
  const usedAt = snap.data().usedAt;
  if (!Array.isArray(usedAt)) return [];
  return usedAt.map((t) => (t?.toMillis ? t.toMillis() : Number(t))).filter(Number.isFinite);
}

// Transactionally consume the one free analysis, accounting the caller's IP in
// the same transaction so a uid trial can never be consumed unthrottled.
// `ipHash` may be null (IP unresolvable) — the IP layer is then skipped.
// Returns { ok: true } or { ok: false, reason: "FREE_TRIAL_USED" | "FREE_TRIAL_IP_LIMIT" }.
async function consumeFreeTrial(uid, ipHash = null) {
  const db = getFirebaseFirestore();
  const trialRef = getTrialRef(uid);
  const checkIp = Boolean(ipHash) && !ipLimitDisabled();
  if (!checkIp && !ipLimitDisabled()) {
    // eslint-disable-next-line no-console
    console.warn("consumeFreeTrial: no client IP resolved; skipping IP throttle for", uid);
  }

  return db.runTransaction(async (tx) => {
    const trialSnap = await tx.get(trialRef);
    const ipSnap = checkIp ? await tx.get(getIpRef(ipHash)) : null;

    if (trialSnap.exists && trialSnap.data().used) {
      return { ok: false, reason: "FREE_TRIAL_USED" };
    }

    let prunedMillis = null;
    if (ipSnap) {
      const evaluated = evaluateIpWindow(
        readUsedAtMillis(ipSnap),
        Date.now(),
        ANON_TRIALS_PER_IP,
        ANON_TRIAL_IP_WINDOW_MS
      );
      if (!evaluated.allowed) {
        return { ok: false, reason: "FREE_TRIAL_IP_LIMIT" };
      }
      prunedMillis = evaluated.prunedMillis;
    }

    if (trialSnap.exists) {
      tx.update(trialRef, { used: true });
    } else {
      tx.set(trialRef, { used: true, createdAt: FieldValue.serverTimestamp() });
    }

    if (ipSnap) {
      // serverTimestamp() is not allowed inside arrays; the backend clock is
      // the one we trust for the window math anyway.
      const usedAt = [...prunedMillis, Date.now()].map((ms) => Timestamp.fromMillis(ms));
      tx.set(
        getIpRef(ipHash),
        {
          usedAt,
          updatedAt: FieldValue.serverTimestamp(),
          ...(ipSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
    }

    return { ok: true };
  });
}

// Read-only check for the /parse pre-gate. Slightly racy vs. consumeFreeTrial
// by design — the consume path re-checks atomically. The uid check wins over
// the IP check so the more specific "your trial is used" message is returned.
// Returns { available: boolean, reason?: "FREE_TRIAL_USED" | "FREE_TRIAL_IP_LIMIT" }.
async function isFreeTrialAvailable(uid, ipHash = null) {
  const checkIp = Boolean(ipHash) && !ipLimitDisabled();
  const [trialSnap, ipSnap] = await Promise.all([
    getTrialRef(uid).get(),
    checkIp ? getIpRef(ipHash).get() : Promise.resolve(null),
  ]);

  if (trialSnap.exists && trialSnap.data().used) {
    return { available: false, reason: "FREE_TRIAL_USED" };
  }

  if (ipSnap) {
    const { allowed } = evaluateIpWindow(
      readUsedAtMillis(ipSnap),
      Date.now(),
      ANON_TRIALS_PER_IP,
      ANON_TRIAL_IP_WINDOW_MS
    );
    if (!allowed) {
      return { available: false, reason: "FREE_TRIAL_IP_LIMIT" };
    }
  }

  return { available: true };
}

module.exports = {
  consumeFreeTrial,
  isFreeTrialAvailable,
  evaluateIpWindow,
  ANON_TRIALS_PER_IP,
  ANON_TRIAL_IP_WINDOW_MS,
};
