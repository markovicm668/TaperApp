const test = require('node:test');
const assert = require('node:assert/strict');

const { buildParsedPayload } = require('../services/parseMappers');

test('buildParsedPayload stores canonical bullets without list prefixes', () => {
  const payload = buildParsedPayload({
    resumeCandidate: {
      work: [
        {
          position: 'Engineer',
          highlights: [
            '- Built backend APIs',
            '• Launched integration platform',
            '2) Reduced latency by 30%',
          ],
        },
      ],
      education: [
        {
          institution: 'State University',
          area: 'Information Systems',
        },
      ],
    },
    sectionBlocks: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        canonicalTarget: 'work',
        lines: ['- Built backend APIs'],
      },
    ],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  assert.deepEqual(
    payload.resumeData.work[0].highlights.map((item) => item.text),
    [
      'Built backend APIs',
      'Launched integration platform',
      'Reduced latency by 30%',
    ]
  );
  assert.equal(payload.resumeData.education[0].institution, 'State University');
});

test('buildParsedPayload keeps section lines unchanged for display fidelity', () => {
  const payload = buildParsedPayload({
    resumeCandidate: {
      work: [
        {
          position: 'Engineer',
          highlights: ['Built backend APIs'],
        },
      ],
    },
    sectionBlocks: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        canonicalTarget: 'work',
        lines: ['- Built backend APIs', '• Improved reliability'],
      },
    ],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  assert.deepEqual(payload.sections[0].lines, ['- Built backend APIs', '• Improved reliability']);
});

test('buildParsedPayload preserves object-shaped highlights and technologies', () => {
  const payload = buildParsedPayload({
    resumeCandidate: {
      work: [
        {
          position: 'Engineer',
          highlights: [{ text: 'Built API platform' }, { originalText: 'Reduced cloud spend 20%' }],
        },
      ],
      projects: [
        {
          name: 'Internal Portal',
          technologies: [{ name: 'React', skillRefId: 'skill-ref-react' }, { skill: 'Node.js' }],
          highlights: [{ text: 'Shipped role-based access controls' }],
        },
      ],
    },
    sectionBlocks: [],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  assert.deepEqual(
    payload.resumeData.work[0].highlights.map((item) => item.text),
    ['Built API platform', 'Reduced cloud spend 20%']
  );
  assert.deepEqual(
    payload.resumeData.projects[0].technologies.map((item) => item.name),
    ['React', 'Node.js']
  );
  assert.equal(payload.resumeData.projects[0].technologies[0].skillRefId, 'skill-ref-react');
});

test('buildParsedPayload preserves direct canonical skill objects', () => {
  const payload = buildParsedPayload({
    resumeCandidate: {
      skills: [
        { id: 'skill-1', name: 'JavaScript', category: 'Technical' },
        { skill: 'TypeScript', category: 'Technical' },
      ],
    },
    sectionBlocks: [],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  assert.deepEqual(
    payload.resumeData.skills.map((item) => item.name),
    ['JavaScript', 'TypeScript']
  );
});
