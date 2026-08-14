const crypto = require("node:crypto");
const net = require("node:net");

// Resolves the client IP for the anonymous-free-trial throttle. On Fly.io all
// public traffic transits the edge proxy, which sets Fly-Client-IP itself (a
// client-supplied value never passes through), so the header is trustworthy.
// req.ip is the fallback for local dev; index.js pins `trust proxy` to 1 hop
// so a client-crafted X-Forwarded-For entry can't poison it either.
function getClientIp(req) {
  const flyIp = typeof req.get === "function" ? req.get("fly-client-ip") : undefined;
  if (flyIp) return flyIp;
  return req.ip || null;
}

// Canonical throttle key for an address. IPv6 is truncated to its /64 prefix:
// residential users typically hold a whole /64, so per-address limits would be
// trivially rotatable.
function normalizeIp(ip) {
  if (!ip) return null;
  let value = String(ip).trim().toLowerCase();

  const zoneIndex = value.indexOf("%");
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);

  if (value.startsWith("::ffff:") && net.isIP(value.slice(7)) === 4) {
    value = value.slice(7);
  }

  const version = net.isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;

  // Expand `::` so the first four hextets are unambiguous, then keep them.
  const [head, tail = ""] = value.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const full = value.includes("::")
    ? [...headParts, ...Array(missing).fill("0"), ...tailParts]
    : headParts;
  return `${full.slice(0, 4).join(":")}::/64`;
}

// HMAC rather than a bare hash: the IPv4 space is small enough that unsalted
// digests are reversible by brute force. Set IP_HASH_SALT in production.
function hashClientIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  return crypto
    .createHmac("sha256", process.env.IP_HASH_SALT || "")
    .update(normalized)
    .digest("hex");
}

function getClientIpHash(req) {
  const ip = getClientIp(req);
  if (!ip) return null;
  return hashClientIp(ip);
}

module.exports = {
  getClientIp,
  normalizeIp,
  hashClientIp,
  getClientIpHash,
};
