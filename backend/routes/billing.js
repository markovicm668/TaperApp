const express = require("express");
const lemonSqueezyService = require("../services/lemonSqueezyService");
const { createPlans } = require("../config/plans");
const { getUserAccess: realGetUserAccess } = require("../services/entitlementService");
const { isAnonymousRequest } = require("../utils/authClaims");

function createBillingRouter({
  createCheckout = lemonSqueezyService.createCheckout,
  getSubscription = lemonSqueezyService.getSubscription,
  getUserAccess = realGetUserAccess,
  getPlans = () => createPlans(),
} = {}) {
  const router = express.Router();

  // Assumes requireAuth ran upstream (mounted in index.js).

  router.post("/checkout", async (req, res) => {
    try {
      if (isAnonymousRequest(req)) {
        return res.status(403).json({
          error: { code: "ANONYMOUS_FORBIDDEN", message: "Sign in to upgrade." },
        });
      }

      const plan = getPlans().getPlanById(req.body?.planId);
      if (!plan) {
        return res.status(400).json({
          error: { code: "UNKNOWN_PLAN", message: "Unknown plan." },
        });
      }
      if (!plan.variantId) {
        console.error(
          `-> Billing misconfigured: no Lemon Squeezy variant id for plan "${plan.id}".`
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
          variantId: plan.variantId,
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

      return res.status(200).json({ url: checkout.url, planId: plan.id });
    } catch (err) {
      console.error("-> Billing checkout error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
    }
  });

  // Returns a fresh Lemon Squeezy customer-portal URL (they are signed and
  // expiring, so one is fetched per click — never stored).
  router.get("/portal", async (req, res) => {
    try {
      if (isAnonymousRequest(req)) {
        return res.status(403).json({
          error: { code: "ANONYMOUS_FORBIDDEN", message: "Sign in first." },
        });
      }

      const access = await getUserAccess(req.auth.uid);
      if (!access.subscriptionId) {
        return res.status(404).json({
          error: { code: "NO_SUBSCRIPTION", message: "No subscription to manage." },
        });
      }

      let subscription;
      try {
        subscription = await getSubscription(access.subscriptionId);
      } catch (err) {
        if (err.code === "LEMONSQUEEZY_API_ERROR" || err.code === "MISSING_ENV") {
          console.error("-> Portal fetch failed:", err);
          return res.status(502).json({
            error: {
              code: "PORTAL_FAILED",
              message: "Could not open the billing portal. Please try again.",
            },
          });
        }
        throw err;
      }

      if (!subscription.customerPortalUrl) {
        return res.status(502).json({
          error: {
            code: "PORTAL_FAILED",
            message: "Could not open the billing portal. Please try again.",
          },
        });
      }

      return res.status(200).json({ url: subscription.customerPortalUrl });
    } catch (err) {
      console.error("-> Billing portal error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
    }
  });

  return router;
}

module.exports = createBillingRouter();
module.exports.createBillingRouter = createBillingRouter;
