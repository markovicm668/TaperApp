const crypto = require("node:crypto");
const express = require("express");
const { getEnv } = require("../config/env");
const purchaseService = require("../services/purchaseService");
const { createPlans } = require("../config/plans");

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

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// These carry a SubscriptionInvoice payload: data.id is an INVOICE id (not the
// subscription id) and there is no renews_at, so they must never reach the
// generic subscription_* state-sync below. Renewals arrive separately as
// subscription_updated with the subscription shape.
const SUBSCRIPTION_INVOICE_EVENTS = new Set([
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
]);

function createLemonWebhookRouter({
  getWebhookSecret = () => getEnv("LEMONSQUEEZY_WEBHOOK_SECRET"),
  getPlans = () => createPlans(),
  activateLifetimeOnce = purchaseService.activateLifetimeOnce,
  revokeOrderOnce = purchaseService.revokeOrderOnce,
  applySubscriptionState = purchaseService.applySubscriptionState,
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
          // e.g. an order created manually in the dashboard — nothing to do.
          console.warn(
            `-> Lemon order_created without custom user_id (order ${orderId ?? "?"}); skipping.`
          );
          return res.status(200).json({ received: true });
        }

        if (attributes.status !== "paid") {
          console.log(
            `-> Lemon order ${orderId} status "${attributes.status}"; ignoring.`
          );
          return res.status(200).json({ received: true });
        }

        const variantId = attributes.first_order_item?.variant_id;
        const plan = getPlans().getPlanByVariantId(variantId);
        if (!plan) {
          // Deliberately do NOT record the order: after the variant env vars
          // are fixed, the dashboard "Resend" redelivers and activation runs.
          console.error(
            `-> Lemon order ${orderId} has unknown variant ${variantId}; NOTHING granted. Fix LEMONSQUEEZY_VARIANT_ID_* and resend the webhook.`
          );
          return res.status(200).json({ received: true });
        }

        if (plan.type === "subscription") {
          // Lemon Squeezy also fires order_created for a subscription's first
          // order; entitlement for subscriptions is driven exclusively by the
          // subscription_* events, so this is just an ack.
          console.log(
            `-> Lemon order ${orderId} is the initial order of a "${plan.id}" subscription; handled via subscription events.`
          );
          return res.status(200).json({ received: true });
        }

        const result = await activateLifetimeOnce({
          uid,
          orderId: String(orderId),
          meta: {
            variantId: String(variantId),
            testMode: attributes.test_mode === true,
          },
        });
        console.log(
          result.activated
            ? `-> Lemon order ${orderId}: lifetime access activated for ${uid}.`
            : `-> Lemon order ${orderId}: duplicate delivery ignored (${result.reason}).`
        );
        return res.status(200).json({ received: true });
      }

      if (eventName === "order_refunded") {
        const orderId = payload.data?.id;
        if (!orderId) return res.status(200).json({ received: true });
        const result = await revokeOrderOnce({ orderId: String(orderId) });
        console.log(
          result.revoked
            ? `-> Lemon order ${orderId}: refund processed.`
            : `-> Lemon order ${orderId}: refund ignored (${result.reason}).`
        );
        return res.status(200).json({ received: true });
      }

      if (SUBSCRIPTION_INVOICE_EVENTS.has(eventName)) {
        return res.status(200).json({ received: true });
      }

      if (typeof eventName === "string" && eventName.startsWith("subscription_")) {
        const attrs = payload.data?.attributes || {};
        const subscriptionId = payload.data?.id;
        if (!subscriptionId) return res.status(200).json({ received: true });

        const plan = getPlans().getPlanByVariantId(attrs.variant_id);
        if (!plan) {
          console.error(
            `-> Lemon ${eventName} for subscription ${subscriptionId} has unknown variant ${attrs.variant_id}; NOTHING applied. Fix LEMONSQUEEZY_VARIANT_ID_* and resend the webhook.`
          );
          return res.status(200).json({ received: true });
        }

        const result = await applySubscriptionState({
          uid: payload.meta?.custom_data?.user_id ?? null,
          subscriptionId: String(subscriptionId),
          planId: plan.id,
          status: attrs.status,
          renewsAt: parseDate(attrs.renews_at),
          endsAt: parseDate(attrs.ends_at),
          updatedAt: parseDate(attrs.updated_at) ?? new Date(),
          raw: {
            variantId: String(attrs.variant_id),
            customerId: attrs.customer_id ?? null,
            orderId: attrs.order_id ? String(attrs.order_id) : null,
            testMode: attrs.test_mode === true,
          },
        });
        console.log(
          result.applied
            ? `-> Lemon ${eventName} sub ${subscriptionId}: plan "${plan.id}" status "${attrs.status}" applied.`
            : `-> Lemon ${eventName} sub ${subscriptionId}: skipped (${result.reason}).`
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
