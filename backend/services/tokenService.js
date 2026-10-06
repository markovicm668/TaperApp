const { getFirebaseFirestore } = require("./firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");
const { generateReferralCode } = require("./referralService");
const { computeEntitlement } = require("./entitlementService");

const INITIAL_TOKENS = 5;
const USERS_COLLECTION = "users";

function getUserRef(uid) {
  return getFirebaseFirestore().collection(USERS_COLLECTION).doc(uid);
}

// How many of this account's INITIAL_TOKENS grant have been spent. Credit
// provenance, not a second balance: it tells the résumé-fingerprint ledger
// which spends were free gifts (countable) and which the user earned via a
// referral or bought (never countable, never blockable).
//
// Absent on accounts created before this field existed. Those are read as
// grant-exhausted, since there is no way to reconstruct how much of their
// historical spend was grant-funded — lenient by design; new accounts are what
// the fingerprint ledger is for.
function readGrantSpent(data) {
  const value = data?.grantSpent;
  return Number.isFinite(value) ? value : INITIAL_TOKENS;
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
      grantSpent: 0,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(userRef, newUser);
    return { ...newUser, tokensRemaining: INITIAL_TOKENS, isNewUser: true };
  });
}

// Charges an analysis. Users on an active plan (see entitlementService) are
// not debited — their balance is returned untouched. One transaction, one
// read serving both the plan check and the balance.
//
// Also reports `fromGrant`: whether this spend came out of the signup grant
// rather than earned or purchased credits. The caller uses it to decide whether
// the spend counts against the per-résumé allowance — entitled spends and
// earned/bought spends never do.
async function chargeAnalysisTokens(uid, cost) {
  const db = getFirebaseFirestore();
  const userRef = getUserRef(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);

    let data;
    if (!snap.exists) {
      data = {
        tokensRemaining: INITIAL_TOKENS,
        grantSpent: 0,
        createdAt: FieldValue.serverTimestamp(),
      };
      tx.set(userRef, data);
      data.tokensRemaining = INITIAL_TOKENS;
    } else {
      data = snap.data();
    }

    if (computeEntitlement(data).entitled) {
      return {
        entitled: true,
        charged: false,
        fromGrant: false,
        tokensRemaining: data.tokensRemaining,
      };
    }

    if (data.tokensRemaining < cost) {
      const err = new Error(
        `Insufficient tokens. Required: ${cost}, available: ${data.tokensRemaining}.`
      );
      err.code = "INSUFFICIENT_TOKENS";
      err.tokensRemaining = data.tokensRemaining;
      throw err;
    }

    const grantSpent = readGrantSpent(data);
    const fromGrant = grantSpent < INITIAL_TOKENS;

    const newBalance = data.tokensRemaining - cost;
    tx.update(userRef, {
      tokensRemaining: newBalance,
      ...(fromGrant ? { grantSpent: Math.min(grantSpent + cost, INITIAL_TOKENS) } : {}),
    });
    return { entitled: false, charged: true, fromGrant, tokensRemaining: newBalance };
  });
}

// Compensates a charge whose analysis was refused after the fact — the
// per-résumé allowance check runs once the résumé has been parsed, which is
// necessarily after chargeAnalysisTokens has already debited. Rolls back
// `grantSpent` too, or a blocked attempt would silently burn a grant slot.
async function refundAnalysisTokens(uid, cost, { charged, fromGrant } = {}) {
  if (!charged) return;
  await getUserRef(uid).update({
    tokensRemaining: FieldValue.increment(cost),
    ...(fromGrant ? { grantSpent: FieldValue.increment(-cost) } : {}),
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
//
// That free save is granted value like the INITIAL_TOKENS are, so consuming it
// reports `fromGrant` and counts against the per-résumé allowance. Saves paid
// for with a token do not.
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
        grantSpent: 0,
        createdAt: FieldValue.serverTimestamp(),
        freeSaveUsed: true,
      });
      return {
        charged: false,
        entitled: false,
        fromGrant: true,
        tokensRemaining: INITIAL_TOKENS,
      };
    }

    const data = snap.data();

    // Entitled saves are free and must NOT consume freeSaveUsed — if the plan
    // later lapses, the account's one free save is still available.
    if (computeEntitlement(data).entitled) {
      return {
        charged: false,
        entitled: true,
        fromGrant: false,
        tokensRemaining: data.tokensRemaining,
      };
    }

    if (!data.freeSaveUsed) {
      tx.update(userRef, { freeSaveUsed: true });
      return {
        charged: false,
        entitled: false,
        fromGrant: true,
        tokensRemaining: data.tokensRemaining,
      };
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
    return { charged: true, entitled: false, fromGrant: false, tokensRemaining: newBalance };
  });
}

// Best-effort compensation when the application write fails after a
// successful chargeApplicationSave.
async function refundApplicationSave(uid, { charged, entitled }) {
  // An entitled save charged nothing and consumed nothing — in particular it
  // did NOT use freeSaveUsed, so the else branch below must not re-gift it.
  if (entitled) return;
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
  chargeAnalysisTokens,
  refundAnalysisTokens,
  addTokens,
  getTokensRemaining,
  chargeApplicationSave,
  refundApplicationSave,
  readGrantSpent,
  INITIAL_TOKENS,
  USERS_COLLECTION,
};
