const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');

const { createSavedResumesRouter } = require('../routes/savedResumes');
const { MAX_SAVED_RESUMES } = require('../services/savedResumeService');

// In-memory stand-in for savedResumeService. Mirrors the real contract: the
// cap throws SAVED_RESUME_LIMIT, ownership mismatches return null, and
// summaries never carry `parsed`/`rawText`.
function createFakeService(seed = {}) {
  const store = new Map(Object.entries(seed));
  let nextId = 1;

  const toSummary = (row) => ({
    id: row.id,
    label: row.label,
    fileName: row.fileName ?? null,
    inputType: row.inputType ?? 'text',
    wordCount: row.wordCount ?? 0,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  });

  return {
    store,
    async createSavedResume(uid, { label, parsed }) {
      const owned = [...store.values()].filter((row) => row.uid === uid);
      if (owned.length >= MAX_SAVED_RESUMES) {
        const err = new Error('You can save up to 5 resumes. Delete one to save another.');
        err.code = 'SAVED_RESUME_LIMIT';
        throw err;
      }
      const source = (parsed && parsed.source) || {};
      const resolvedLabel = (label || '').trim() || source.fileName || `Resume ${owned.length + 1}`;
      const id = `saved-${nextId++}`;
      store.set(id, {
        id,
        uid,
        label: resolvedLabel,
        fileName: source.fileName ?? null,
        inputType: source.inputType ?? 'text',
        rawText: source.rawText ?? '',
        parsed,
      });
      return { id, label: resolvedLabel };
    },
    async listSavedResumes(uid) {
      return [...store.values()].filter((row) => row.uid === uid).map(toSummary);
    },
    async getSavedResume(uid, id) {
      const row = store.get(id);
      if (!row || row.uid !== uid) return null;
      return { ...toSummary(row), rawText: row.rawText, parsed: row.parsed };
    },
    async renameSavedResume(uid, id, label) {
      const normalized = (label || '').trim();
      if (!normalized) {
        const err = new Error('A label is required.');
        err.code = 'INVALID_LABEL';
        throw err;
      }
      const row = store.get(id);
      if (!row || row.uid !== uid) return null;
      row.label = normalized;
      return toSummary(row);
    },
    async deleteSavedResume(uid, id) {
      const row = store.get(id);
      if (!row || row.uid !== uid) return null;
      store.delete(id);
      return { id };
    },
  };
}

