const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const {
  evaluateWindow,
  readUsedAtMillis,
  toTimestampArray,
} = require("../utils/rollingWindow");

// Per-résumé allowance for *signup-granted* analyses, so cycling accounts stops
// paying off. Keyed by the salted contact-block hashes from
// utils/resumeFingerprint, in a rolling window shaped exactly like
// `anonTrialIps`.
//
// Critically, this ledger only ever sees analyses funded by the INITIAL_TOKENS
// grant. Credits a user *earned* (referral rewards) or *bought* (credit pack,
// plans) are theirs: those spends never reach this service and can never be
// blocked by it. Callers decide that via the `fromGrant` flag returned by
// tokenService.chargeAnalysisTokens.
const FINGERPRINTS_COLLECTION = "resumeFingerprints";
const FREE_GRANT_ANALYSES_PER_FINGERPRINT = 8;
const FINGERPRINT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Ops kill-switch for the day a shared résumé (a career coach, a couple on one
// laptop) is being over-blocked. Disables only this layer; per-account token
// balances remain in force.
function fingerprintLimitDisabled() {
  return process.env.FINGERPRINT_LIMIT_DISABLED === "true";
}

function getFingerprintRef(hash) {
  return getFirebaseFirestore().collection(FINGERPRINTS_COLLECTION).doc(hash);
}

// Transactionally account one grant-funded analysis against every key derived
// from the résumé. A match on ANY key blocks, so changing only the signup email
// still collides on the phone number.
//
// `fingerprints` is the [{ kind, hash }] array from computeFingerprints; an
// empty array (no usable contact fields) allows the request.
// Returns { ok: true } or { ok: false, reason: "FREE_LIMIT_REACHED", kind }.
async function consumeAllowance(fingerprints) {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("consumeAllowance: no usable résumé fingerprint; skipping allowance check");
    return { ok: true, skipped: true };
  }
  if (fingerprintLimitDisabled()) {
    return { ok: true, skipped: true };
  }

  const db = getFirebaseFirestore();

  return db.runTransaction(async (tx) => {
    // Firestore requires every read before any write.
    const snaps = await Promise.all(
      fingerprints.map((fp) => tx.get(getFingerprintRef(fp.hash)))
    );

    const now = Date.now();
    const pruned = [];

    for (let i = 0; i < fingerprints.length; i += 1) {
      const evaluated = evaluateWindow(
        readUsedAtMillis(snaps[i]),
        now,
        FREE_GRANT_ANALYSES_PER_FINGERPRINT,
        FINGERPRINT_WINDOW_MS
      );
      if (!evaluated.allowed) {
        return { ok: false, reason: "FREE_LIMIT_REACHED", kind: fingerprints[i].kind };
      }
      pruned.push(evaluated.prunedMillis);
    }

    for (let i = 0; i < fingerprints.length; i += 1) {
      const snap = snaps[i];
      tx.set(
        getFingerprintRef(fingerprints[i].hash),
        {
          kind: fingerprints[i].kind,
          usedAt: toTimestampArray([...pruned[i], now]),
          updatedAt: FieldValue.serverTimestamp(),
          ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
    }

    return { ok: true };
  });
}

module.exports = {
  consumeAllowance,
  fingerprintLimitDisabled,
  FINGERPRINTS_COLLECTION,
  FREE_GRANT_ANALYSES_PER_FINGERPRINT,
  FINGERPRINT_WINDOW_MS,
};
