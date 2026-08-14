// Credit packs purchasable via Lemon Squeezy. Credits per pack are code
// constants; variant IDs come from env because Lemon Squeezy test mode and
// live mode have different variant IDs for the "same" product. The client only
// ever sends a pack id — variant IDs and credit amounts never leave the server,
// so a tampered request can't buy a bigger grant.
function createCreditPacks(env = process.env) {
  const packs = [
    { id: "small", credits: 25, variantId: env.LEMONSQUEEZY_VARIANT_ID_SMALL },
    { id: "medium", credits: 75, variantId: env.LEMONSQUEEZY_VARIANT_ID_MEDIUM },
    { id: "large", credits: 200, variantId: env.LEMONSQUEEZY_VARIANT_ID_LARGE },
  ];

  function getPackById(packId) {
    return packs.find((pack) => pack.id === packId) || null;
  }

  function getPackByVariantId(variantId) {
    if (variantId === undefined || variantId === null) return null;
    return (
      packs.find(
        (pack) => pack.variantId && String(pack.variantId) === String(variantId)
      ) || null
    );
  }

  return { getPackById, getPackByVariantId };
}

module.exports = { createCreditPacks };
