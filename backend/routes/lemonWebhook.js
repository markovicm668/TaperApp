const crypto = require("node:crypto");
const express = require("express");
const { getEnv } = require("../config/env");
const purchaseService = require("../services/purchaseService");
const { createCreditPacks } = require("../config/creditPacks");

// Lemon Squeezy signs each delivery with HMAC-SHA256 over the exact raw body
// bytes, hex-encoded in the X-Signature header. Comparison is timing-safe so
// the check can't be probed byte-by-byte.
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !Buffer.isBuffer(rawBody)) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const provided = Buffer.from(String(signatureHeader), "utf8");
  return (
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided)
  );
}

function createLemonWebhookRouter({
  getWebhookSecret = () => getEnv("LEMONSQUEEZY_WEBHOOK_SECRET"),
  grantOrderTokensOnce = purchaseService.grantOrderTokensOnce,
  revokeOrderTokensOnce = purchaseService.revokeOrderTokensOnce,
  getPacks = () => createCreditPacks(),
} = {}) {
  const router = express.Router();

  // No requireAuth here — deliveries are server-to-server from Lemon Squeezy;
  // the HMAC signature is the authentication.

  router.post("/", async (req, res) => {
    try {
      let secret;
      try {
        secret = getWebhookSecret();
      } catch (err) {
        console.error("-> Lemon webhook secret not configured:", err);
        return res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: "Internal server error." },
        });
      }

      // req.body must be the raw Buffer (express.raw mounted in index.js
      // BEFORE the global express.json) or the signature can't be verified.
      if (!verifySignature(req.body, req.get("X-Signature"), secret)) {
        console.warn("-> Lemon webhook rejected: invalid signature.");
        return res.status(400).json({
          error: { code: "INVALID_SIGNATURE", message: "Invalid signature." },
        });
      }

      let payload;
      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch (err) {
        return res.status(400).json({
          error: { code: "INVALID_PAYLOAD", message: "Body must be JSON." },
        });
      }

      const eventName = payload?.meta?.event_name;

      if (eventName === "order_created") {
        const uid = payload.meta?.custom_data?.user_id;
        const orderId = payload.data?.id;
        const attributes = payload.data?.attributes || {};

        if (!uid || !orderId) {
          // e.g. an order created manually in the dashboard — nothing to grant.
          console.warn(
            `-> Lemon order_created without custom user_id (order ${orderId ?? "?"}); skipping grant.`
          );
          return res.status(200).json({ received: true });
        }

        if (attributes.status !== "paid") {
          console.log(
            `-> Lemon order ${orderId} status "${attributes.status}"; not granting.`
          );
          return res.status(200).json({ received: true });
        }

        const variantId = attributes.first_order_item?.variant_id;
        const pack = getPacks().getPackByVariantId(variantId);
        if (!pack) {
          // Deliberately do NOT record the order: after the variant env vars
          // are fixed, the dashboard "Resend" redelivers and the grant runs.
          console.error(
            `-> Lemon order ${orderId} has unknown variant ${variantId}; NO credits granted. Fix LEMONSQUEEZY_VARIANT_ID_* and resend the webhook.`
          );
          return res.status(200).json({ received: true });
        }

        const result = await grantOrderTokensOnce({
          uid,
          amount: pack.credits,
          orderId: String(orderId),
          meta: {
            packId: pack.id,
            variantId: String(variantId),
            testMode: attributes.test_mode === true,
          },
        });
        console.log(
          result.granted
            ? `-> Lemon order ${orderId}: granted ${pack.credits} credits to ${uid} (balance ${result.newBalance}).`
            : `-> Lemon order ${orderId}: duplicate delivery ignored (${result.reason}).`
        );
        return res.status(200).json({ received: true });
      }

      if (eventName === "order_refunded") {
        const orderId = payload.data?.id;
        if (!orderId) return res.status(200).json({ received: true });
        const result = await revokeOrderTokensOnce({ orderId: String(orderId) });
        console.log(
          result.revoked
            ? `-> Lemon order ${orderId}: refund revoked credits (balance ${result.newBalance}).`
            : `-> Lemon order ${orderId}: refund ignored (${result.reason}).`
        );
        return res.status(200).json({ received: true });
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("-> Lemon webhook error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
    }
  });

  return router;
}

module.exports = createLemonWebhookRouter();
module.exports.createLemonWebhookRouter = createLemonWebhookRouter;
module.exports.verifySignature = verifySignature;
