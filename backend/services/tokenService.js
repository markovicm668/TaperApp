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

async function getTokensRemaining(uid) {
  const snap = await getUserRef(uid).get();
  return snap.exists ? snap.data().tokensRemaining : INITIAL_TOKENS;
}

// Charges saving a pre-computed (anonymously produced) analysis via
// POST /applications. The first such save per account is free — tracked by the
// freeSaveUsed flag — so the honest "try free → sign up → keep your analysis"
// funnel costs nothing exactly once; every later save costs 1 token.
async function chargeApplicationSave(uid) {
  const db = getFirebaseFirestore();
  const userRef = getUserRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);

    if (!snap.exists) {
      // The replay POST can beat /user/me's ensureUser for brand-new accounts;
      // mint the same doc shape it would, with the free save consumed.
      tx.set(userRef, {
        tokensRemaining: INITIAL_TOKENS,
        referralCode: generateReferralCode(),
        referredBy: null,
        createdAt: FieldValue.serverTimestamp(),
        freeSaveUsed: true,
      });
      return { charged: false, tokensRemaining: INITIAL_TOKENS };
    }

    const data = snap.data();
    if (!data.freeSaveUsed) {
      tx.update(userRef, { freeSaveUsed: true });
      return { charged: false, tokensRemaining: data.tokensRemaining };
    }

    if (data.tokensRemaining < 1) {
      const err = new Error(
        `Insufficient tokens. Required: 1, available: ${data.tokensRemaining}.`
      );
      err.code = "INSUFFICIENT_TOKENS";
      err.tokensRemaining = data.tokensRemaining;
      throw err;
    }

    const newBalance = data.tokensRemaining - 1;
    tx.update(userRef, { tokensRemaining: newBalance });
    return { charged: true, tokensRemaining: newBalance };
  });
}

// Best-effort compensation when the application write fails after a
// successful chargeApplicationSave.
async function refundApplicationSave(uid, { charged }) {
  const userRef = getUserRef(uid);
  if (charged) {
    await userRef.update({ tokensRemaining: FieldValue.increment(1) });
  } else {
    await userRef.update({ freeSaveUsed: false });
  }
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
  getTokensRemaining,
  chargeApplicationSave,
  refundApplicationSave,
  INITIAL_TOKENS,
  USERS_COLLECTION,
};
