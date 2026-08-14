const express = require("express");
const lemonSqueezyService = require("../services/lemonSqueezyService");
const { createCreditPacks } = require("../config/creditPacks");
const { isAnonymousRequest } = require("../utils/authClaims");

function createBillingRouter({
  createCheckout = lemonSqueezyService.createCheckout,
  getPacks = () => createCreditPacks(),
} = {}) {
  const router = express.Router();

  // Assumes requireAuth ran upstream (mounted in index.js).

  router.post("/checkout", async (req, res) => {
    try {
      if (isAnonymousRequest(req)) {
        return res.status(403).json({
          error: { code: "ANONYMOUS_FORBIDDEN", message: "Sign in to buy credits." },
        });
      }

      const pack = getPacks().getPackById(req.body?.packId);
      if (!pack) {
        return res.status(400).json({
          error: { code: "UNKNOWN_PACK", message: "Unknown credit pack." },
        });
      }
      if (!pack.variantId) {
        console.error(
          `-> Billing misconfigured: no Lemon Squeezy variant id for pack "${pack.id}".`
        );
        return res.status(500).json({
          error: {
            code: "BILLING_NOT_CONFIGURED",
            message: "Purchases are not available right now.",
          },
        });
      }

      let checkout;
      try {
        checkout = await createCheckout({
          variantId: pack.variantId,
          uid: req.auth.uid,
          email: req.auth.email,
        });
      } catch (err) {
        if (err.code === "LEMONSQUEEZY_API_ERROR" || err.code === "MISSING_ENV") {
          console.error("-> Checkout creation failed:", err);
          return res.status(502).json({
            error: {
              code: "CHECKOUT_FAILED",
              message: "Could not start checkout. Please try again.",
            },
          });
        }
        throw err;
      }

      return res.status(200).json({ url: checkout.url, packId: pack.id });
    } catch (err) {
      console.error("-> Billing checkout error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
    }
  });

  return router;
}

module.exports = createBillingRouter();
module.exports.createBillingRouter = createBillingRouter;
