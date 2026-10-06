const test = require("node:test");
const assert = require("node:assert/strict");

const {
  consumeAllowance,
  fingerprintLimitDisabled,
  FREE_GRANT_ANALYSES_PER_FINGERPRINT,
  FINGERPRINT_WINDOW_MS,
} = require("../services/resumeFingerprintService");

const DAY = 24 * 60 * 60 * 1000;

// Only the paths that short-circuit before Firestore are exercised here: the
// window arithmetic itself is covered by rolling-window.test.js, and the
// transactional read/write needs a live Firestore (see the plan's end-to-end
// steps).

test("exported production constants are sane", () => {
  assert.equal(FREE_GRANT_ANALYSES_PER_FINGERPRINT, 8);
  assert.equal(FINGERPRINT_WINDOW_MS, 30 * DAY);
});

test("a résumé with no usable contact fields is allowed through", async () => {
  const result = await consumeAllowance([]);
  assert.deepEqual(result, { ok: true, skipped: true });
});

test("a malformed fingerprint list is allowed through rather than throwing", async () => {
  for (const bad of [null, undefined, "nope", 42, {}]) {
    const result = await consumeAllowance(bad);
    assert.deepEqual(result, { ok: true, skipped: true }, `failed for ${JSON.stringify(bad)}`);
  }
});

test("the kill switch disables the layer without touching Firestore", async () => {
  const prev = process.env.FINGERPRINT_LIMIT_DISABLED;
  try {
    process.env.FINGERPRINT_LIMIT_DISABLED = "true";
    assert.equal(fingerprintLimitDisabled(), true);
    // A non-empty list would otherwise open a transaction; the switch must
    // return before that, so this resolving at all is the assertion.
    const result = await consumeAllowance([{ kind: "email", hash: "deadbeef" }]);
    assert.deepEqual(result, { ok: true, skipped: true });
  } finally {
    if (prev === undefined) delete process.env.FINGERPRINT_LIMIT_DISABLED;
    else process.env.FINGERPRINT_LIMIT_DISABLED = prev;
  }
});

test("the kill switch is off unless set to exactly \"true\"", () => {
  const prev = process.env.FINGERPRINT_LIMIT_DISABLED;
  try {
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      process.env.FINGERPRINT_LIMIT_DISABLED = value;
      assert.equal(fingerprintLimitDisabled(), false, `expected off for "${value}"`);
    }
  } finally {
    if (prev === undefined) delete process.env.FINGERPRINT_LIMIT_DISABLED;
    else process.env.FINGERPRINT_LIMIT_DISABLED = prev;
  }
});
