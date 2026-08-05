const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

// One-time free-analysis trial for anonymous (Firebase anonymous-auth) users,
// tracked per anonymous uid. Kept in its own collection so real-account data
// in `users` stays clean.
const ANON_TRIALS_COLLECTION = "anonTrials";

function getTrialRef(uid) {
  return getFirebaseFirestore().collection(ANON_TRIALS_COLLECTION).doc(uid);
}

// Transactionally consume the one free analysis. Returns true if the trial was
// available (and is now marked used), false if it had already been used.
async function consumeFreeTrial(uid) {
  const db = getFirebaseFirestore();
  const ref = getTrialRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, { used: true, createdAt: FieldValue.serverTimestamp() });
      return true;
    }
    if (!snap.data().used) {
      tx.update(ref, { used: true });
      return true;
    }
    return false;
  });
}

// Read-only check: is the free trial still available for this anonymous uid?
async function isFreeTrialAvailable(uid) {
  const snap = await getTrialRef(uid).get();
  return !snap.exists || !snap.data().used;
}

module.exports = {
  consumeFreeTrial,
  isFreeTrialAvailable,
};
