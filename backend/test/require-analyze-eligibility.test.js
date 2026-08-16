const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const requireAnalyzeEligibility = require("../middleware/requireAnalyzeEligibility");
const { createRequireAuth } = require("../middleware/requireAuth");

// requireAnalyzeEligibility is read-only: it must NOT mutate balances or the
// trial. These tests assert it gates correctly and leaves state untouched.
async function withServer(
  {
    balances = {},
    entitledUids = new Set(),
    usedTrials = new Set(),
    blockedIpHashes = new Set(),
    ipHash = "ip-hash-1",
  },
  run
) {
  const app = express();
  app.use(express.json());

  const requireAuth = createRequireAuth({
    verifyIdToken: async (token) => {
      if (token === "anon-token") {
        return { uid: "anon-1", firebase: { sign_in_provider: "anonymous" } };
      }
      if (token === "real-token") {
        return { uid: "real-1", firebase: { sign_in_provider: "google.com" } };
      }
      throw new Error("invalid token");
    },
  });

  const getUserAccess = async (uid) => ({
    entitled: entitledUids.has(uid),
    tokensRemaining: balances[uid] ?? 0,
  });
  const isFreeTrialAvailable = async (uid, hash) => {
    if (usedTrials.has(uid)) return { available: false, reason: "FREE_TRIAL_USED" };
    if (hash !== null && blockedIpHashes.has(hash)) {
      return { available: false, reason: "FREE_TRIAL_IP_LIMIT" };
    }
    return { available: true };
  };

  app.use(
    "/parse",
    requireAuth,
    requireAnalyzeEligibility(1, {
      getUserAccess,
      isFreeTrialAvailable,
      getClientIpHash: () => ipHash,
    }),
    (req, res) => res.status(200).json({ ok: true })
  );

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl, { balances, usedTrials });
  } finally {
    server.close();
    await once(server, "close");
  }
}

function post(baseUrl, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/parse`, { method: "POST", headers, body: "{}" });
}

test("token-less /parse is rejected (401)", { concurrency: false }, async () => {
  await withServer({}, async (baseUrl) => {
    assert.equal((await post(baseUrl, null)).status, 401);
  });
});

test("anonymous with unused trial passes (and trial stays available)", { concurrency: false }, async () => {
  const usedTrials = new Set();
  await withServer({ usedTrials }, async (baseUrl) => {
    assert.equal((await post(baseUrl, "anon-token")).status, 200);
    // Read-only: the trial must not be consumed here.
    assert.equal(usedTrials.has("anon-1"), false);
  });
});

test("anonymous whose trial is used gets 402 FREE_TRIAL_USED", { concurrency: false }, async () => {
  await withServer({ usedTrials: new Set(["anon-1"]) }, async (baseUrl) => {
    const res = await post(baseUrl, "anon-token");
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error.code, "FREE_TRIAL_USED");
  });
});

test("anonymous from an IP-limited network gets 402 FREE_TRIAL_IP_LIMIT", { concurrency: false }, async () => {
  await withServer({ blockedIpHashes: new Set(["ip-hash-1"]) }, async (baseUrl) => {
    const res = await post(baseUrl, "anon-token");
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error.code, "FREE_TRIAL_IP_LIMIT");
  });
});

test("real user with balance passes without deducting", { concurrency: false }, async () => {
  await withServer({ balances: { "real-1": 2 } }, async (baseUrl, state) => {
    assert.equal((await post(baseUrl, "real-token")).status, 200);
    // Read-only: balance unchanged.
    assert.equal(state.balances["real-1"], 2);
  });
});

test("real user at zero balance gets 402 INSUFFICIENT_TOKENS", { concurrency: false }, async () => {
  await withServer({ balances: { "real-1": 0 } }, async (baseUrl) => {
    const res = await post(baseUrl, "real-token");
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error.code, "INSUFFICIENT_TOKENS");
  });
});

test("entitled user at zero balance passes", { concurrency: false }, async () => {
  await withServer(
    { balances: { "real-1": 0 }, entitledUids: new Set(["real-1"]) },
    async (baseUrl) => {
      assert.equal((await post(baseUrl, "real-token")).status, 200);
    }
  );
});
