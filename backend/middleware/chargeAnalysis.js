const { chargeAnalysisTokens: realChargeAnalysisTokens } = require("../services/tokenService");
const { consumeFreeTrial: realConsumeFreeTrial } = require("../services/freeTrialService");
const { getClientIpHash: realGetClientIpHash } = require("../utils/clientIp");
const { isAnonymousRequest } = require("../utils/authClaims");

const TRIAL_DENIED_MESSAGES = {
  FREE_TRIAL_USED: "Your free analysis has been used. Sign up to get more credits.",
  FREE_TRIAL_IP_LIMIT:
    "Free analysis limit reached for your network. Sign up to get more credits.",
};

// Charges an analysis. Assumes requireAuth ran upstream, so req.auth.uid is
// always present (anonymous or real). Anonymous users spend their one free
// trial (throttled per client IP); real users are debited a token unless an
// active plan entitles them to unlimited use (chargeTokens decides). The only
// place a token is deducted or a trial consumed on the /analyze path.
// Dependencies are injectable for testing (mirrors createRequireAuth).
function chargeAnalysis(
  cost,
  {
    chargeTokens = realChargeAnalysisTokens,
    consumeFreeTrial = realConsumeFreeTrial,
    getClientIpHash = realGetClientIpHash,
  } = {}
) {
  return async function (req, res, next) {
    try {
      if (isAnonymousRequest(req)) {
        const result = await consumeFreeTrial(req.auth.uid, getClientIpHash(req));
        if (!result.ok) {
          return res.status(402).json({
            error: {
              code: result.reason,
              message: TRIAL_DENIED_MESSAGES[result.reason],
            },
          });
        }
        req.tokensRemaining = undefined;
        return next();
      }

      const result = await chargeTokens(req.auth.uid, cost);
      req.tokensRemaining = result.tokensRemaining;
      req.entitled = result.entitled;
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
