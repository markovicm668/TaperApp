import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeResume,
  configureApiAuth,
  exportResumePdf,
  parseResume,
  updateApplicationParsed,
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

const EMPTY_AI_RESPONSE = {
  meta: { matchScore: 70, overallFit: 'good', targetRole: 'Engineer', company: 'Acme', roleSeniority: 'mid' },
  highlights: { update: [] },
  skills: { add: [], remove: [] },
  categories: { rename: [] },
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

test('updateApplicationParsed patches the application with edits and attaches bearer token', async () => {
  let capturedUrl: string | null = null;
  let capturedMethod: string | undefined;
  let capturedBody: unknown = null;
  let capturedAuthHeader: string | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedMethod = init?.method;
    capturedAuthHeader = new Headers(init?.headers).get('Authorization');
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return {
      ok: true,
      status: 200,
      json: async () => ({ application: { id: 'app-1' } }),
    } as unknown as Response;
  }) as typeof fetch;

  const payload = {
    parsed: {
      version: '2' as const,
      resumeData: { work: [], education: [], projects: [], awards: [], skills: [], languages: [] },
      source: {
        inputType: 'text' as const,
        rawText: 'Jane Doe',
        importedAt: '2026-02-07T00:00:00.000Z',
        parser: 'manual',
        parsedAt: '2026-02-07T00:00:00.000Z',
      },
      notes: [],
    },
    bulletChanges: [
      { section: 'work', original: 'a', improved: 'b', type: 'modified' as const },
    ],
  };

  await updateApplicationParsed('app-1', payload);

  assert.ok(capturedUrl?.endsWith('/applications/app-1'));
  assert.equal(capturedMethod, 'PATCH');
  assert.equal(capturedAuthHeader, `Bearer ${TEST_TOKEN}`);
  assert.deepEqual(capturedBody, payload);
});

test('analyzeResume routes highlight updates to work, projects, and summary by id', async () => {
  let capturedAuthHeader: string | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedAuthHeader = new Headers(init?.headers).get('Authorization');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          ...EMPTY_AI_RESPONSE,
          highlights: {
            update: [
              {
                id: 'work-1-highlight-1',
                text: 'Built a portfolio app adopted by 2,000+ monthly users',
              },
              {
                id: '[project-1-highlight-1]',
                text: 'Shipped a public portfolio site with case studies',
              },
              {
                id: 'summary-0',
                text: 'Results-oriented engineer rewritten for the role.',
              },
            ],
          },
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const parsedResumeData = {
    summary: 'Original summary text.',
    work: [
      {
        id: 'work-1',
        highlights: [
          { id: 'work-1-highlight-1', text: 'Built a portfolio app' },
        ],
      },
    ],
    projects: [
      {
        id: 'project-1',
        highlights: [
          { id: 'project-1-highlight-1', text: 'Original project bullet' },
        ],
      },
    ],
    education: [],
    awards: [],
    skills: [],
    languages: [],
    customSections: [],
    sectionOrder: [],
    versions: [],
  } as unknown as Parameters<typeof analyzeResume>[2];

  const { result } = await analyzeResume(
    { type: 'text', content: 'Projects\n- Built a portfolio app' },
    { text: 'Need someone with shipped project outcomes.' },
    parsedResumeData
  );

  assert.equal(capturedAuthHeader, `Bearer ${TEST_TOKEN}`);
  assert.equal(result.bulletChanges.length, 3);

  const workChange = result.bulletChanges.find(c => c.id === 'work-1-highlight-1');
  assert.ok(workChange);
  assert.equal(workChange?.section, 'Experience');
  assert.equal(workChange?.original, 'Built a portfolio app');
  assert.equal(workChange?.improved, 'Built a portfolio app adopted by 2,000+ monthly users');

  const projectChange = result.bulletChanges.find(c => c.section === 'Projects');
  assert.ok(projectChange);
  // bracket wrapper "[project-1-highlight-1]" should be unwrapped before lookup
  assert.equal(projectChange?.id, 'project-1-highlight-1');
  assert.equal(projectChange?.original, 'Original project bullet');
  assert.equal(projectChange?.improved, 'Shipped a public portfolio site with case studies');

  const summaryChange = result.bulletChanges.find(c => c.section === 'Summary');
  assert.ok(summaryChange);
  assert.equal(summaryChange?.id, 'summary-0');
  assert.equal(summaryChange?.original, 'Original summary text.');
  assert.equal(summaryChange?.improved, 'Results-oriented engineer rewritten for the role.');
});

test('analyzeResume drops highlight updates with unknown ids instead of misrouting them to Summary', async () => {
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          ...EMPTY_AI_RESPONSE,
          highlights: {
            update: [
              { id: 'work-1-highlight-1', text: 'Improved real bullet' },
              { id: 'work-99-highlight-42', text: 'Phantom bullet that should be dropped' },
              { id: 'summary', text: 'Wrong-id summary that should be dropped' },
              { id: '', text: 'Empty-id update that should be dropped' },
            ],
          },
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const parsedResumeData = {
    summary: 'Original summary text.',
    work: [
      {
        id: 'work-1',
        highlights: [
          { id: 'work-1-highlight-1', text: 'Original work bullet' },
        ],
      },
    ],
    projects: [],
    education: [],
    awards: [],
    skills: [],
    languages: [],
    customSections: [],
    sectionOrder: [],
    versions: [],
  } as unknown as Parameters<typeof analyzeResume>[2];

  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  try {
    const { result } = await analyzeResume(
      { type: 'text', content: 'Experience\n- Original work bullet' },
      { text: 'Need someone with shipped project outcomes.' },
      parsedResumeData
    );

    // Only the one valid update survives; nothing falls through to Summary.
    assert.equal(result.bulletChanges.length, 1);
    assert.equal(result.bulletChanges[0]?.section, 'Experience');
    assert.equal(result.bulletChanges[0]?.id, 'work-1-highlight-1');
    assert.equal(
      result.bulletChanges.find(c => c.section === 'Summary'),
      undefined
    );
    // Each unknown id should produce a warn (3 dropped: phantom, "summary", "").
    assert.equal(warnCalls.length, 3);
  } finally {
    console.warn = originalWarn;
  }
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
        data: EMPTY_AI_RESPONSE,
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

test('analyzeResume maps skill add/remove and strips bracket prefixes', async () => {
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          ...EMPTY_AI_RESPONSE,
          skills: {
            add: [{ name: '[CRM] Salesforce', category: 'CRM' }],
            remove: [{ id: 'skill-old-1' }],
          },
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const parsedResumeData = {
    summary: '',
    work: [],
    projects: [],
    education: [],
    awards: [],
    skills: [
      { id: 'skill-old-1', name: 'jQuery', category: 'Languages' },
    ],
    languages: [],
    customSections: [],
    sectionOrder: [],
    versions: [],
  } as unknown as Parameters<typeof analyzeResume>[2];

  const { result } = await analyzeResume(
    { type: 'text', content: 'Experience\n- Built backend APIs' },
    { text: 'Need someone with API scaling experience.' },
    parsedResumeData
  );

  assert.equal(result.bulletChanges.length, 2);
  const added = result.bulletChanges.find(c => c.type === 'added');
  const removed = result.bulletChanges.find(c => c.type === 'removed');

  assert.equal(added?.improved, '[CRM] Salesforce');
  assert.equal(removed?.id, 'skill-old-1');
  assert.equal(removed?.original, 'jQuery');
});
