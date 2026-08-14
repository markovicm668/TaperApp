const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateIpWindow,
  ANON_TRIALS_PER_IP,
  ANON_TRIAL_IP_WINDOW_MS,
} = require("../services/freeTrialService");

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

test("empty history allows", () => {
  const { allowed, prunedMillis } = evaluateIpWindow([], NOW, 2, ANON_TRIAL_IP_WINDOW_MS);
  assert.equal(allowed, true);
  assert.deepEqual(prunedMillis, []);
});

test("under the limit inside the window allows", () => {
  const { allowed } = evaluateIpWindow([NOW - DAY], NOW, 2, ANON_TRIAL_IP_WINDOW_MS);
  assert.equal(allowed, true);
});

test("at the limit inside the window denies", () => {
  const { allowed } = evaluateIpWindow(
    [NOW - DAY, NOW - 2 * DAY],
    NOW,
    2,
    ANON_TRIAL_IP_WINDOW_MS
  );
  assert.equal(allowed, false);
});

test("entries older than the window are pruned and free the slot", () => {
  const { allowed, prunedMillis } = evaluateIpWindow(
    [NOW - 8 * DAY, NOW - DAY],
    NOW,
    2,
    7 * DAY
  );
  assert.equal(allowed, true);
  assert.deepEqual(prunedMillis, [NOW - DAY]);
});

test("an entry aged exactly windowMs is expired", () => {
  const { allowed, prunedMillis } = evaluateIpWindow(
    [NOW - 7 * DAY, NOW - 7 * DAY],
    NOW,
    2,
    7 * DAY
  );
  assert.equal(allowed, true);
  assert.deepEqual(prunedMillis, []);
});

test("null/undefined history is treated as empty", () => {
  assert.equal(evaluateIpWindow(null, NOW, 2, 7 * DAY).allowed, true);
  assert.equal(evaluateIpWindow(undefined, NOW, 2, 7 * DAY).allowed, true);
});

test("exported production constants are sane", () => {
  assert.equal(ANON_TRIALS_PER_IP, 2);
  assert.equal(ANON_TRIAL_IP_WINDOW_MS, 7 * DAY);
});
