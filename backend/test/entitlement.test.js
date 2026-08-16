const test = require("node:test");
const assert = require("node:assert/strict");

const { computeEntitlement, toMillis } = require("../services/entitlementService");

const DAY_MS = 24 * 60 * 60 * 1000;

test("lifetime plan is entitled regardless of expiry fields", () => {
  assert.equal(computeEntitlement({ plan: "lifetime" }).entitled, true);
  assert.equal(
    computeEntitlement({ plan: "lifetime", planExpiresAt: new Date(0) }).entitled,
    true
  );
});

test("subscription with future expiry is entitled; past expiry is not", () => {
  const future = new Date(Date.now() + DAY_MS);
  const past = new Date(Date.now() - DAY_MS);
  assert.equal(computeEntitlement({ plan: "weekly", planExpiresAt: future }).entitled, true);
  assert.equal(computeEntitlement({ plan: "weekly", planExpiresAt: past }).entitled, false);
  assert.equal(computeEntitlement({ plan: "monthly", planExpiresAt: null }).entitled, false);
});

test("no plan / empty user data is not entitled", () => {
  assert.equal(computeEntitlement({}).entitled, false);
  assert.equal(computeEntitlement().entitled, false);
  assert.equal(
    computeEntitlement({ planExpiresAt: new Date(Date.now() + DAY_MS) }).entitled,
    false
  );
});

test("expiry accepts Firestore-Timestamp-like, Date, and ISO string values", () => {
  const futureMs = Date.now() + DAY_MS;
  const timestampLike = { toMillis: () => futureMs };
  assert.equal(
    computeEntitlement({ plan: "weekly", planExpiresAt: timestampLike }).entitled,
    true
  );
  assert.equal(
    computeEntitlement({ plan: "weekly", planExpiresAt: new Date(futureMs) }).entitled,
    true
  );
  assert.equal(
    computeEntitlement({ plan: "weekly", planExpiresAt: new Date(futureMs).toISOString() })
      .entitled,
    true
  );
});

test("toMillis handles all supported shapes and rejects garbage", () => {
  const ms = 1700000000000;
  assert.equal(toMillis({ toMillis: () => ms }), ms);
  assert.equal(toMillis(new Date(ms)), ms);
  assert.equal(toMillis(new Date(ms).toISOString()), ms);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis(undefined), null);
  assert.equal(toMillis("not a date"), null);
});
