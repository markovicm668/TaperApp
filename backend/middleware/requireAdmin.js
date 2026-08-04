const { getEnv } = require("../config/env");

function requireAdmin(req, res, next) {
  const adminEmail = getEnv("ADMIN_EMAIL", { required: false });
  if (!adminEmail || req.auth?.email !== adminEmail) {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "You are not authorized to perform this action.",
      },
    });
  }
  return next();
}

module.exports = requireAdmin;
