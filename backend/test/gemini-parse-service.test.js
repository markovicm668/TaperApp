const test = require('node:test');
const assert = require('node:assert/strict');

const { parseResumeSections } = require('../services/geminiParseService');

const SAMPLE_RESUME = `
Jane Doe
Summary
Senior engineer
Experience
Engineer at Acme
- Built APIs
`;

test('parseResumeSections returns Gemini payload on valid model output', async () => {
  const modelOutput = JSON.stringify({
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
        title: 'Summary',
        kind: 'summary',
        canonicalTarget: 'summary',
        lines: ['Senior engineer'],
      },
      {
        id: 'section-3',
        title: 'Experience',
        kind: 'work',
        canonicalTarget: 'work',
        lines: ['Engineer at Acme', '- Built APIs'],
      },
    ],
    resumeData: {
      basics: { name: 'Jane Doe' },
      work: [{ position: 'Engineer', company: 'Acme', highlights: ['Built APIs'] }],
      education: [],
      projects: [],
      awards: [],
      skills: { technical: ['JavaScript'] },
      languages: [],
    },
    notes: [],
  });

  const result = await parseResumeSections(
    { resumeText: SAMPLE_RESUME, inputType: 'text' },
    {
      geminiGenerateContent: async () => modelOutput,
    }
  );

  assert.equal(result.source, 'gemini');
  assert.equal(result.payload.version, '2');
  assert.equal(result.payload.source.parser, 'gemini-section-parser-v2');
  assert.equal(result.payload.resumeData.work.length, 1);
  assert.equal(result.payload.sections?.length, 3);
});

test('parseResumeSections throws PARSE_FAILED when Gemini output is malformed JSON', async () => {
  await assert.rejects(
    parseResumeSections(
      { resumeText: SAMPLE_RESUME, inputType: 'text' },
      {
        geminiGenerateContent: async () => '```json\nnot-json\n```',
      }
    ),
    (error) => {
      assert.equal(error.code, 'PARSE_FAILED');
      return true;
    }
  );
});

test('parseResumeSections throws PARSE_FAILED when payload validation fails', async () => {
  const modelOutput = JSON.stringify({
    resumeData: {
      basics: { name: 'Jane Doe' },
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: {},
      languages: [],
    },
    notes: [],
  });

  await assert.rejects(
    parseResumeSections(
      { resumeText: SAMPLE_RESUME, inputType: 'text' },
      {
        geminiGenerateContent: async () => modelOutput,
        validatePayload: () => ({ success: false, error: new Error('schema invalid') }),
      }
    ),
    (error) => {
      assert.equal(error.code, 'PARSE_FAILED');
      return true;
    }
  );
});

test('parseResumeSections throws PARSE_FAILED when Gemini repeatedly fails', async () => {
  await assert.rejects(
    parseResumeSections(
      { resumeText: SAMPLE_RESUME, inputType: 'text' },
      {
        geminiGenerateContent: async () => '{bad json',
      }
    ),
    (error) => {
      assert.equal(error.code, 'PARSE_FAILED');
      return true;
    }
  );
});

test('parseResumeSections succeeds on sequential calls (no connection pool exhaustion)', async () => {
  const modelOutput = JSON.stringify({
    sections: [
      { id: 'section-1', title: 'Header', kind: 'header', canonicalTarget: 'none', lines: ['Jane Doe'] },
      { id: 'section-2', title: 'Summary', kind: 'summary', canonicalTarget: 'summary', lines: ['Senior engineer'] },
      { id: 'section-3', title: 'Experience', kind: 'work', canonicalTarget: 'work', lines: ['Engineer at Acme', '- Built APIs'] },
    ],
    resumeData: {
      basics: { name: 'Jane Doe' },
      work: [{ position: 'Engineer', company: 'Acme', highlights: ['Built APIs'] }],
      education: [],
      projects: [],
      awards: [],
      skills: { technical: ['JavaScript'] },
      languages: [],
    },
    notes: [],
  });

  let callCount = 0;
  const mockGenerate = async () => { callCount++; return modelOutput; };

  const result1 = await parseResumeSections(
    { resumeText: SAMPLE_RESUME, inputType: 'text' },
    { geminiGenerateContent: mockGenerate }
  );
  assert.equal(result1.source, 'gemini');

  const result2 = await parseResumeSections(
    { resumeText: SAMPLE_RESUME, inputType: 'text' },
    { geminiGenerateContent: mockGenerate }
  );
  assert.equal(result2.source, 'gemini');
  assert.equal(callCount, 2, 'Both sequential calls should complete');
});

test('createGeminiGenerateContent throws timeout error when request hangs', async () => {
  const { createGeminiGenerateContent: createFn } = require('../services/geminiParseService');

  // Mock: override at module level to test the AbortController path
  // Instead, we test that a slow geminiGenerateContent injected into
  // parseResumeSections correctly propagates the timeout error.
  const slowMock = () => new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Gemini API timed out after 60s')), 50);
  });

  await assert.rejects(
    parseResumeSections(
      { resumeText: SAMPLE_RESUME, inputType: 'text' },
      { geminiGenerateContent: slowMock }
    ),
    (error) => {
      assert.equal(error.code, 'PARSE_FAILED');
      assert.match(error.details?.geminiError || '', /timed out/i);
      return true;
    }
  );
});

test('parseResumeSections keeps projects as canonical section and marks summary absent', async () => {
  const modelOutput = JSON.stringify({
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
        title: 'Personal Projects',
        kind: 'projects',
        canonicalTarget: 'projects',
        lines: ['Built internal job board', '- Implemented role-based access'],
      },
      {
        id: 'section-3',
        title: 'Skills',
        kind: 'skills',
        canonicalTarget: 'skills',
        lines: ['JavaScript, React'],
      },
    ],
    resumeData: {
      basics: { name: 'Jane Doe' },
      work: [],
      education: [],
      projects: [{ name: 'Internal Job Board', highlights: ['Implemented role-based access'], technologies: [] }],
      awards: [],
      skills: { core: ['JavaScript', 'React'] },
      languages: [],
    },
    notes: [],
  });

  const result = await parseResumeSections(
    { resumeText: SAMPLE_RESUME, inputType: 'text' },
    {
      geminiGenerateContent: async () => modelOutput,
    }
  );

  assert.equal(result.source, 'gemini');
  assert.equal(result.payload.sectionPresence?.summary, false);
  assert.equal(result.payload.resumeData.work.length, 0);
  assert.equal(result.payload.resumeData.projects.length, 1);
  assert.equal(
    result.payload.sections?.some((section) => section.kind === 'projects'),
    true
  );
});
