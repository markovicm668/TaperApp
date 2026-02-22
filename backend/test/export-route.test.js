const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const { createExportRouter } = require('../routes/export');

const SAMPLE_RESUME = {
  basics: {
    name: 'Jane Doe',
    email: 'jane@example.com',
  },
  summary: 'Product-minded engineer.',
  work: [
    {
      position: 'Engineer',
      company: 'Example Corp',
      highlights: ['Built backend APIs'],
    },
  ],
  education: [],
  projects: [],
  awards: [],
  skills: {},
  languages: [],
};

async function withServer(deps, run) {
  const app = express();
  app.use(express.json());
  app.use('/export', createExportRouter(deps));

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

test('POST /export/pdf renders resume payload', { concurrency: false }, async () => {
  const renderCalls = [];

  await withServer(
    {
      validate: () => ({ ok: true }),
      renderResumeHtml: (resume) => {
        renderCalls.push(resume.basics?.name);
        return '<html><body>resume</body></html>';
      },
      renderPdf: async () => Buffer.from('pdf'),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: SAMPLE_RESUME }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      const payload = Buffer.from(await response.arrayBuffer()).toString('utf8');
      assert.equal(payload, 'pdf');
    }
  );

  assert.deepEqual(renderCalls, ['Jane Doe']);
});

test('POST /export/pdf passes through optional request fields without failing', { concurrency: false }, async () => {
  let renderCalled = false;

  await withServer(
    {
      validate: () => ({ ok: true }),
      renderResumeHtml: () => {
        renderCalled = true;
        return '<html><body>resume</body></html>';
      },
      renderPdf: async () => Buffer.from('pdf'),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: SAMPLE_RESUME,
          options: { template: 'unused' },
        }),
      });

      assert.equal(response.status, 200);
    }
  );

  assert.equal(renderCalled, true);
});
