import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeResume,
  configureApiAuth,
  exportResumePdf,
  parseResume,
} from './api.ts';
import type { ResumePdfPayload } from './types.ts';

const ORIGINAL_FETCH = globalThis.fetch;
const TEST_TOKEN = 'test-token';

const SAMPLE_RESUME: ResumePdfPayload = {
  basics: {
    name: 'Jane Doe',
    email: 'jane@example.com',
  },
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

test.beforeEach(() => {
  configureApiAuth({
    tokenResolver: async options =>
      options?.forceRefresh ? `${TEST_TOKEN}-refresh` : TEST_TOKEN,
  });
});

test.afterEach(() => {
  if (ORIGINAL_FETCH) {
    globalThis.fetch = ORIGINAL_FETCH;
  }
  configureApiAuth({ tokenResolver: null, onAuthFailure: null });
});

test('exportResumePdf posts only resume payload and attaches bearer token', async () => {
  let capturedBody: unknown = null;
  let capturedAuthHeader: string | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedAuthHeader = new Headers(init?.headers).get('Authorization');
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return {
      ok: true,
      blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
      status: 200,
    } as unknown as Response;
  }) as typeof fetch;

  const blob = await exportResumePdf(SAMPLE_RESUME);

  assert.equal(blob.type, 'application/pdf');
  assert.equal(capturedAuthHeader, `Bearer ${TEST_TOKEN}`);
  assert.deepEqual(capturedBody, {
    resume: SAMPLE_RESUME,
  });
});

test('analyzeResume preserves rewritten bullet section when provided', async () => {
  let capturedAuthHeader: string | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedAuthHeader = new Headers(init?.headers).get('Authorization');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          rewrittenBullets: [
            {
              section: 'projects',
              original: 'Built a portfolio app',
              improved: 'Built a portfolio app adopted by 2,000+ monthly users',
            },
          ],
          rewriteSuggestions: [],
          missingKeywords: [],
          atsWarnings: [],
          suggestions: [],
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const result = await analyzeResume(
    { type: 'text', content: 'Projects\n- Built a portfolio app' },
    { text: 'Need someone with shipped project outcomes.' }
  );

  assert.equal(capturedAuthHeader, `Bearer ${TEST_TOKEN}`);
  assert.equal(result.bulletChanges.length, 1);
  assert.equal(result.bulletChanges[0]?.section, 'Projects');
});

test('analyzeResume retries once with refreshed token after initial 401', async () => {
  const authHeaders: string[] = [];
  let callCount = 0;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    callCount += 1;
    authHeaders.push(new Headers(init?.headers).get('Authorization') || '');

    if (callCount === 1) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          rewrittenBullets: [],
          rewriteSuggestions: [],
          missingKeywords: [],
          atsWarnings: [],
          suggestions: [],
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  await analyzeResume(
    { type: 'text', content: 'Experience\n- Built backend APIs' },
    { text: 'Need someone with API scaling experience.' }
  );

  assert.deepEqual(authHeaders, [`Bearer ${TEST_TOKEN}`, `Bearer ${TEST_TOKEN}-refresh`]);
});

test('parseResume attaches bearer token', async () => {
  let capturedAuthHeader: string | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedAuthHeader = new Headers(init?.headers).get('Authorization');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          version: '2',
          source: {
            inputType: 'text',
            rawText: 'test',
            importedAt: new Date().toISOString(),
            parsedAt: new Date().toISOString(),
            parser: 'gemini-section-parser-v2',
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
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  await parseResume({ resumeText: 'resume text' });
  assert.equal(capturedAuthHeader, `Bearer ${TEST_TOKEN}`);
});

test('analyzeResume throws a clear auth error when token resolver is missing', async () => {
  configureApiAuth({ tokenResolver: null });

  await assert.rejects(
    () =>
      analyzeResume(
        { type: 'text', content: 'Experience\n- Built backend APIs' },
        { text: 'Need someone with API scaling experience.' }
      ),
    /Authentication is not initialized\. Please sign in again\./
  );
});

test('analyzeResume falls back to Experience section when rewritten bullet section is missing', async () => {
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          rewrittenBullets: [
            {
              original: 'Built backend APIs',
              improved: 'Built backend APIs serving 1M+ monthly requests',
            },
          ],
          rewriteSuggestions: [],
          missingKeywords: [],
          atsWarnings: [],
          suggestions: [],
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const result = await analyzeResume(
    { type: 'text', content: 'Experience\n- Built backend APIs' },
    { text: 'Need someone with API scaling experience.' }
  );

  assert.equal(result.bulletChanges.length, 1);
  assert.equal(result.bulletChanges[0]?.section, 'Experience');
});
