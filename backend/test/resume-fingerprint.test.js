const test = require("node:test");
const assert = require("node:assert/strict");

process.env.FINGERPRINT_HASH_SALT = "test-fingerprint-salt";

const {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  hashFingerprintValue,
  computeFingerprints,
  basicsFromParsed,
} = require("../utils/resumeFingerprint");

function hashesFor(basics) {
  return computeFingerprints(basics).map((fp) => fp.hash);
}

function kindsFor(basics) {
  return computeFingerprints(basics).map((fp) => fp.kind);
}

// --- email -----------------------------------------------------------------

test("email is lowercased and trimmed", () => {
  assert.equal(normalizeEmail("  Karim.Eid@Example.COM "), "karim.eid@example.com");
});

test("gmail dots are insignificant, other domains keep them", () => {
  assert.equal(normalizeEmail("k.a.r.i.m@gmail.com"), normalizeEmail("karim@gmail.com"));
  assert.equal(normalizeEmail("karim@googlemail.com"), "karim@googlemail.com");
  assert.notEqual(normalizeEmail("k.arim@example.com"), normalizeEmail("karim@example.com"));
});

test("+alias suffixes are dropped on every domain", () => {
  assert.equal(normalizeEmail("karim+jobs@gmail.com"), normalizeEmail("karim@gmail.com"));
  assert.equal(normalizeEmail("karim+x@fastmail.com"), normalizeEmail("karim@fastmail.com"));
});

test("malformed emails yield null", () => {
  for (const bad of [null, undefined, 42, "", "no-at-sign", "@nolocal.com", "trailing@"]) {
    assert.equal(normalizeEmail(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("an alias-only local part is rejected rather than collapsing to empty", () => {
  assert.equal(normalizeEmail("+only@gmail.com"), null);
});

// --- phone -----------------------------------------------------------------

test("country code, trunk zero and spacing collapse to one key", () => {
  const withCode = normalizePhone("+20 111 316 6392");
  assert.equal(withCode, "113166392");
  assert.equal(normalizePhone("01113166392"), withCode);
  assert.equal(normalizePhone("0020-111-316-6392"), withCode);
  assert.equal(normalizePhone("(+20) 111 316 6392"), withCode);
});

test("phones shorter than 9 digits are rejected as collision-prone", () => {
  assert.equal(normalizePhone("12345678"), null);
  assert.equal(normalizePhone("123456789"), "123456789");
});

test("numeric phone input is accepted", () => {
  assert.equal(normalizePhone(1113166392), "113166392");
});

test("non-string, non-number phones yield null", () => {
  for (const bad of [null, undefined, {}, []]) {
    assert.equal(normalizePhone(bad), null);
  }
});

// --- name ------------------------------------------------------------------

test("name is lowercased with whitespace collapsed", () => {
  assert.equal(normalizeName("  KARIM   EID "), "karim eid");
  assert.equal(normalizeName("Karim Eid"), normalizeName("KARIM EID"));
});

test("names shorter than 3 characters yield null", () => {
  assert.equal(normalizeName("Jo"), null);
  assert.equal(normalizeName("Joe"), "joe");
});

// --- hashing ---------------------------------------------------------------

test("the kind is folded in, so the same value cannot collide across signals", () => {
  assert.notEqual(
    hashFingerprintValue("email", "same-value"),
    hashFingerprintValue("phone", "same-value")
  );
});

test("a different salt yields a different digest", () => {
  const prev = process.env.FINGERPRINT_HASH_SALT;
  try {
    process.env.FINGERPRINT_HASH_SALT = "salt-a";
    const a = hashFingerprintValue("email", "karim@gmail.com");
    process.env.FINGERPRINT_HASH_SALT = "salt-b";
    const b = hashFingerprintValue("email", "karim@gmail.com");
    assert.notEqual(a, b);
  } finally {
    process.env.FINGERPRINT_HASH_SALT = prev;
  }
});

test("hashes are hex sha256 digests and leak no plaintext", () => {
  const hash = hashFingerprintValue("email", "karim@gmail.com");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes("karim"), false);
});

// --- computeFingerprints ---------------------------------------------------

const KARIM = {
  name: "KARIM EID",
  email: "karimeid.work@gmail.com",
  phone: "+20 111 316 6392",
  location: { city: "Cairo", country: "Egypt" },
};

test("a full contact block yields all three signals", () => {
  assert.deepEqual(kindsFor(KARIM), ["email", "phone", "name_city"]);
});

test("changing only the email still matches on phone and name_city", () => {
  const before = hashesFor(KARIM);
  const after = hashesFor({ ...KARIM, email: "zacala811@gmail.com" });
  const overlap = after.filter((h) => before.includes(h));
  assert.equal(overlap.length, 2);
});

test("changing only the phone still matches on email and name_city", () => {
  const before = hashesFor(KARIM);
  const after = hashesFor({ ...KARIM, phone: "+20 100 000 0000" });
  assert.equal(after.filter((h) => before.includes(h)).length, 2);
});

test("all three must change for every key to miss", () => {
  const before = hashesFor(KARIM);
  const after = hashesFor({
    name: "Someone Else",
    email: "other@example.com",
    phone: "+1 415 555 0000",
    location: { city: "Berlin" },
  });
  assert.equal(after.filter((h) => before.includes(h)).length, 0);
});

test("casing differences in the stored résumé do not split the identity", () => {
  // Karim's 6 accounts stored both "KARIM EID" and "Karim Eid".
  assert.deepEqual(hashesFor(KARIM), hashesFor({ ...KARIM, name: "Karim Eid" }));
});

test("partial contact blocks yield only the signals present", () => {
  assert.deepEqual(kindsFor({ email: "a@b.com" }), ["email"]);
  assert.deepEqual(kindsFor({ phone: "+20 111 316 6392" }), ["phone"]);
  // Name without a city is too collision-prone to count on its own.
  assert.deepEqual(kindsFor({ name: "Karim Eid" }), []);
  assert.deepEqual(kindsFor({ name: "Karim Eid", location: { city: "Cairo" } }), ["name_city"]);
});

test("an empty or absent contact block yields no keys, which callers must allow", () => {
  assert.deepEqual(computeFingerprints(null), []);
  assert.deepEqual(computeFingerprints(undefined), []);
  assert.deepEqual(computeFingerprints({}), []);
  assert.deepEqual(computeFingerprints("not an object"), []);
});

// --- basicsFromParsed ------------------------------------------------------

test("basics are read from either stored payload shape", () => {
  assert.equal(basicsFromParsed({ resumeData: { basics: KARIM } }), KARIM);
  assert.equal(basicsFromParsed({ basics: KARIM }), KARIM);
  assert.equal(basicsFromParsed({}), null);
  assert.equal(basicsFromParsed(null), null);
});

test("the full stored payload shape fingerprints identically to bare basics", () => {
  assert.deepEqual(
    hashesFor(basicsFromParsed({ resumeData: { basics: KARIM } })),
    hashesFor(KARIM)
  );
});
