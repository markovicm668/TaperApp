const { deductTokens } = require("../services/tokenService");

function optionalTokens(cost) {
  return async function (req, res, next) {
    if (!req.auth?.uid) {
      req.tokensRemaining = undefined;
      return next();
    }
    try {
      const newBalance = await deductTokens(req.auth.uid, cost);
      req.tokensRemaining = newBalance;
      next();
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

module.exports = optionalTokens;
