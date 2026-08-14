const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const { createApplicationsRouter } = require('../routes/applications');
const { APPLICATION_STATUSES } = require('../services/applicationService');

function createFakeService(seed = {}) {
  const store = new Map(Object.entries(seed));

  let nextId = 1;

  return {
    store,
    async createApplication(uid, data) {
      const id = `created-${nextId++}`;
      store.set(id, { id, uid, status: 'saved', ...data });
      return { id };
    },
    async listApplications(uid) {
      return [...store.values()].filter((app) => app.uid === uid);
    },
    async getApplication(uid, id) {
      const app = store.get(id);
      return app && app.uid === uid ? app : null;
    },
    async updateStatus(uid, id, status) {
      if (!APPLICATION_STATUSES.includes(status)) {
        const err = new Error('Invalid status.');
        err.code = 'INVALID_STATUS';
        throw err;
      }
      const app = store.get(id);
      if (!app || app.uid !== uid) return null;
      app.status = status;
      return app;
    },
    async updateParsed(uid, id, { parsed, bulletChanges }) {
      const app = store.get(id);
      if (!app || app.uid !== uid) return null;
      app.parsed = parsed;
      app.editedBulletChanges = Array.isArray(bulletChanges) ? bulletChanges : [];
      app.lastEditedAt = new Date().toISOString();
      return app;
    },
    async deleteApplication(uid, id) {
      const app = store.get(id);
      if (!app || app.uid !== uid) return null;
      store.delete(id);
      return { id };
    },
  };
}

// In-memory stand-in for tokenService.chargeApplicationSave/refundApplicationSave.
// Mirrors the contract: first save per uid is free (freeSaveUsed flag), then
// 1 token per save; throws INSUFFICIENT_TOKENS at zero balance.
function createFakeCharge({ balances = {}, freeSaveUsed = new Set() } = {}) {
  const calls = [];
  const refunds = [];
  return {
    balances,
    freeSaveUsed,
    calls,
    refunds,
    async chargeSave(uid) {
      calls.push(uid);
      if (!freeSaveUsed.has(uid)) {
        freeSaveUsed.add(uid);
        return { charged: false, tokensRemaining: balances[uid] ?? 0 };
      }
      const current = balances[uid] ?? 0;
      if (current < 1) {
        const err = new Error(`Insufficient tokens. Required: 1, available: ${current}.`);
        err.code = 'INSUFFICIENT_TOKENS';
        err.tokensRemaining = current;
        throw err;
      }
      balances[uid] = current - 1;
      return { charged: true, tokensRemaining: balances[uid] };
    },
    async refundSave(uid, { charged }) {
      refunds.push({ uid, charged });
      if (charged) balances[uid] = (balances[uid] ?? 0) + 1;
      else freeSaveUsed.delete(uid);
    },
  };
}

async function withServer(service, uid, run, { signInProvider = 'google.com', charge } = {}) {
  const app = express();
  app.use(express.json());
  const fakeCharge = charge ?? createFakeCharge();
  // Stands in for the requireAuth middleware applied at mount time in index.js.
  app.use((req, res, next) => {
    req.auth = { uid, firebase: { sign_in_provider: signInProvider } };
    next();
  });
  app.use(
    '/applications',
    createApplicationsRouter({
      service,
      chargeSave: fakeCharge.chargeSave,
      refundSave: fakeCharge.refundSave,
    })
  );

  const server = app.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl, fakeCharge);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

const VALID_POST_BODY = {
  company: 'Acme',
  targetRole: 'BDR',
  jobDescription: 'JD',
  matchScore: 72,
  scores: null,
  analysis: { meta: { matchScore: 72 } },
  parsed: { resumeData: {} },
};

function postApplication(baseUrl, body = VALID_POST_BODY) {
  return fetch(`${baseUrl}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SEED = {
  'app-1': { id: 'app-1', uid: 'user-a', company: 'Acme', targetRole: 'BDR', matchScore: 72, status: 'saved' },
  'app-2': { id: 'app-2', uid: 'user-b', company: 'Other', targetRole: 'AE', matchScore: 60, status: 'applied' },
};

test('GET /applications returns only the caller-owned applications', { concurrency: false }, async () => {
  const service = createFakeService(structuredClone(SEED));

  await withServer(service, 'user-a', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/applications`);
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.applications.length, 1);
    assert.equal(json.applications[0].id, 'app-1');
  });
});

test('POST /applications creates an owned application and returns its id', { concurrency: false }, async () => {
  const service = createFakeService();

  await withServer(service, 'user-a', async (baseUrl) => {
    const response = await postApplication(baseUrl);
    assert.equal(response.status, 201);
    const id = (await response.json()).application.id;

    const stored = service.store.get(id);
    assert.equal(stored.uid, 'user-a');
    assert.equal(stored.company, 'Acme');
  });
});

