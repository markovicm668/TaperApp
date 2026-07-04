import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUME_WORKSPACE_STORAGE_KEY,
  loadWorkspaceFromSession,
  readWorkspaceFromSession,
} from './storage.ts';

class MemoryStorage {
  #data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#data.has(key) ? this.#data.get(key) || null : null;
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, value);
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }
}

function setupWindow() {
  const sessionStorage = new MemoryStorage();
  Object.assign(globalThis, {
    window: {
      sessionStorage,
    },
  });
  return sessionStorage;
}

test.afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

test('readWorkspaceFromSession drops malformed workspace payload', () => {
  const storage = setupWindow();
  storage.setItem(RESUME_WORKSPACE_STORAGE_KEY, '{malformed-json');

  const workspace = readWorkspaceFromSession();

  assert.equal(workspace, null);
  assert.equal(storage.getItem(RESUME_WORKSPACE_STORAGE_KEY), null);
});

test('loadWorkspaceFromSession returns valid existing workspace first', () => {
  const storage = setupWindow();
  const now = '2026-02-07T00:00:00.000Z';

  storage.setItem(
    RESUME_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      version: '2',
      source: {
        inputType: 'text',
        rawText: 'Existing text',
        importedAt: now,
        parsedAt: now,
        parser: 'manual',
      },
      resumeData: {
        education: [],
        work: [],
        projects: [],
        awards: [],
        skills: [],
        languages: [],
      },
      analysis: {
        resultId: null,
        lastAnalysisResult: null,
        bulletChanges: [],
        ai: {
          parsed: null,
          reasoning: null,
        },
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  const workspace = loadWorkspaceFromSession();

  assert.equal(workspace.source.rawText, 'Existing text');
  assert.equal(workspace.version, '2');
  // Blobs persisted before the field existed default to no linked application.
  assert.equal(workspace.analysis.applicationId, null);
});

test('loadWorkspaceFromSession preserves a stored applicationId', () => {
  const storage = setupWindow();
  const now = '2026-02-07T00:00:00.000Z';

  storage.setItem(
    RESUME_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      version: '2',
      source: {
        inputType: 'text',
        rawText: 'Existing text',
        importedAt: now,
        parsedAt: now,
        parser: 'manual',
      },
      resumeData: {
        education: [],
        work: [],
        projects: [],
        awards: [],
        skills: [],
        languages: [],
      },
      analysis: {
        resultId: null,
        applicationId: 'app-1',
        lastAnalysisResult: null,
        bulletChanges: [],
        ai: {
          parsed: null,
          reasoning: null,
        },
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  const workspace = loadWorkspaceFromSession();

  assert.equal(workspace.analysis.applicationId, 'app-1');
});

test('readWorkspaceFromSession ignores legacy workspace key format', () => {
  const storage = setupWindow();
  const now = '2026-02-07T00:00:00.000Z';

  storage.setItem(
    'resumeWorkspace.v1',
    JSON.stringify({
      version: '1',
      resume: {
        id: 'resume-1',
        schemaVersion: '1',
        source: {
          inputType: 'text',
          rawText: 'Legacy text',
          importedAt: now,
        },
        experience: [],
        education: [],
        skills: [],
        meta: {
          schemaVersion: '1',
          parsedAt: now,
          parser: 'legacy-parser',
        },
      },
      analysis: {
        resultId: null,
        lastAnalysisResult: null,
        bulletChanges: [],
        ai: {
          parsed: null,
          reasoning: null,
        },
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  const workspace = readWorkspaceFromSession();

  assert.equal(workspace, null);
  assert.ok(storage.getItem('resumeWorkspace.v1'));
  assert.equal(storage.getItem(RESUME_WORKSPACE_STORAGE_KEY), null);
});

test('readWorkspaceFromSession rejects old v2 parsed payload shape', () => {
  const storage = setupWindow();
  const now = '2026-02-09T00:00:00.000Z';

  storage.setItem(
    RESUME_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      version: '2',
      source: {
        inputType: 'text',
        rawText: 'Existing text',
        importedAt: now,
        parsedAt: now,
        parser: 'manual',
      },
      resumeData: {
        education: [],
        work: [],
        projects: [],
        awards: [],
        skills: [],
        languages: [],
      },
      analysis: {
        resultId: null,
        lastAnalysisResult: null,
        bulletChanges: [],
        ai: {
          parsed: {
            version: '2',
            source: {
              inputType: 'text',
              rawText: 'Parsed payload text',
              importedAt: now,
              parsedAt: now,
              parser: 'gemini-section-parser-v2',
            },
            resumeData: {
              education: [],
              work: [],
              projects: [],
              awards: [],
              skills: [],
              languages: [],
            },
            notes: ['legacy v2 payload shape'],
          },
          reasoning: null,
        },
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  const workspace = readWorkspaceFromSession();

  assert.equal(workspace, null);
  assert.equal(storage.getItem(RESUME_WORKSPACE_STORAGE_KEY), null);
});

test('loadWorkspaceFromSession creates a canonical empty workspace when storage is invalid', () => {
  setupWindow();

  const workspace = loadWorkspaceFromSession();

  assert.equal(workspace.version, '2');
  assert.equal(workspace.analysis.resultId, null);
  assert.equal(workspace.source.inputType, 'text');
});
