const { deductTokens: realDeductTokens } = require("../services/tokenService");
const { consumeFreeTrial: realConsumeFreeTrial } = require("../services/freeTrialService");
const { isAnonymousRequest } = require("../utils/authClaims");

// Charges an analysis. Assumes requireAuth ran upstream, so req.auth.uid is
// always present (anonymous or real). Anonymous users spend their one free
// trial; real users are debited a token. The only place a token is deducted
// or a trial consumed on the /analyze path. Dependencies are injectable for
// testing (mirrors createRequireAuth).
function chargeAnalysis(
  cost,
  { deductTokens = realDeductTokens, consumeFreeTrial = realConsumeFreeTrial } = {}
) {
  return async function (req, res, next) {
    try {
      if (isAnonymousRequest(req)) {
        const allowed = await consumeFreeTrial(req.auth.uid);
        if (!allowed) {
          return res.status(402).json({
            error: {
              code: "FREE_TRIAL_USED",
              message: "Your free analysis has been used. Sign up to get more credits.",
            },
          });
        }
        req.tokensRemaining = undefined;
        return next();
      }

      const newBalance = await deductTokens(req.auth.uid, cost);
      req.tokensRemaining = newBalance;
      return next();
    } catch (err) {
      if (err.code === "INSUFFICIENT_TOKENS") {
        return res.status(402).json({
          error: {
            code: "INSUFFICIENT_TOKENS",
            message: err.message,
            tokensRemaining: err.tokensRemaining,
          },
        });
      }
      next(err);
    }
  };
}

module.exports = chargeAnalysis;