test('POST /applications returns 400 when analysis or parsed is missing', { concurrency: false }, async () => {
  const service = createFakeService();
  const charge = createFakeCharge();

  await withServer(service, 'user-a', async (baseUrl) => {
    const response = await postApplication(baseUrl, { company: 'Acme', targetRole: 'BDR' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    assert.equal(service.store.size, 0);
    // Invalid input must never reach the charge.
    assert.equal(charge.calls.length, 0);
  }, { charge });
});

test('POST /applications rejects anonymous tokens with 403 and never charges', { concurrency: false }, async () => {
  const service = createFakeService();
  const charge = createFakeCharge();

  await withServer(service, 'anon-1', async (baseUrl) => {
    const response = await postApplication(baseUrl);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'ANONYMOUS_FORBIDDEN');
    assert.equal(service.store.size, 0);
    assert.equal(charge.calls.length, 0);
  }, { signInProvider: 'anonymous', charge });
});

test('POST /applications: first save is free (flag set), second save costs a token', { concurrency: false }, async () => {
  const service = createFakeService();
  const charge = createFakeCharge({ balances: { 'user-a': 5 } });

  await withServer(service, 'user-a', async (baseUrl) => {
    const first = await postApplication(baseUrl);
    assert.equal(first.status, 201);
    assert.equal((await first.json()).tokensRemaining, 5);
    assert.equal(charge.freeSaveUsed.has('user-a'), true);
    assert.equal(charge.balances['user-a'], 5);

    const second = await postApplication(baseUrl);
    assert.equal(second.status, 201);
    assert.equal((await second.json()).tokensRemaining, 4);
    assert.equal(charge.balances['user-a'], 4);
  }, { charge });
});

test('POST /applications with used free save and zero balance is 402, nothing stored', { concurrency: false }, async () => {
  const service = createFakeService();
  const charge = createFakeCharge({ balances: { 'user-a': 0 }, freeSaveUsed: new Set(['user-a']) });

  await withServer(service, 'user-a', async (baseUrl) => {
    const response = await postApplication(baseUrl);
    assert.equal(response.status, 402);
    const body = await response.json();
    assert.equal(body.error.code, 'INSUFFICIENT_TOKENS');
    assert.equal(body.error.tokensRemaining, 0);
    assert.equal(service.store.size, 0);
  }, { charge });
});

test('POST /applications refunds the charge when the application write fails', { concurrency: false }, async () => {
  const service = createFakeService();
  service.createApplication = async () => {
    throw new Error('firestore down');
  };
  const charge = createFakeCharge({ balances: { 'user-a': 3 }, freeSaveUsed: new Set(['user-a']) });

  await withServer(service, 'user-a', async (baseUrl) => {
    const response = await postApplication(baseUrl);
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, 'APPLICATION_CREATE_FAILED');
    assert.deepEqual(charge.refunds, [{ uid: 'user-a', charged: true }]);
    assert.equal(charge.balances['user-a'], 3);
  }, { charge });
});

test('GET /applications/:id returns 404 for another user\'s application', { concurrency: false }, async () => {
  const service = createFakeService(structuredClone(SEED));

  await withServer(service, 'user-a', async (baseUrl) => {
    const owned = await fetch(`${baseUrl}/applications/app-1`);
    assert.equal(owned.status, 200);
    assert.equal((await owned.json()).application.company, 'Acme');

    const foreign = await fetch(`${baseUrl}/applications/app-2`);
    assert.equal(foreign.status, 404);
  });
});

test('PATCH /applications/:id updates status and rejects invalid values', { concurrency: false }, async () => {
  const service = createFakeService(structuredClone(SEED));

  await withServer(service, 'user-a', async (baseUrl) => {
    const updated = await fetch(`${baseUrl}/applications/app-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'interview' }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).application.status, 'interview');

    const invalid = await fetch(`${baseUrl}/applications/app-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ghosted-by-aliens' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_STATUS');

    const foreign = await fetch(`${baseUrl}/applications/app-2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    assert.equal(foreign.status, 404);
  });
});

test('PATCH /applications/:id with parsed saves resume edits on owned application only', { concurrency: false }, async () => {
  const service = createFakeService(structuredClone(SEED));

  await withServer(service, 'user-a', async (baseUrl) => {
    const parsed = { version: '2', resumeData: { basics: { name: 'Edited Name' } } };
    const bulletChanges = [{ section: 'work', original: 'a', improved: 'b', type: 'modified' }];

    const updated = await fetch(`${baseUrl}/applications/app-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsed, bulletChanges }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(service.store.get('app-1').parsed, parsed);
    assert.deepEqual(service.store.get('app-1').editedBulletChanges, bulletChanges);
    assert.ok(service.store.get('app-1').lastEditedAt);

    const invalid = await fetch(`${baseUrl}/applications/app-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsed: { version: '2' } }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_INPUT');

    const foreign = await fetch(`${baseUrl}/applications/app-2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parsed }),
    });
    assert.equal(foreign.status, 404);
    assert.equal(service.store.get('app-2').parsed, undefined);
  });
});

test('DELETE /applications/:id removes owned application only', { concurrency: false }, async () => {
  const service = createFakeService(structuredClone(SEED));

  await withServer(service, 'user-a', async (baseUrl) => {
    const foreign = await fetch(`${baseUrl}/applications/app-2`, { method: 'DELETE' });
    assert.equal(foreign.status, 404);
    assert.equal(service.store.has('app-2'), true);

    const owned = await fetch(`${baseUrl}/applications/app-1`, { method: 'DELETE' });
    assert.equal(owned.status, 200);
    assert.equal(service.store.has('app-1'), false);
  });
});