async function withServer(service, uid, run, { signInProvider = 'google.com', validateParsed } = {}) {
  const app = express();
  app.use(express.json());
  // Stands in for the requireAuth middleware applied at mount time in index.js.
  app.use((req, res, next) => {
    req.auth = { uid, firebase: { sign_in_provider: signInProvider } };
    next();
  });
  app.use(
    '/saved-resumes',
    createSavedResumesRouter({
      service,
      validateParsed: validateParsed ?? (() => ({ success: true })),
    })
  );

  const server = app.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

const VALID_PARSED = {
  version: '2',
  resumeData: { basics: { name: 'Maya Kowalski' } },
  source: { inputType: 'file', rawText: 'Maya Kowalski\nEngineer', fileName: 'maya.pdf' },
  notes: [],
};

function postSavedResume(baseUrl, body = { parsed: VALID_PARSED }) {
  return fetch(`${baseUrl}/saved-resumes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST creates a saved resume and returns its id', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await postSavedResume(baseUrl);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.savedResume.id);
    assert.equal(body.savedResume.label, 'maya.pdf');
    assert.equal(service.store.size, 1);
  });
});

test('POST defaults the label to the source file name', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await postSavedResume(baseUrl, { label: '   ', parsed: VALID_PARSED });
    const body = await res.json();
    assert.equal(body.savedResume.label, 'maya.pdf');
  });
});

test('POST honours an explicit label', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await postSavedResume(baseUrl, { label: 'Backend-focused', parsed: VALID_PARSED });
    const body = await res.json();
    assert.equal(body.savedResume.label, 'Backend-focused');
  });
});

test('POST is forbidden for anonymous users', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(
    service,
    'anon-1',
    async (baseUrl) => {
      const res = await postSavedResume(baseUrl);
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, 'ANONYMOUS_FORBIDDEN');
      assert.equal(service.store.size, 0);
    },
    { signInProvider: 'anonymous' }
  );
});

test('POST rejects a missing parsed payload', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await postSavedResume(baseUrl, { label: 'No payload' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.equal(service.store.size, 0);
  });
});

test('POST rejects a parsed payload that fails contract validation', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(
    service,
    'user-1',
    async (baseUrl) => {
      const res = await postSavedResume(baseUrl, { parsed: { version: 'nope' } });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_INPUT');
      assert.equal(service.store.size, 0);
    },
    { validateParsed: () => ({ success: false }) }
  );
});

test('POST returns 409 once the per-user cap is reached', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(service, 'user-1', async (baseUrl) => {
    for (let i = 0; i < MAX_SAVED_RESUMES; i += 1) {
      const res = await postSavedResume(baseUrl);
      assert.equal(res.status, 201);
    }

    const overflow = await postSavedResume(baseUrl);
    assert.equal(overflow.status, 409);
    const body = await overflow.json();
    assert.equal(body.error.code, 'SAVED_RESUME_LIMIT');
    assert.equal(service.store.size, MAX_SAVED_RESUMES);
  });
});

test('the cap is per user, not global', { concurrency: false }, async () => {
  const service = createFakeService();
  await withServer(service, 'user-1', async (baseUrl) => {
    for (let i = 0; i < MAX_SAVED_RESUMES; i += 1) await postSavedResume(baseUrl);
  });
  await withServer(service, 'user-2', async (baseUrl) => {
    const res = await postSavedResume(baseUrl);
    assert.equal(res.status, 201);
  });
});

test('GET / lists only the caller\'s resumes and omits the parsed payload', { concurrency: false }, async () => {
  const service = createFakeService({
    mine: { id: 'mine', uid: 'user-1', label: 'Mine', rawText: 'text', parsed: VALID_PARSED },
    theirs: { id: 'theirs', uid: 'user-2', label: 'Theirs', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.savedResumes.length, 1);
    assert.equal(body.savedResumes[0].id, 'mine');
    // The picker only needs metadata; payloads would bloat the response.
    assert.equal(body.savedResumes[0].parsed, undefined);
    assert.equal(body.savedResumes[0].rawText, undefined);
  });
});

test('GET /:id returns the full payload for the owner', { concurrency: false }, async () => {
  const service = createFakeService({
    mine: { id: 'mine', uid: 'user-1', label: 'Mine', rawText: 'full text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/mine`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.savedResume.rawText, 'full text');
    assert.deepEqual(body.savedResume.parsed, VALID_PARSED);
  });
});

test('GET /:id 404s for a resume owned by someone else', { concurrency: false }, async () => {
  const service = createFakeService({
    theirs: { id: 'theirs', uid: 'user-2', label: 'Theirs', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/theirs`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'SAVED_RESUME_NOT_FOUND');
  });
});

test('PATCH renames a saved resume', { concurrency: false }, async () => {
  const service = createFakeService({
    mine: { id: 'mine', uid: 'user-1', label: 'Old', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/mine`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'New name' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.savedResume.label, 'New name');
    assert.equal(service.store.get('mine').label, 'New name');
  });
});

test('PATCH rejects an empty label', { concurrency: false }, async () => {
  const service = createFakeService({
    mine: { id: 'mine', uid: 'user-1', label: 'Old', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/mine`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: '   ' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_LABEL');
    assert.equal(service.store.get('mine').label, 'Old');
  });
});

test('PATCH 404s for a resume owned by someone else', { concurrency: false }, async () => {
  const service = createFakeService({
    theirs: { id: 'theirs', uid: 'user-2', label: 'Theirs', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/theirs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Hijacked' }),
    });
    assert.equal(res.status, 404);
    assert.equal(service.store.get('theirs').label, 'Theirs');
  });
});

test('DELETE removes the caller\'s own resume', { concurrency: false }, async () => {
  const service = createFakeService({
    mine: { id: 'mine', uid: 'user-1', label: 'Mine', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/mine`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(service.store.size, 0);
  });
});

test('DELETE 404s for a resume owned by someone else', { concurrency: false }, async () => {
  const service = createFakeService({
    theirs: { id: 'theirs', uid: 'user-2', label: 'Theirs', rawText: 'text', parsed: VALID_PARSED },
  });

  await withServer(service, 'user-1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/saved-resumes/theirs`, { method: 'DELETE' });
    assert.equal(res.status, 404);
    assert.equal(service.store.size, 1);
  });
});
