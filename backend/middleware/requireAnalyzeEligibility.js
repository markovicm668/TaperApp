const { getUserAccess: realGetUserAccess } = require("../services/entitlementService");
const { isFreeTrialAvailable: realIsFreeTrialAvailable } = require("../services/freeTrialService");
const { getClientIpHash: realGetClientIpHash } = require("../utils/clientIp");
const { isAnonymousRequest } = require("../utils/authClaims");

const TRIAL_DENIED_MESSAGES = {
  FREE_TRIAL_USED: "Your free analysis has been used. Sign up to get more credits.",
  FREE_TRIAL_IP_LIMIT:
    "Free analysis limit reached for your network. Sign up to get more credits.",
};

// Read-only gate for the free parse prerequisite (/parse, /parse-pdf). Assumes
// requireAuth ran upstream. Blocks (without charging) anyone who could not
// afford the follow-up /analyze anyway, so a real Gemini parse is never burned
// on a request that can only 402. Anonymous users pass while their one free
// trial is unused and their network's trial window has room; real users pass
// with an active plan or a positive balance. The actual charge happens later,
// once, in chargeAnalysis on /analyze. Dependencies are injectable for testing.
function requireAnalyzeEligibility(
  cost,
  {
    getUserAccess = realGetUserAccess,
    isFreeTrialAvailable = realIsFreeTrialAvailable,
    getClientIpHash = realGetClientIpHash,
  } = {}
) {
  return async function (req, res, next) {
    try {
      if (isAnonymousRequest(req)) {
        const result = await isFreeTrialAvailable(req.auth.uid, getClientIpHash(req));
        if (!result.available) {
          return res.status(402).json({
            error: {
              code: result.reason,
              message: TRIAL_DENIED_MESSAGES[result.reason],
            },
          });
        }
        return next();
      }

      const access = await getUserAccess(req.auth.uid);
      if (access.entitled) return next();
      if (access.tokensRemaining < cost) {
        return res.status(402).json({
          error: {
            code: "INSUFFICIENT_TOKENS",
            message: `Insufficient tokens. Required: ${cost}, available: ${access.tokensRemaining}.`,
            tokensRemaining: access.tokensRemaining,
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
