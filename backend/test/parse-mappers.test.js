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

test('buildParsedPayload drops custom-section lines already mapped into canonical sections', () => {
  const sharedBullet = 'Collaborate with cross-functional teams to ship features on schedule';
  const payload = buildParsedPayload({
    resumeCandidate: {
      work: [
        {
          position: 'Engineer',
          company: 'Acme',
          highlights: [sharedBullet, 'Mentored two junior engineers'],
        },
      ],
    },
    sectionBlocks: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        canonicalTarget: 'work',
        lines: ['Acme — Engineer'],
      },
      {
        id: 'unstructured_bullets',
        title: 'Unstructured Bullets',
        kind: 'custom',
        canonicalTarget: 'none',
        // Same bullets the model already placed into work[] (one carries a list prefix).
        lines: [sharedBullet, '- Mentored two junior engineers'],
      },
    ],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  // Canonical work highlights remain intact.
  assert.deepEqual(
    payload.resumeData.work[0].highlights.map((item) => item.text),
    [sharedBullet, 'Mentored two junior engineers']
  );

  // The duplicate catch-all section is gone from BOTH arrays.
  assert.ok(
    !(payload.sections || []).some((section) => section.id === 'unstructured_bullets'),
    'unstructured_bullets should be removed from sections'
  );
  assert.ok(
    !(payload.customSections || []).some((section) => section.id === 'unstructured_bullets'),
    'unstructured_bullets should be removed from customSections'
  );
});

test('buildParsedPayload keeps genuine custom sections that do not duplicate canonical content', () => {
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
        lines: ['Built backend APIs'],
      },
      {
        id: 'section-volunteering',
        title: 'Volunteering',
        kind: 'custom',
        canonicalTarget: 'none',
        lines: ['Organized local coding workshops for students'],
      },
    ],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  const custom = (payload.customSections || []).find(
    (section) => section.id === 'section-volunteering'
  );
  assert.ok(custom, 'volunteering section should be retained');
  assert.deepEqual(custom.lines, ['Organized local coding workshops for students']);
});

test('buildParsedPayload serializes structured custom entries into canonical lines', () => {
  const payload = buildParsedPayload({
    resumeCandidate: {},
    sectionBlocks: [
      {
        id: 'section-training',
        title: 'Training',
        kind: 'custom',
        canonicalTarget: 'none',
        // Raw lines are in the messy extraction order, but the model also
        // supplied structured entries with dates associated to each heading.
        lines: ['Route Academy', 'jumbled raw fallback'],
        entries: [
          {
            heading: 'Route Academy',
            subheading: '9-month Diploma in Full Stack Web Development.',
            startDate: '07/2021',
            endDate: '03/2022',
            bullets: ['Acquired expertise in frontend development.'],
          },
          {
            heading: 'Resala Organization',
            subheading: 'Web Design Training.',
            startDate: '10/2020',
            endDate: '03/2021',
            bullets: ['HTML, HTML 5, CSS, CSS3, Bootstrap 5.'],
          },
        ],
      },
    ],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  const custom = (payload.customSections || []).find(
    (section) => section.id === 'section-training'
  );
  assert.ok(custom, 'training section should be retained');
  // Structured entries win over raw lines, in heading → date → description → bullets order.
  assert.deepEqual(custom.lines, [
    'Route Academy',
    '07/2021 – 03/2022',
    '9-month Diploma in Full Stack Web Development.',
    '• Acquired expertise in frontend development.',
    'Resala Organization',
    '10/2020 – 03/2021',
    'Web Design Training.',
    '• HTML, HTML 5, CSS, CSS3, Bootstrap 5.',
  ]);
});

test('buildParsedPayload falls back to raw lines when custom entries are unusable', () => {
  const payload = buildParsedPayload({
    resumeCandidate: {},
    sectionBlocks: [
      {
        id: 'section-training',
        title: 'Training',
        kind: 'custom',
        canonicalTarget: 'none',
        lines: ['Route Academy', 'Web Design Training.'],
        // No heading on any entry -> not trustworthy, keep raw lines.
        entries: [{ bullets: ['stray bullet'] }],
      },
    ],
    resumeText: 'Example raw text',
    inputType: 'text',
    parserName: 'test-parser',
  });

  const custom = (payload.customSections || []).find(
    (section) => section.id === 'section-training'
  );
  assert.ok(custom, 'training section should be retained');
  assert.deepEqual(custom.lines, ['Route Academy', 'Web Design Training.']);
});
