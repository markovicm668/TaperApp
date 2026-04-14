const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { generateReferralCode } = require("./referralService");

const INITIAL_TOKENS = 5;
const USERS_COLLECTION = "users";

function getUserRef(uid) {
  return getFirebaseFirestore().collection(USERS_COLLECTION).doc(uid);
}

async function ensureUser(uid) {
  const db = getFirebaseFirestore();
  const userRef = getUserRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists) {
      const data = snap.data();
      if (!data.referralCode) {
        const referralCode = generateReferralCode();
        tx.update(userRef, { referralCode, referredBy: data.referredBy ?? null });
        data.referralCode = referralCode;
      }
      return { ...data, isNewUser: false };
    }

    const newUser = {
      tokensRemaining: INITIAL_TOKENS,
      referralCode: generateReferralCode(),
      referredBy: null,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(userRef, newUser);
    return { ...newUser, tokensRemaining: INITIAL_TOKENS, isNewUser: true };
  });
}

async function deductTokens(uid, cost) {
  const db = getFirebaseFirestore();
  const userRef = getUserRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);

    let data;
    if (!snap.exists) {
      data = {
        tokensRemaining: INITIAL_TOKENS,
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.set(userRef, data);
      data.tokensRemaining = INITIAL_TOKENS;
    } else {
      data = snap.data();
    }

    if (data.tokensRemaining < cost) {
      const err = new Error(
        `Insufficient tokens. Required: ${cost}, available: ${data.tokensRemaining}.`
      );
      err.code = "INSUFFICIENT_TOKENS";
      err.tokensRemaining = data.tokensRemaining;
      throw err;
    }

    const newBalance = data.tokensRemaining - cost;
    tx.update(userRef, { tokensRemaining: newBalance });
    return newBalance;
  });
}

async function addTokens(uid, amount) {
  const db = getFirebaseFirestore();
  const userRef = getUserRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      const newBalance = INITIAL_TOKENS + amount;
      tx.set(userRef, {
        tokensRemaining: newBalance,
        createdAt: FieldValue.serverTimestamp(),
      });
      return newBalance;
    }

    const data = snap.data();
    const newBalance = data.tokensRemaining + amount;
    tx.update(userRef, { tokensRemaining: newBalance });
    return newBalance;
  });
}

module.exports = {
  ensureUser,
  deductTokens,
  addTokens,
};
