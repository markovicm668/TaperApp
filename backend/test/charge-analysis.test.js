const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const chargeAnalysis = require("../middleware/chargeAnalysis");
const { createRequireAuth } = require("../middleware/requireAuth");

// Builds a server: requireAuth (fake verify) -> chargeAnalysis(fake deps) -> ok.
// Tokens are simulated by an in-memory balances map; the free trial by a set of
// uids that have already used it plus a per-ipHash consumption counter. Any
// bearer token of the form "anon:<uid>" authenticates as that anonymous uid.
async function withServer(
  { balances = {}, usedTrials = new Set(), ipCounts = {}, ipHash = "ip-hash-1", ipLimit = 2 },
  run
) {
  const app = express();
  app.use(express.json());

  const requireAuth = createRequireAuth({
    verifyIdToken: async (token) => {
      if (token === "anon-token") {
        return { uid: "anon-1", firebase: { sign_in_provider: "anonymous" } };
      }
      if (token.startsWith("anon:")) {
        return { uid: token.slice(5), firebase: { sign_in_provider: "anonymous" } };
      }
      if (token === "real-token") {
        return { uid: "real-1", firebase: { sign_in_provider: "google.com" } };
      }
      throw new Error("invalid token");
    },
  });

  const deductTokens = async (uid, cost) => {
    const current = balances[uid] ?? 0;
    if (current < cost) {
      const err = new Error(`Insufficient tokens. Required: ${cost}, available: ${current}.`);
      err.code = "INSUFFICIENT_TOKENS";
      err.tokensRemaining = current;
      throw err;
    }
    balances[uid] = current - cost;
    return balances[uid];
  };

  const consumeFreeTrial = async (uid, hash) => {
    if (usedTrials.has(uid)) return { ok: false, reason: "FREE_TRIAL_USED" };
    if (hash !== null && (ipCounts[hash] ?? 0) >= ipLimit) {
      return { ok: false, reason: "FREE_TRIAL_IP_LIMIT" };
    }
    usedTrials.add(uid);
    if (hash !== null) ipCounts[hash] = (ipCounts[hash] ?? 0) + 1;
    return { ok: true };
  };

  app.use(
    "/analyze",
    requireAuth,
    chargeAnalysis(1, { deductTokens, consumeFreeTrial, getClientIpHash: () => ipHash }),
    (req, res) => res.status(200).json({ ok: true, tokensRemaining: req.tokensRemaining })
  );

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl, { balances, usedTrials, ipCounts });
  } finally {
    server.close();
    await once(server, "close");
  }
}

function post(baseUrl, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/analyze`, { method: "POST", headers, body: "{}" });
}

test("token-less /analyze is rejected (401) — closes the exploit", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const res = await post(baseUrl, null);
    assert.equal(res.status, 401);
  });
});

test("anonymous first analysis is allowed, second is 402 FREE_TRIAL_USED", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    const first = await post(baseUrl, "anon-token");
    assert.equal(first.status, 200);

    const second = await post(baseUrl, "anon-token");
    assert.equal(second.status, 402);
    const body = await second.json();
    assert.equal(body.error.code, "FREE_TRIAL_USED");
  });
});

test("real user with balance is charged one token", { concurrency: false }, async () => {
  await withServer({ balances: { "real-1": 3 } }, async (baseUrl, state) => {
    const res = await post(baseUrl, "real-token");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.tokensRemaining, 2);
    assert.equal(state.balances["real-1"], 2);
  });
});

test("real user at zero balance gets 402 INSUFFICIENT_TOKENS", { concurrency: false }, async () => {
  await withServer({ balances: { "real-1": 0 } }, async (baseUrl) => {
    const res = await post(baseUrl, "real-token");
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.equal(body.error.code, "INSUFFICIENT_TOKENS");
    assert.equal(body.error.tokensRemaining, 0);
  });
});

test("fresh anon uids from one IP hit the limit: 2 pass, 3rd is 402 FREE_TRIAL_IP_LIMIT", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl, state) => {
    assert.equal((await post(baseUrl, "anon:a1")).status, 200);
    assert.equal((await post(baseUrl, "anon:a2")).status, 200);

    const third = await post(baseUrl, "anon:a3");
    assert.equal(third.status, 402);
    const body = await third.json();
    assert.equal(body.error.code, "FREE_TRIAL_IP_LIMIT");
    // The third uid's trial must NOT have been consumed.
    assert.equal(state.usedTrials.has("a3"), false);
    assert.equal(state.ipCounts["ip-hash-1"], 2);
  });
});

test("unresolvable IP (null hash) bypasses the IP layer, uid trial still enforced", { concurrency: false }, async () => {
  await withServer({ ipHash: null }, async (baseUrl) => {
    assert.equal((await post(baseUrl, "anon:b1")).status, 200);
    assert.equal((await post(baseUrl, "anon:b2")).status, 200);
    assert.equal((await post(baseUrl, "anon:b3")).status, 200);

    const repeat = await post(baseUrl, "anon:b1");
    assert.equal(repeat.status, 402);
    assert.equal((await repeat.json()).error.code, "FREE_TRIAL_USED");
  });
});
