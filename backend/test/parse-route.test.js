const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const { createParseRouter } = require('../routes/parse');

async function withServer(parseResume, run) {
  const app = express();
  app.use(express.json());
  app.use('/parse', createParseRouter({ parseResume }));

  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function samplePayload(parser) {
  const now = new Date().toISOString();

  return {
    version: '2',
    source: {
      inputType: 'text',
      rawText: 'text',
      importedAt: now,
      parsedAt: now,
      parser,
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

test('POST /parse returns 200 on parser success', { concurrency: false }, async () => {
  await withServer(
    async () => ({
      payload: samplePayload('gemini-section-parser-v2'),
      source: 'gemini',
      attempts: 1,
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: 'sample text' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.version, '2');
    }
  );
});

test('POST /parse returns 400 on invalid input', { concurrency: false }, async () => {
  await withServer(
    async () => {
      throw new Error('should not be called');
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputType: 'text' }),
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, 'INVALID_INPUT');
    }
  );
});

test('POST /parse returns 500 on unrecoverable parse failure', { concurrency: false }, async () => {
  await withServer(
    async () => {
      const error = new Error('parse failed');
      error.code = 'PARSE_FAILED';
      throw error;
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: 'sample text' }),
      });

      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.error.code, 'PARSE_FAILED');
    }
  );
});
