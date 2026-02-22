const { getFirebaseAuth } = require("../services/firebaseAdmin");

function sendUnauthorized(res, code, message) {
  return res.status(401).json({
    error: {
      code,
      message,
    },
  });
}

function createRequireAuth({
  verifyIdToken = async (token) => getFirebaseAuth().verifyIdToken(token),
} = {}) {
  return async function requireAuth(req, res, next) {
    const authHeader = req.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return sendUnauthorized(
        res,
        "AUTH_REQUIRED",
        "Authentication required. Provide a Bearer token."
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return sendUnauthorized(
        res,
        "AUTH_REQUIRED",
        "Authentication required. Provide a Bearer token."
      );
    }

    try {
      const decodedToken = await verifyIdToken(token);
      req.auth = decodedToken;
      return next();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("-> Auth verification failed:", error?.message || error);
      return sendUnauthorized(
        res,
        "AUTH_INVALID",
        "Invalid or expired authentication token."
      );
    }
  };
}

const requireAuth = createRequireAuth();

module.exports = requireAuth;
module.exports.createRequireAuth = createRequireAuth;
