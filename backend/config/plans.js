// Plans purchasable via Polar: two recurring subscriptions and a one-time
// lifetime unlock, each a separate Polar product. Product IDs come from env
// because Polar's sandbox and production environments have different IDs for
// the "same" product. The client only ever sends a plan id — product IDs never
// leave the server, so a tampered request can't buy a different product.
const PLAN_IDS = ["weekly", "monthly", "lifetime"];

function createPlans(env = process.env) {
  const plans = [
    { id: "weekly", type: "subscription", productId: env.POLAR_PRODUCT_ID_WEEKLY },
    { id: "monthly", type: "subscription", productId: env.POLAR_PRODUCT_ID_MONTHLY },
    { id: "lifetime", type: "lifetime", productId: env.POLAR_PRODUCT_ID_LIFETIME },
  ];

  function getPlanById(planId) {
    return plans.find((plan) => plan.id === planId) || null;
  }

  function getPlanByProductId(productId) {
    if (productId === undefined || productId === null) return null;
    return (
      plans.find(
        (plan) => plan.productId && String(plan.productId) === String(productId)
      ) || null
    );
  }

  return { getPlanById, getPlanByProductId };
}

module.exports = { createPlans, PLAN_IDS };
