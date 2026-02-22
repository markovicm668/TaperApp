const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aiParsedResumePayloadSchema,
  analysisSnapshotSchema,
  createEmptyWorkspace,
  resumeDataSchema,
  safeParseResumeWorkspace,
} = require('@resume-scanner/resume-contract');

test('createEmptyWorkspace returns schema-valid workspace', () => {
  const workspace = createEmptyWorkspace();
  const parsed = safeParseResumeWorkspace(workspace);

  assert.equal(parsed.success, true);
  assert.equal(workspace.version, '2');
  assert.equal(workspace.analysis.resultId, null);
  assert.deepEqual(workspace.analysis.bulletChanges, []);
});

test('resumeDataSchema rejects invalid skills type', () => {
  const invalidResumeData = {
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: 42,
    languages: [],
  };

  const parsed = resumeDataSchema.safeParse(invalidResumeData);
  assert.equal(parsed.success, false);
});

test('analysisSnapshotSchema accepts completed analysis snapshot payload', () => {
  const analysis = {
    id: 'analysis-1',
    createdAt: new Date().toISOString(),
    matchScore: 88,
    roleSeniority: 'senior',
    overallFit: 'great',
    targetRole: 'Staff Frontend Engineer',
    company: 'Example Co',
    status: 'completed',
    keywordGaps: [],
    bulletChanges: [],
    rewriteSuggestions: [],
    atsChecks: [],
    riskFlags: [],
    recommendedEdits: [],
  };

  const parsed = analysisSnapshotSchema.safeParse(analysis);
  assert.equal(parsed.success, true);
});

test('aiParsedResumePayloadSchema accepts optional dynamic section metadata', () => {
  const now = new Date().toISOString();
  const payload = {
    version: '2',
    source: {
      inputType: 'text',
      rawText: 'Sample resume',
      importedAt: now,
      parser: 'gemini-section-parser-v2',
      parsedAt: now,
    },
    resumeData: {
      basics: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        location: {
          city: 'Belgrade',
          country: 'Serbia',
        },
      },
      education: [],
      work: [],
      projects: [],
      awards: [],
      skills: [{ id: 'skill-1', name: 'Node.js', category: 'Technical' }],
      languages: [],
    },
    notes: [],
    sections: [
      {
        id: 'section-1',
        title: 'Header',
        kind: 'header',
        canonicalTarget: 'none',
        lines: ['Jane Doe'],
      },
      {
        id: 'section-2',
        title: 'Projects',
        kind: 'projects',
        canonicalTarget: 'projects',
        lines: ['Built a deployment pipeline'],
      },
    ],
    sectionPresence: {
      summary: false,
      work: false,
      projects: true,
      skills: true,
      education: false,
      awards: false,
      languages: false,
    },
    customSections: [
      {
        id: 'section-3',
        title: 'Publications',
        kind: 'custom',
        canonicalTarget: 'none',
        lines: ['Published article'],
      },
    ],
  };

  const parsed = aiParsedResumePayloadSchema.safeParse(payload);
  assert.equal(parsed.success, true);
});

test('safeParseResumeWorkspace rejects v1 workspace payload', () => {
  const now = new Date().toISOString();
  const legacyWorkspace = {
    version: '1',
    resume: {
      id: 'resume-legacy-1',
      schemaVersion: '1',
      source: {
        inputType: 'text',
        rawText: 'Legacy payload',
        importedAt: now,
      },
      experience: [
        {
          id: 'experience-1',
          role: 'Engineer',
          company: 'Legacy Corp',
          highlights: [{ id: 'bullet-1', text: 'Built APIs' }],
        },
      ],
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
  };

  const parsed = safeParseResumeWorkspace(legacyWorkspace);
  assert.equal(parsed.success, false);
});
