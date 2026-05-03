const { getFirebaseAuth } = require("../services/firebaseAdmin");

function createOptionalAuth({
  verifyIdToken = async (token) => getFirebaseAuth().verifyIdToken(token),
} = {}) {
  return async function optionalAuth(req, res, next) {
    const authHeader = req.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      req.auth = null;
      return next();
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      req.auth = null;
      return next();
    }

    try {
      const decodedToken = await verifyIdToken(token);
      req.auth = decodedToken;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("-> optionalAuth: token present but invalid, proceeding as anonymous:", error?.message || error);
      req.auth = null;
    }
    return next();
  };
}

const optionalAuth = createOptionalAuth();

module.exports = optionalAuth;
module.exports.createOptionalAuth = createOptionalAuth;
