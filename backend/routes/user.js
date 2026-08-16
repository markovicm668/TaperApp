const express = require("express");
const { ensureUser, addTokens } = require("../services/tokenService");
const { computeEntitlement, toMillis } = require("../services/entitlementService");
const {
  lookupUserByReferralCode,
  recordReferral,
} = require("../services/referralService");
const requireAdmin = require("../middleware/requireAdmin");
const { isAnonymousRequest } = require("../utils/authClaims");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    // Anonymous (free-trial) users have no real account; never mint a
    // 5-token user doc for them via ensureUser.
    if (isAnonymousRequest(req)) {
      return res.json({
        tokensRemaining: 0,
        referralCode: null,
        plan: null,
        entitled: false,
        planExpiresAt: null,
        subscriptionStatus: null,
        hasSubscription: false,
      });
    }

    const refCode = req.query.ref || null;
    const userData = await ensureUser(req.auth.uid);

    if (userData.isNewUser && refCode) {
      const referrer = await lookupUserByReferralCode(refCode);
      if (referrer && referrer.uid !== req.auth.uid) {
        await recordReferral(referrer.uid, req.auth.uid);
      }
    }

    const access = computeEntitlement(userData);
    const expiresMs = toMillis(userData.planExpiresAt);
    res.json({
      tokensRemaining: userData.tokensRemaining,
      referralCode: userData.referralCode,
      plan: access.plan,
      entitled: access.entitled,
      planExpiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
      subscriptionStatus: userData.subscriptionStatus ?? null,
      hasSubscription: Boolean(userData.subscriptionId),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/add-credits", requireAdmin, async (req, res, next) => {
  try {
    const newBalance = await addTokens(req.auth.uid, 100);
    res.json({ tokensRemaining: newBalance });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
