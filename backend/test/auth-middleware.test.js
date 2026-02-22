const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const { createRequireAuth } = require("../middleware/requireAuth");

async function withServer(verifyIdToken, run) {
  const app = express();
  const requireAuth = createRequireAuth({ verifyIdToken });

  app.get("/secure", requireAuth, (req, res) => {
    res.status(200).json({ uid: req.auth.uid });
  });

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("missing bearer token returns AUTH_REQUIRED", { concurrency: false }, async () => {
  await withServer(async () => ({ uid: "user-1" }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/secure`);
    assert.equal(response.status, 401);

    const body = await response.json();
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("invalid bearer token returns AUTH_INVALID", { concurrency: false }, async () => {
  await withServer(
    async () => {
      throw new Error("invalid token");
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/secure`, {
        headers: { Authorization: "Bearer bad-token" },
      });

      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error.code, "AUTH_INVALID");
    }
  );
});

test("valid bearer token sets req.auth and calls next", { concurrency: false }, async () => {
  await withServer(async () => ({ uid: "firebase-user-123" }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/secure`, {
      headers: { Authorization: "Bearer valid-token" },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uid, "firebase-user-123");
  });
});
