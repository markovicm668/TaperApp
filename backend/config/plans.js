// Plans purchasable via Lemon Squeezy: two auto-renewing subscriptions and a
// one-time lifetime unlock. Variant IDs come from env because Lemon Squeezy
// test mode and live mode have different variant IDs for the "same" product.
// The client only ever sends a plan id — variant IDs never leave the server,
// so a tampered request can't buy a different product than it paid for.
const PLAN_IDS = ["weekly", "monthly", "lifetime"];

function createPlans(env = process.env) {
  const plans = [
    { id: "weekly", type: "subscription", variantId: env.LEMONSQUEEZY_VARIANT_ID_WEEKLY },
    { id: "monthly", type: "subscription", variantId: env.LEMONSQUEEZY_VARIANT_ID_MONTHLY },
    { id: "lifetime", type: "lifetime", variantId: env.LEMONSQUEEZY_VARIANT_ID_LIFETIME },
  ];

  function getPlanById(planId) {
    return plans.find((plan) => plan.id === planId) || null;
  }

  function getPlanByVariantId(variantId) {
    if (variantId === undefined || variantId === null) return null;
    return (
      plans.find(
        (plan) => plan.variantId && String(plan.variantId) === String(variantId)
      ) || null
    );
  }

  return { getPlanById, getPlanByVariantId };
}

module.exports = { createPlans, PLAN_IDS };
