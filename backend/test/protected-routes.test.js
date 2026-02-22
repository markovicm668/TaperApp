const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");

const analyzeRoute = require("../routes/analyze");
const { createParseRouter } = require("../routes/parse");
const { createExportRouter } = require("../routes/export");
const { createRequireAuth } = require("../middleware/requireAuth");

function createParsePayload() {
  const now = new Date().toISOString();
  return {
    version: "2",
    source: {
      inputType: "text",
      rawText: "sample",
      importedAt: now,
      parsedAt: now,
      parser: "gemini-section-parser-v2",
    },
    resumeData: {
      education: [],
      work: [],
      projects: [],
      awards: [],
      skills: {},
      languages: [],
    },
    notes: [],
  };
}

async function withServer(run) {
  const app = express();
  app.use(express.json());

  const requireAuth = createRequireAuth({
    verifyIdToken: async (token) => {
      if (token !== "valid-token") {
        throw new Error("invalid token");
      }
      return { uid: "user-1" };
    },
  });

  app.use("/analyze", requireAuth, analyzeRoute);
  app.use(
    "/parse",
    requireAuth,
    createParseRouter({
      parseResume: async () => ({
        payload: createParsePayload(),
        source: "gemini",
        attempts: 1,
      }),
    })
  );
  app.use(
    "/export",
    requireAuth,
    createExportRouter({
      validate: () => ({ ok: true }),
      renderResumeHtml: () => "<html><body>resume</body></html>",
      renderPdf: async () => Buffer.from("pdf"),
    })
  );

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

test("protected routes reject unauthenticated access", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const analyzeResponse = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(analyzeResponse.status, 401);

    const parseResponse = await fetch(`${baseUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "sample" }),
    });
    assert.equal(parseResponse.status, 401);

    const exportResponse = await fetch(`${baseUrl}/export/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: {} }),
    });
    assert.equal(exportResponse.status, 401);
  });
});

test("authenticated requests reach analyze/parse/export handlers", { concurrency: false }, async () => {
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: "Bearer valid-token",
  };

  await withServer(async (baseUrl) => {
    const analyzeResponse = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(analyzeResponse.status, 400);
    const analyzeBody = await analyzeResponse.json();
    assert.equal(analyzeBody.error.code, "INVALID_INPUT");

    const parseResponse = await fetch(`${baseUrl}/parse`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ resumeText: "sample text" }),
    });
    assert.equal(parseResponse.status, 200);
    const parseBody = await parseResponse.json();
    assert.equal(parseBody.success, true);

    const exportResponse = await fetch(`${baseUrl}/export/pdf`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ resume: {} }),
    });
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get("content-type"), "application/pdf");
  });
});
