const crypto = require("crypto");
const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

const USERS_COLLECTION = "users";
const REFERRALS_COLLECTION = "referrals";
const REFERRAL_REWARD = 3;

function generateReferralCode() {
  return crypto.randomBytes(6).toString("base64url");
}

async function lookupUserByReferralCode(code) {
  const db = getFirebaseFirestore();
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("referralCode", "==", code)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { uid: doc.id };
}

async function recordReferral(referrerUid, refereeUid) {
  if (referrerUid === refereeUid) return null;

  const db = getFirebaseFirestore();
  const refereeRef = db.collection(USERS_COLLECTION).doc(refereeUid);

  return db.runTransaction(async (tx) => {
    const refereeSnap = await tx.get(refereeRef);
    if (!refereeSnap.exists) return null;

    const refereeData = refereeSnap.data();
    if (refereeData.referredBy) return null;

    tx.update(refereeRef, {
      referredBy: referrerUid,
      referralRewarded: false,
    });

    return { recorded: true };
  });
}

async function claimReferralReward(refereeUid) {
  const db = getFirebaseFirestore();
  const refereeRef = db.collection(USERS_COLLECTION).doc(refereeUid);

  return db.runTransaction(async (tx) => {
    const refereeSnap = await tx.get(refereeRef);
    if (!refereeSnap.exists) return null;

    const refereeData = refereeSnap.data();
    if (!refereeData.referredBy || refereeData.referralRewarded) return null;

    const referrerRef = db.collection(USERS_COLLECTION).doc(refereeData.referredBy);
    const referrerSnap = await tx.get(referrerRef);
    if (!referrerSnap.exists) return null;

    tx.update(referrerRef, {
      tokensRemaining: FieldValue.increment(REFERRAL_REWARD),
    });

    tx.update(refereeRef, {
      referralRewarded: true,
      tokensRemaining: FieldValue.increment(REFERRAL_REWARD),
    });

    tx.create(db.collection(REFERRALS_COLLECTION).doc(), {
      referrerUid: refereeData.referredBy,
      refereeUid,
      tokensAwarded: REFERRAL_REWARD,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { tokensAwarded: REFERRAL_REWARD };
  });
}

module.exports = {
  generateReferralCode,
  lookupUserByReferralCode,
  recordReferral,
  claimReferralReward,
};
