const { getTokensRemaining } = require("../services/tokenService");

function requirePositiveBalance(cost) {
  return async function (req, res, next) {
    if (!req.auth?.uid) {
      return next(); // anonymous users keep the free trial, untouched
    }
    try {
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

module.exports = requirePositiveBalance;
