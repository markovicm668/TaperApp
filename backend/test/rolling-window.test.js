const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateWindow, readUsedAtMillis, toTimestampArray } = require("../utils/rollingWindow");

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// evaluateWindow is the shared decision behind both the anonymous per-IP trial
// window and the per-résumé free-grant window. free-trial-ip-window.test.js
// covers it from the freeTrialService re-export; these cover the util directly
// plus the two helpers that only this module exposes.

test("under the limit allows, at the limit denies", () => {
  assert.equal(evaluateWindow([], NOW, 8, 30 * DAY).allowed, true);
  assert.equal(evaluateWindow([NOW - DAY], NOW, 1, 30 * DAY).allowed, false);
});

test("entries older than the window are pruned and free slots", () => {
  const { allowed, prunedMillis } = evaluateWindow(
    [NOW - 40 * DAY, NOW - 31 * DAY, NOW - DAY],
    NOW,
    2,
    30 * DAY
  );
  assert.equal(allowed, true);
  assert.deepEqual(prunedMillis, [NOW - DAY]);
});

test("a full window of recent entries denies", () => {
  const usedAt = Array.from({ length: 8 }, (_, i) => NOW - i * DAY);
  assert.equal(evaluateWindow(usedAt, NOW, 8, 30 * DAY).allowed, false);
});

test("the 8-entry window reopens once the oldest ages out", () => {
  const usedAt = Array.from({ length: 8 }, (_, i) => NOW - (31 + i) * DAY);
  const { allowed, prunedMillis } = evaluateWindow(usedAt, NOW, 8, 30 * DAY);
  assert.equal(allowed, true);
  assert.deepEqual(prunedMillis, []);
});

test("null/undefined history is treated as empty", () => {
  assert.equal(evaluateWindow(null, NOW, 8, 30 * DAY).allowed, true);
  assert.equal(evaluateWindow(undefined, NOW, 8, 30 * DAY).allowed, true);
});

test("readUsedAtMillis handles missing docs, bad shapes, Timestamps and numbers", () => {
  assert.deepEqual(readUsedAtMillis(null), []);
  assert.deepEqual(readUsedAtMillis({ exists: false }), []);
  assert.deepEqual(readUsedAtMillis({ exists: true, data: () => ({}) }), []);
  assert.deepEqual(readUsedAtMillis({ exists: true, data: () => ({ usedAt: "nope" }) }), []);

  const snap = {
    exists: true,
    data: () => ({
      usedAt: [{ toMillis: () => NOW }, NOW - DAY, "garbage", null],
    }),
  };
  assert.deepEqual(readUsedAtMillis(snap), [NOW, NOW - DAY]);
});

test("toTimestampArray round-trips through readUsedAtMillis", () => {
  const millis = [NOW - DAY, NOW];
  const snap = { exists: true, data: () => ({ usedAt: toTimestampArray(millis) }) };
  assert.deepEqual(readUsedAtMillis(snap), millis);
});
