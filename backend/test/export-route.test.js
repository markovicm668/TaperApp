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

// Fake auth middleware standing in for requireAuth: "real-token" is a real
// account, "anon-token" an anonymous one, anything else (or nothing) is 401.
function fakeAuth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  if (token === 'real-token') {
    req.auth = { uid: 'user-a', firebase: { sign_in_provider: 'google.com' } };
    return next();
  }
  if (token === 'anon-token') {
    req.auth = { uid: 'anon-1', firebase: { sign_in_provider: 'anonymous' } };
    return next();
  }
  return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing token.' } });
}

// Fake ownership lookup: user-a owns app-1, nothing else exists.
async function fakeGetOwnedApplication(uid, id) {
  return uid === 'user-a' && id === 'app-1' ? { id } : null;
}

async function withServer(deps, run) {
  const app = express();
  app.use(express.json());
  app.use(
    '/export',
    createExportRouter({ auth: fakeAuth, getOwnedApplication: fakeGetOwnedApplication, ...deps })
  );

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

function postPdf(baseUrl, { token, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/export/pdf`, { method: 'POST', headers, body: JSON.stringify(body) });
}

test('POST /export/preview returns server-paginated HTML', { concurrency: false }, async () => {
  const paginateCalls = [];

  await withServer(
    {
      validate: () => ({ ok: true }),
      renderResumeHtml: () => '<html><body><div class="page">resume</div></body></html>',
      paginateHtml: async (html) => {
        paginateCalls.push(html);
        return '<html><body><div class="pdf-page">resume</div></body></html>';
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/export/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: SAMPLE_RESUME }),
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.html, '<html><body><div class="pdf-page">resume</div></body></html>');
    }
  );

  assert.equal(paginateCalls.length, 1);
  assert.match(paginateCalls[0], /class="page"/);
});

test('POST /export/preview falls back to unpaginated HTML when pagination fails', { concurrency: false }, async () => {
  await withServer(
    {
      validate: () => ({ ok: true }),
      renderResumeHtml: () => '<html><body><div class="page">resume</div></body></html>',
      paginateHtml: async () => {
        throw new Error('browser crashed');
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/export/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: SAMPLE_RESUME }),
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.html, '<html><body><div class="page">resume</div></body></html>');
    }
  );
});

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
      const response = await postPdf(baseUrl, {
        token: 'real-token',
        body: { resume: SAMPLE_RESUME, applicationId: 'app-1' },
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
      const response = await postPdf(baseUrl, {
        token: 'real-token',
        body: {
          resume: SAMPLE_RESUME,
          applicationId: 'app-1',
          options: { template: 'unused' },
        },
      });

      assert.equal(response.status, 200);
    }
  );

  assert.equal(renderCalled, true);
});

test('POST /export/pdf without a token is 401', { concurrency: false }, async () => {
  await withServer({ validate: () => ({ ok: true }) }, async (baseUrl) => {
    const response = await postPdf(baseUrl, { body: { resume: SAMPLE_RESUME, applicationId: 'app-1' } });
    assert.equal(response.status, 401);
  });
});

test('POST /export/pdf rejects anonymous tokens with 403 ANONYMOUS_FORBIDDEN', { concurrency: false }, async () => {
  let renderCalled = false;

  await withServer(
    {
      validate: () => ({ ok: true }),
      renderResumeHtml: () => {
        renderCalled = true;
        return '<html></html>';
      },
    },
    async (baseUrl) => {
      const response = await postPdf(baseUrl, {
        token: 'anon-token',
        body: { resume: SAMPLE_RESUME, applicationId: 'app-1' },
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'ANONYMOUS_FORBIDDEN');
    }
  );

  assert.equal(renderCalled, false);
});

test('POST /export/pdf without applicationId is 402 APPLICATION_REQUIRED', { concurrency: false }, async () => {
  let renderCalled = false;

  await withServer(
    {
      validate: () => ({ ok: true }),
      renderResumeHtml: () => {
        renderCalled = true;
        return '<html></html>';
      },
    },
    async (baseUrl) => {
      const response = await postPdf(baseUrl, {
        token: 'real-token',
        body: { resume: SAMPLE_RESUME },
      });
      assert.equal(response.status, 402);
      assert.equal((await response.json()).error.code, 'APPLICATION_REQUIRED');
    }
  );

  assert.equal(renderCalled, false);
});

test('POST /export/pdf with a non-owned applicationId is 402 APPLICATION_REQUIRED', { concurrency: false }, async () => {
  await withServer({ validate: () => ({ ok: true }) }, async (baseUrl) => {
    const response = await postPdf(baseUrl, {
      token: 'real-token',
      body: { resume: SAMPLE_RESUME, applicationId: 'someone-elses-app' },
    });
    assert.equal(response.status, 402);
    assert.equal((await response.json()).error.code, 'APPLICATION_REQUIRED');
  });
});
