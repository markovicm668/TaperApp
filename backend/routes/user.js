const express = require("express");
const { ensureUser, addTokens } = require("../services/tokenService");
const {
  lookupUserByReferralCode,
  recordReferral,
} = require("../services/referralService");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const refCode = req.query.ref || null;
    const userData = await ensureUser(req.auth.uid);

    if (userData.isNewUser && refCode) {
      const referrer = await lookupUserByReferralCode(refCode);
      if (referrer && referrer.uid !== req.auth.uid) {
        await recordReferral(referrer.uid, req.auth.uid);
      }
    }

    res.json({
      tokensRemaining: userData.tokensRemaining,
      referralCode: userData.referralCode,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/add-credits", async (req, res, next) => {
  try {
    const newBalance = await addTokens(req.auth.uid, 100);
    res.json({ tokensRemaining: newBalance });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
