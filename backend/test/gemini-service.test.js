const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeResume, buildAnalyzePrompt } = require('../services/geminiService');

const PARSED_RESUME = {
  basics: { name: 'Jane Doe', title: 'Engineer', email: 'jane@example.com' },
  summary: 'Senior engineer.',
  work: [
    {
      id: 'work-0',
      company: 'Acme',
      position: 'Engineer',
      highlights: [{ id: 'work-0-hl-0', text: 'Built APIs' }],
    },
  ],
  skills: [{ id: 'skill-0', name: 'React', category: 'Frontend' }],
};

const VALID_OUTPUT = {
  meta: { matchScore: 70, overallFit: 'good', targetRole: 'Engineer', company: 'Acme' },
  highlights: { update: [{ id: 'work-0-hl-0', text: 'Built and shipped APIs' }] },
  categories: { rename: [] },
  skills: { add: [], remove: [] },
};

function stubModel(responses) {
  const calls = [];
  const generate = async (prompt) => {
    calls.push(prompt);
    const next = responses[calls.length - 1];
    if (next === undefined) throw new Error('Unexpected extra Gemini call');
    return next;
  };
  return { generate, calls };
}

async function analyze(responses) {
  const { generate, calls } = stubModel(responses);
  const result = await analyzeResume(
    { jobDescription: 'Senior Engineer role', parsedResumeData: PARSED_RESUME },
    { geminiGenerateContent: generate }
  );
  return { result, calls };
}

test('analyzeResume parses a clean JSON response', async () => {
  const { result, calls } = await analyze([JSON.stringify(VALID_OUTPUT)]);
  assert.equal(result.meta.matchScore, 70);
  assert.equal(calls.length, 1);
});

// Each of these breaks a bare JSON.parse, which is what /analyze used to do.
const MALFORMED = {
  'markdown fences': '```json\n' + JSON.stringify(VALID_OUTPUT) + '\n```',
  'prose preamble': 'Here is the analysis:\n' + JSON.stringify(VALID_OUTPUT),
  'trailing prose': JSON.stringify(VALID_OUTPUT) + '\nLet me know if you need more.',
};

for (const [name, output] of Object.entries(MALFORMED)) {
  test(`analyzeResume recovers from ${name} without a retry`, async () => {
    const { result, calls } = await analyze([output]);
    assert.equal(result.meta.matchScore, 70);
    assert.equal(calls.length, 1, 'should recover in-place, not spend a second call');
  });
}

test('analyzeResume recovers from raw control characters inside strings', async () => {
  const output = '{"meta":{"matchScore":70,"targetRole":"Senior\nEngineer"}}';
  assert.throws(() => JSON.parse(output), 'fixture must break a bare JSON.parse');

  const { result } = await analyze([output]);
  assert.equal(result.meta.matchScore, 70);
});

test('analyzeResume retries once with a repair note, then succeeds', async () => {
  const { result, calls } = await analyze(['not json at all', JSON.stringify(VALID_OUTPUT)]);
  assert.equal(result.meta.matchScore, 70);
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].includes('REPAIR NOTE'), 'first attempt carries no repair note');
  assert.ok(calls[1].includes('REPAIR NOTE'), 'retry tells the model what went wrong');
});

test('analyzeResume throws AI_JSON_PARSE_FAILED after exhausting retries', async () => {
  const { generate, calls } = stubModel(['nope', 'still nope']);
  await assert.rejects(
    analyzeResume(
      { jobDescription: 'Senior Engineer role', parsedResumeData: PARSED_RESUME },
      { geminiGenerateContent: generate }
    ),
    (err) => {
      assert.equal(err.code, 'AI_JSON_PARSE_FAILED');
      assert.equal(err.message, 'AI returned invalid JSON structure.');
      return true;
    }
  );
  assert.equal(calls.length, 2);
});

test('buildAnalyzePrompt embeds the serialized resume and job description', () => {
  const prompt = buildAnalyzePrompt({
    resumeForPrompt: '[work-0-hl-0] Built APIs',
    jobDescription: 'Senior Engineer role',
  });
  assert.ok(prompt.includes('[work-0-hl-0] Built APIs'));
  assert.ok(prompt.includes('Senior Engineer role'));
  assert.ok(!prompt.includes('REPAIR NOTE'));
});

test('analyzeResume falls back to raw resume text when no parsed data is given', async () => {
  const { generate, calls } = stubModel([JSON.stringify(VALID_OUTPUT)]);
  await analyzeResume(
    { resumeText: 'RAW RESUME TEXT', jobDescription: 'Senior Engineer role' },
    { geminiGenerateContent: generate }
  );
  assert.ok(calls[0].includes('RAW RESUME TEXT'));
});
