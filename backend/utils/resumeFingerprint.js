const crypto = require("node:crypto");

// Derives stable, non-reversible keys from a résumé's contact block so the
// free-grant allowance can be accounted per *person* rather than per account.
// Account identity is trivially cheap to mint (temp-mail, a fresh Google
// account); the contact block on the résumé is not, because it is the thing the
// user needs to be correct in the exported PDF.
//
// Only salted HMACs are ever stored — never the raw email, phone, or name.

const MIN_PHONE_DIGITS = 9;
const MIN_NAME_LENGTH = 3;

let warnedMissingSalt = false;

function getSalt() {
  const salt = process.env.FINGERPRINT_HASH_SALT;
  if (!salt || !salt.trim()) {
    if (!warnedMissingSalt) {
      warnedMissingSalt = true;
      // eslint-disable-next-line no-console
      console.warn(
        "FINGERPRINT_HASH_SALT is unset — résumé fingerprints are unsalted digests of " +
          "low-entropy PII and are brute-forceable. Set it in production."
      );
    }
    return "";
  }
  return salt;
}

// Lowercased, trimmed, with `+alias` suffixes dropped (widely supported, and a
// literal `+` in a real address is vanishingly rare). Dots are only
// insignificant on Google's domains, so they are stripped there and nowhere
// else.
function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;

  let local = value.slice(0, at);
  const domain = value.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split(".").join("");
  }

  if (!local) return null;
  return `${local}@${domain}`;
}

// Digits only, keeping the last `MIN_PHONE_DIGITS` so the same line written
// with a country code, a trunk zero, or neither collapses to one key:
// "+20 111 316 6392" and "01113166392" both yield "113166392". Shorter numbers
// are rejected rather than risk colliding unrelated people.
function normalizePhone(phone) {
  if (typeof phone !== "string" && typeof phone !== "number") return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS) return null;
  return digits.slice(-MIN_PHONE_DIGITS);
}

function normalizeName(name) {
  if (typeof name !== "string") return null;
  const value = name.trim().toLowerCase().replace(/\s+/g, " ");
  return value.length >= MIN_NAME_LENGTH ? value : null;
}

// The kind is folded into the hashed input so an email key can never collide
// with a phone key that happens to share a digest.
function hashFingerprintValue(kind, value) {
  return crypto
    .createHmac("sha256", getSalt())
    .update(`${kind}:${value}`)
    .digest("hex");
}

// Up to three independent keys from one résumé. Every field on ResumeBasicsV2
// is optional, so returning fewer than three — or none — is normal and callers
// must handle an empty array by allowing the request.
function computeFingerprints(basics) {
  if (!basics || typeof basics !== "object") return [];

  const keys = [];

  const email = normalizeEmail(basics.email);
  if (email) keys.push({ kind: "email", hash: hashFingerprintValue("email", email) });

  const phone = normalizePhone(basics.phone);
  if (phone) keys.push({ kind: "phone", hash: hashFingerprintValue("phone", phone) });

  // Name alone is far too collision-prone to stand as an identity, so it only
  // counts when paired with a city.
  const name = normalizeName(basics.name);
  const city = normalizeName(basics.location?.city);
  if (name && city) {
    keys.push({ kind: "name_city", hash: hashFingerprintValue("name_city", `${name}|${city}`) });
  }

  return keys;
}

// Pulls the contact block out of either shape the app stores: the full parse
// payload ({ resumeData: { basics } }) or a bare resumeData ({ basics }).
function basicsFromParsed(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  return parsed.resumeData?.basics ?? parsed.basics ?? null;
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  hashFingerprintValue,
  computeFingerprints,
  basicsFromParsed,
  MIN_PHONE_DIGITS,
};
