const { getEnv } = require("../config/env");

const API_URL = "https://api.lemonsqueezy.com/v1/checkouts";

// Env is read inside each call (not at module load) so requiring this module
// without Lemon Squeezy configured — as tests and unrelated local dev do —
// never throws.
function createLemonSqueezyService({ fetchImpl = fetch, env = null } = {}) {
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

  // Creates a hosted checkout for one variant and returns its URL. The Firebase
  // uid rides along in checkout_data.custom so the order_created webhook can
  // credit the right account; Lemon Squeezy requires custom values to be strings.
  async function createCheckout({ variantId, uid, email }) {
    const apiKey = readEnv("LEMONSQUEEZY_API_KEY");
    const storeId = readEnv("LEMONSQUEEZY_STORE_ID");

    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_options: { embed: true },
          checkout_data: {
            ...(email ? { email } : {}),
            custom: { user_id: String(uid) },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(storeId) } },
          variant: { data: { type: "variants", id: String(variantId) } },
        },
      },
    };

    const response = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `-> Lemon Squeezy checkout failed (${response.status}):`,
        detail
      );
      const err = new Error(`Lemon Squeezy API error (${response.status}).`);
      err.code = "LEMONSQUEEZY_API_ERROR";
      throw err;
    }

    const json = await response.json();
    return { url: json.data.attributes.url };
  }

  return { createCheckout };
}

module.exports = createLemonSqueezyService();
module.exports.createLemonSqueezyService = createLemonSqueezyService;
