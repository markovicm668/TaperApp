const { getTokensRemaining: realGetTokensRemaining } = require("../services/tokenService");
const { isFreeTrialAvailable: realIsFreeTrialAvailable } = require("../services/freeTrialService");
const { isAnonymousRequest } = require("../utils/authClaims");

// Read-only gate for the free parse prerequisite (/parse, /parse-pdf). Assumes
// requireAuth ran upstream. Blocks (without charging) anyone who could not
// afford the follow-up /analyze anyway, so a real Gemini parse is never burned
// on a request that can only 402. Anonymous users pass while their one free
// trial is unused; real users pass with a positive balance. The actual charge
// happens later, once, in chargeAnalysis on /analyze. Dependencies are
// injectable for testing.
function requireAnalyzeEligibility(
  cost,
  {
    getTokensRemaining = realGetTokensRemaining,
    isFreeTrialAvailable = realIsFreeTrialAvailable,
  } = {}
) {
  return async function (req, res, next) {
    try {
      if (isAnonymousRequest(req)) {
        const available = await isFreeTrialAvailable(req.auth.uid);
        if (!available) {
          return res.status(402).json({
            error: {
              code: "FREE_TRIAL_USED",
              message: "Your free analysis has been used. Sign up to get more credits.",
            },
          });
        }
        return next();
      }

      const balance = await getTokensRemaining(req.auth.uid);
      if (balance < cost) {
        return res.status(402).json({
          error: {
            code: "INSUFFICIENT_TOKENS",
            message: `Insufficient tokens. Required: ${cost}, available: ${balance}.`,
            tokensRemaining: balance,
          },
        });
      }
      return next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireAnalyzeEligibility;
