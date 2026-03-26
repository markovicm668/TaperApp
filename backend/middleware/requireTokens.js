const { deductTokens } = require("../services/tokenService");

function requireTokens(cost) {
  return async function (req, res, next) {
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

module.exports = requireTokens;
