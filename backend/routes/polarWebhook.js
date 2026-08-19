const express = require("express");
const { Webhook } = require("standardwebhooks");
const { getEnv } = require("../config/env");
const purchaseService = require("../services/purchaseService");
const polarService = require("../services/polarService");
const { createPlans } = require("../config/plans");

// Polar signs deliveries with the Standard Webhooks spec (base64 HMAC-SHA256
// over `${webhook-id}.${webhook-timestamp}.${body}`). The `standardwebhooks`
// lib verifies it and returns the parsed event, or throws.
function defaultVerifyEvent(rawBody, headers, secret) {
  // standardwebhooks expects a base64 secret (optionally whsec_-prefixed).
  // Polar's dashboard secret is either already whsec_-prefixed or a plain
  // string; normalize both. (Confirm against a real sandbox delivery.)
  const normalized = secret.startsWith("whsec_")
    ? secret
    : Buffer.from(secret).toString("base64");
  const wh = new Webhook(normalized);
  return wh.verify(rawBody, headers);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Maps a Polar subscription's fields to when the entitlement lapses. Fail-
// closed: a revoked/ended subscription resolves to a past timestamp.
function computePlanExpiresAt({ status, currentPeriodEnd, endsAt, cancelAtPeriodEnd, updatedAt }) {
  if (["revoked", "ended", "unpaid"].includes(status)) {
    return endsAt ?? updatedAt;
  }
  // A subscription set to cancel keeps access until the period end.
  if (cancelAtPeriodEnd && endsAt) {
    return endsAt;
  }
  if (["active", "trialing", "past_due", "canceled", "cancelled"].includes(status)) {
    return currentPeriodEnd ?? endsAt ?? updatedAt;
  }
  // Unknown status: fail closed.
  return endsAt ?? updatedAt;
}

function subscriptionUid(data) {
  return data.metadata?.user_id ?? data.external_customer_id ?? null;
}

function createPolarWebhookRouter({
  getWebhookSecret = () => getEnv("POLAR_WEBHOOK_SECRET"),
  verifyEvent = defaultVerifyEvent,
  getPlans = () => createPlans(),
  applySubscriptionState = purchaseService.applySubscriptionState,
  activateLifetimeOnce = purchaseService.activateLifetimeOnce,
  revokeOrderOnce = purchaseService.revokeOrderOnce,
  getSubscription = polarService.getSubscription,
} = {}) {
  const router = express.Router();

  // Applies a subscription object (from a subscription.* event, or the
  // subscription embedded in a renewal order) to the plan state.
  async function syncSubscription(sub, plans) {
    const plan = plans.getPlanByProductId(sub.product_id);
    if (!plan) {
      console.error(
        `-> Polar subscription ${sub.id} has unknown product ${sub.product_id}; NOTHING applied. Fix POLAR_PRODUCT_ID_* and resend.`
      );
      return { applied: false, reason: "UNKNOWN_PRODUCT" };
    }
    const updatedAt = parseDate(sub.modified_at) ?? new Date();
    const planExpiresAt = computePlanExpiresAt({
      status: sub.status,
      currentPeriodEnd: parseDate(sub.current_period_end),
      endsAt: parseDate(sub.ends_at),
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      updatedAt,
    });
    return applySubscriptionState({
      uid: subscriptionUid(sub),
      subscriptionId: String(sub.id),
      planId: plan.id,
      status: sub.status,
      planExpiresAt,
      updatedAt,
      raw: { polarCustomerId: sub.customer_id ?? null, productId: String(sub.product_id) },
    });
  }

  // No requireAuth — deliveries are server-to-server; the Standard Webhooks
  // signature is the authentication. req.body must be the raw Buffer
  // (express.raw mounted in index.js BEFORE the global express.json).
  router.post("/", async (req, res) => {
    let secret;
    try {
      secret = getWebhookSecret();
    } catch (err) {
      console.error("-> Polar webhook secret not configured:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
    }

    let event;
    try {
      event = verifyEvent(req.body, req.headers, secret);
    } catch (err) {
      console.warn("-> Polar webhook rejected: invalid signature/payload.");
      return res.status(400).json({
        error: { code: "INVALID_SIGNATURE", message: "Invalid signature." },
      });
    }

    try {
      const plans = getPlans();
      const type = event?.type;
      const data = event?.data || {};

      if (typeof type === "string" && type.startsWith("subscription.")) {
        const result = await syncSubscription(data, plans);
        console.log(
          result.applied
            ? `-> Polar ${type} sub ${data.id}: plan applied (status ${data.status}).`
            : `-> Polar ${type} sub ${data.id}: skipped (${result.reason}).`
        );
        return res.status(200).json({ received: true });
      }

      if (type === "order.created") {
        const plan = plans.getPlanByProductId(data.product_id);
        if (!plan) {
          console.error(
            `-> Polar order ${data.id} has unknown product ${data.product_id}; NOTHING granted. Fix POLAR_PRODUCT_ID_* and resend.`
          );
          return res.status(200).json({ received: true });
        }

        if (plan.type === "lifetime") {
          const paid = data.paid === true || ["paid", "succeeded"].includes(data.status);
          if (!paid) {
            console.log(`-> Polar order ${data.id} not paid (status ${data.status}); ignoring.`);
            return res.status(200).json({ received: true });
          }
          const uid = subscriptionUid(data);
          if (!uid) {
            console.warn(`-> Polar order ${data.id} has no user id; skipping.`);
            return res.status(200).json({ received: true });
          }
          const result = await activateLifetimeOnce({
            uid,
            orderId: String(data.id),
            meta: { polarCustomerId: data.customer_id ?? null, productId: String(data.product_id) },
          });
          console.log(
            result.activated
              ? `-> Polar order ${data.id}: lifetime activated for ${uid}.`
              : `-> Polar order ${data.id}: duplicate ignored (${result.reason}).`
          );
          return res.status(200).json({ received: true });
        }

        // Subscription product order. Renewals (subscription_cycle) advance the
        // period; the initial order is owned by subscription.created, so ack it.
        if (data.billing_reason === "subscription_cycle") {
          const sub = data.subscription || (await getSubscription(data.subscription_id));
          const result = await syncSubscription(sub, plans);
          console.log(
            `-> Polar order ${data.id}: renewal ${result.applied ? "applied" : `skipped (${result.reason})`}.`
          );
          return res.status(200).json({ received: true });
        }
        return res.status(200).json({ received: true });
      }

      if (type === "order.refunded" || type === "refund.created") {
        const orderId = data.order_id || data.id;
        if (orderId) {
          const result = await revokeOrderOnce({ orderId: String(orderId) });
          console.log(
            result.revoked
              ? `-> Polar refund for order ${orderId}: revoked.`
              : `-> Polar refund for order ${orderId}: ignored (${result.reason}).`
          );
        }
        return res.status(200).json({ received: true });
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("-> Polar webhook error:", err);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error." },
      });
    }
  });

  return router;
}

module.exports = createPolarWebhookRouter();
module.exports.createPolarWebhookRouter = createPolarWebhookRouter;
module.exports.defaultVerifyEvent = defaultVerifyEvent;
module.exports.computePlanExpiresAt = computePlanExpiresAt;
