const test = require("node:test");
const assert = require("node:assert/strict");

const { getClientIp, normalizeIp, hashClientIp } = require("../utils/clientIp");

function stubReq({ headers = {}, ip } = {}) {
  return {
    ip,
    get: (name) => headers[name.toLowerCase()],
  };
}

test("getClientIp prefers Fly-Client-IP over req.ip", () => {
  const req = stubReq({ headers: { "fly-client-ip": "203.0.113.7" }, ip: "10.0.0.1" });
  assert.equal(getClientIp(req), "203.0.113.7");
});

test("getClientIp falls back to req.ip without the Fly header", () => {
  assert.equal(getClientIp(stubReq({ ip: "192.0.2.9" })), "192.0.2.9");
});

test("getClientIp returns null when nothing is available", () => {
  assert.equal(getClientIp(stubReq({})), null);
});

test("normalizeIp passes IPv4 through unchanged", () => {
  assert.equal(normalizeIp("203.0.113.7"), "203.0.113.7");
});

test("normalizeIp strips the IPv4-mapped IPv6 prefix", () => {
  assert.equal(normalizeIp("::ffff:203.0.113.7"), "203.0.113.7");
});

test("normalizeIp truncates IPv6 to its /64 prefix", () => {
  assert.equal(
    normalizeIp("2001:0db8:85a3:0001:8a2e:0370:7334:1234"),
    "2001:0db8:85a3:0001::/64"
  );
  // Same /64, different interface id -> same key
  assert.equal(
    normalizeIp("2001:0db8:85a3:0001:ffff:ffff:ffff:ffff"),
    "2001:0db8:85a3:0001::/64"
  );
});

test("normalizeIp expands :: before truncating", () => {
  assert.equal(normalizeIp("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(normalizeIp("::1"), "0:0:0:0::/64");
});

test("normalizeIp strips zone ids and rejects garbage", () => {
  assert.equal(normalizeIp("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(normalizeIp("not-an-ip"), null);
  assert.equal(normalizeIp(""), null);
  assert.equal(normalizeIp(null), null);
});

test("hashClientIp is deterministic and salt-sensitive", () => {
  const prev = process.env.IP_HASH_SALT;
  try {
    process.env.IP_HASH_SALT = "salt-a";
    const a1 = hashClientIp("203.0.113.7");
    const a2 = hashClientIp("203.0.113.7");
    assert.equal(a1, a2);
    assert.match(a1, /^[0-9a-f]{64}$/);

    process.env.IP_HASH_SALT = "salt-b";
    assert.notEqual(hashClientIp("203.0.113.7"), a1);
  } finally {
    if (prev === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = prev;
  }
});

test("hashClientIp keys the same IPv6 /64 identically", () => {
  assert.equal(
    hashClientIp("2001:db8:85a3:1:aaaa::1"),
    hashClientIp("2001:db8:85a3:1:bbbb::2")
  );
});

test("hashClientIp returns null for unusable input", () => {
  assert.equal(hashClientIp("garbage"), null);
});
