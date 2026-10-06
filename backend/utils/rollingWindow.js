const { Timestamp } = require("firebase-admin/firestore");

// Shared rolling-window accounting for abuse throttles that record a list of
// consumption timestamps on a single doc: the anonymous per-IP trial window
// (`anonTrialIps`) and the per-résumé free-grant window (`resumeFingerprints`).

// Pure rolling-window decision: prune entries older than the window, then
// allow only if fewer than `limit` remain.
function evaluateWindow(usedAtMillis, nowMillis, limit, windowMs) {
  const prunedMillis = (usedAtMillis || []).filter((ms) => nowMillis - ms < windowMs);
  return { allowed: prunedMillis.length < limit, prunedMillis };
}

// Reads a doc's `usedAt` array as plain millis, tolerating both Firestore
// Timestamps and raw numbers, and skipping anything unparseable.
//
// null and undefined are rejected explicitly: Number(null) is 0, which is
// finite, so a null entry would otherwise be read as a real epoch-0 timestamp.
function readUsedAtMillis(snap) {
  if (!snap || !snap.exists) return [];
  const usedAt = snap.data().usedAt;
  if (!Array.isArray(usedAt)) return [];
  return usedAt
    .map((t) => {
      if (t?.toMillis) return t.toMillis();
      if (typeof t === "number") return t;
      if (typeof t === "string" && t.trim() !== "") return Number(t);
      return NaN;
    })
    .filter(Number.isFinite);
}

// serverTimestamp() is not allowed inside arrays, so the backend clock is what
// we trust for the window math — the same clock evaluateWindow is given.
function toTimestampArray(millis) {
  return millis.map((ms) => Timestamp.fromMillis(ms));
}

module.exports = {
  evaluateWindow,
  readUsedAtMillis,
  toTimestampArray,
};
