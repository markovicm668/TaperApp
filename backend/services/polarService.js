const { getEnv } = require("../config/env");

// Env is read inside each call (not at module load) so requiring this module
// without Polar configured — as tests and unrelated local dev do — never throws.
function createPolarService({ fetchImpl = fetch, env = null } = {}) {
  function readEnv(name) {
    if (env) {
      const value = env[name];
      if (!value || !String(value).trim()) {
        const err = new Error(`Missing required environment variable: ${name}`);
        err.code = "MISSING_ENV";
        throw err;
      }
      return value;
    }
    return getEnv(name);
  }

  // Sandbox and production are separate Polar environments with their own
  // tokens, products, and base URL. POLAR_SERVER selects which one.
  function apiBase() {
    const server = (env ? env.POLAR_SERVER : process.env.POLAR_SERVER) || "production";
    return server === "sandbox"
      ? "https://sandbox-api.polar.sh/v1"
      : "https://api.polar.sh/v1";
  }

  async function polarFetch(path, init = {}) {
    const token = readEnv("POLAR_ACCESS_TOKEN");
    const response = await fetchImpl(`${apiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`-> Polar API ${init.method || "GET"} ${path} failed (${response.status}):`, detail);
      const err = new Error(`Polar API error (${response.status}).`);
      err.code = "POLAR_API_ERROR";
      throw err;
    }
    return response.json();
  }

  // Creates a checkout for one product and returns its URL. The Firebase uid
  // rides along as both external_customer_id (Polar links a Customer to it) and
  // metadata.user_id — Polar propagates both to the order/subscription
  // webhooks, so the handler can credit the right account either way.
  // embed_origin must match the app origin or the overlay refuses to open.
  async function createCheckout({ productId, uid, email, embedOrigin, successUrl }) {
    const json = await polarFetch("/checkouts/", {
      method: "POST",
      body: JSON.stringify({
        products: [productId],
        external_customer_id: String(uid),
        metadata: { user_id: String(uid) },
        ...(email ? { customer_email: email } : {}),
        ...(embedOrigin ? { embed_origin: embedOrigin } : {}),
        ...(successUrl ? { success_url: successUrl } : {}),
      }),
    });
    return { url: json.url };
  }

  // Returns a fresh customer-portal URL. Portal sessions are short-lived, so
  // this is called per click and never stored.
  async function getCustomerPortalUrl(customerId) {
    const json = await polarFetch("/customer-sessions/", {
      method: "POST",
      body: JSON.stringify({ customer_id: String(customerId) }),
    });
    return json.customer_portal_url || null;
  }

  // Fallback for reading a subscription's current period on renewal, when the
  // order webhook doesn't embed the subscription object.
  async function getSubscription(subscriptionId) {
    return polarFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "GET",
    });
  }

  return { createCheckout, getCustomerPortalUrl, getSubscription };
}

module.exports = createPolarService();
module.exports.createPolarService = createPolarService;
