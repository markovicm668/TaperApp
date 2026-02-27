import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiParsedResumePayloadV2, ResumeSectionBlockV2 } from '@resume-scanner/resume-contract';
import {
  buildCanonicalExportPayload,
  buildSectionViewModel,
} from './mappers.ts';
import { applyBulletChangesToResumeData } from './effective.ts';

const SAMPLE_RESUME_TEXT = `Jane Doe
jane@example.com

Experience
- Built backend APIs`;

const SAMPLE_PARSED_SECTIONS: ResumeSectionBlockV2[] = [
  {
    id: 'section-header',
    title: 'Header',
    kind: 'header',
    lines: ['Jane Doe', 'jane@example.com'],
    canonicalTarget: 'none',
  },
  {
    id: 'section-work',
    title: 'Experience',
    kind: 'work',
    lines: ['- Built backend APIs'],
    canonicalTarget: 'work',
  },
  {
    id: 'custom-publications',
    title: 'Publications',
    kind: 'custom',
    lines: ['- Published engineering blog post'],
    canonicalTarget: 'none',
  },
];

function makeParsedPayload(overrides: Partial<AiParsedResumePayloadV2> = {}): AiParsedResumePayloadV2 {
  return {
    version: '2',
    source: {
      inputType: 'text',
      rawText: SAMPLE_RESUME_TEXT,
      importedAt: '2026-02-10T00:00:00.000Z',
      parsedAt: '2026-02-10T00:00:00.000Z',
      parser: 'gemini-section-parser-v2',
    },
    resumeData: {
      basics: {
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      summary: 'Product-focused software engineer.',
      work: [
        {
          company: 'Acme',
          position: 'Engineer',
          highlights: [{ text: 'Built backend APIs', originalText: 'Built backend APIs' }],
        },
      ],
      education: [],
      projects: [],
      awards: [],
      skills: [{ name: 'TypeScript', category: 'Technical' }],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
    notes: [],
    sections: SAMPLE_PARSED_SECTIONS.filter(section => section.kind !== 'custom'),
    customSections: SAMPLE_PARSED_SECTIONS.filter(section => section.kind === 'custom'),
    ...overrides,
  };
}

test('buildCanonicalExportPayload keeps full canonical resume and deterministic section order', () => {
  const payload = buildCanonicalExportPayload(makeParsedPayload());

  assert.ok(payload);
  assert.equal(payload?.basics?.name, 'Jane Doe');
  assert.equal(payload?.summary, 'Product-focused software engineer.');
  assert.equal(payload?.work?.length, 1);
  assert.equal(payload?.skills?.[0]?.name, 'TypeScript');

  assert.ok(payload?.sections);
  assert.equal(payload?.sections?.length, 3);
  assert.deepEqual(payload?.sectionOrder, ['section-header', 'section-work', 'custom-publications']);
});

test('buildCanonicalExportPayload reorders parsed canonical sections to match results-page canonical order', () => {
  const base = makeParsedPayload();
  const payload = buildCanonicalExportPayload({
    ...base,
    resumeData: {
      ...base.resumeData,
      education: [{ institution: 'Example University' }],
      languages: [{ language: 'English', fluency: 'Intermediate' }],
      sectionOrder: [],
    },
    sections: [
      {
        id: 'sec-contact',
        title: 'CONTACT',
        kind: 'header',
        lines: ['Jane Doe', 'jane@example.com'],
        canonicalTarget: 'none',
      },
      {
        id: 'sec-skills',
        title: 'SKILLS',
        kind: 'skills',
        lines: ['TypeScript'],
        canonicalTarget: 'skills',
      },
      {
        id: 'sec-languages',
        title: 'LANGUAGES',
        kind: 'languages',
        lines: ['English (Intermediate)'],
        canonicalTarget: 'languages',
      },
      {
        id: 'sec-about',
        title: 'ABOUT ME',
        kind: 'summary',
        lines: ['Product-focused software engineer.'],
        canonicalTarget: 'summary',
      },
      {
        id: 'sec-work',
        title: 'WORK EXPERIENCE',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
      {
        id: 'sec-education',
        title: 'EDUCATION',
        kind: 'education',
        lines: ['Example University'],
        canonicalTarget: 'education',
      },
    ],
    customSections: [],
  });

  assert.ok(payload?.sections);
  assert.deepEqual(
    payload?.sections?.map(section => section.id),
    ['sec-contact', 'sec-about', 'sec-work', 'sec-skills', 'sec-education', 'sec-languages']
  );
  assert.deepEqual(payload?.sectionOrder, [
    'sec-contact',
    'sec-about',
    'sec-work',
    'sec-skills',
    'sec-education',
    'sec-languages',
  ]);
});

test('buildCanonicalExportPayload appends custom sections after canonical sections and preserves custom order', () => {
  const base = makeParsedPayload();
  const payload = buildCanonicalExportPayload({
    ...base,
    sections: [
      {
        id: 'sec-skills',
        title: 'Skills',
        kind: 'skills',
        lines: ['TypeScript'],
        canonicalTarget: 'skills',
      },
      {
        id: 'custom-publications',
        title: 'Publications',
        kind: 'custom',
        lines: ['Published engineering blog post'],
        canonicalTarget: 'none',
      },
      {
        id: 'sec-header',
        title: 'Header',
        kind: 'header',
        lines: ['Jane Doe'],
        canonicalTarget: 'none',
      },
      {
        id: 'custom-volunteering',
        title: 'Volunteering',
        kind: 'custom',
        lines: ['Mentored students'],
        canonicalTarget: 'none',
      },
      {
        id: 'sec-work',
        title: 'Experience',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
    ],
    customSections: [],
  });

  assert.ok(payload?.sections);
  assert.deepEqual(
    payload?.sections?.map(section => section.id),
    ['sec-header', 'sec-work', 'sec-skills', 'custom-publications', 'custom-volunteering']
  );
  assert.deepEqual(payload?.sectionOrder, [
    'sec-header',
    'sec-work',
    'sec-skills',
    'custom-publications',
    'custom-volunteering',
  ]);
});

test('buildCanonicalExportPayload respects user sectionOrder keys and ignores stale keys', () => {
  const base = makeParsedPayload();
  const payload = buildCanonicalExportPayload({
    ...base,
    resumeData: {
      ...base.resumeData,
      summary: 'Product-focused software engineer.',
      sectionOrder: [
        'canonical-header',
        'canonical-skills',
        'custom-publications',
        'canonical-work',
        'custom-missing',
      ],
    },
    sections: [
      {
        id: 'sec-header',
        title: 'CONTACT',
        kind: 'header',
        lines: ['Jane Doe', 'jane@example.com'],
        canonicalTarget: 'none',
      },
      {
        id: 'sec-work',
        title: 'WORK EXPERIENCE',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
      {
        id: 'sec-skills',
        title: 'SKILLS',
        kind: 'skills',
        lines: ['TypeScript'],
        canonicalTarget: 'skills',
      },
    ],
    customSections: [
      {
        id: 'publications',
        title: 'Publications',
        kind: 'custom',
        lines: ['Published engineering blog post'],
        canonicalTarget: 'none',
      },
    ],
  });

  assert.ok(payload?.sections);
  assert.deepEqual(
    payload?.sections?.map(section => section.id),
    ['sec-header', 'sec-skills', 'publications', 'sec-work']
  );
  assert.deepEqual(payload?.sectionOrder, ['sec-header', 'sec-skills', 'publications', 'sec-work']);
});

test('buildCanonicalExportPayload dedupes duplicate projects sections and keeps the first title', () => {
  const base = makeParsedPayload();
  const payload = buildCanonicalExportPayload({
    ...base,
    resumeData: {
      ...base.resumeData,
      projects: [
        {
          name: 'FinTech LAB Student project (Process Analysis Project)',
          technologies: [],
          highlights: [],
        },
        {
          name: 'Portfolio reporting dashboard',
          technologies: [{ name: 'Excel', skillRefId: 'skill-ref-1' }],
          highlights: [],
        },
      ],
    },
    sections: [
      {
        id: 'section-header',
        title: 'Header',
        kind: 'header',
        lines: ['Jane Doe', 'jane@example.com'],
        canonicalTarget: 'none',
      },
      {
        id: 'sec_uni_projects',
        title: 'UNIVERSITY PROJECT EXPERIENCE',
        kind: 'projects',
        lines: ['FinTech LAB Student project (Process Analysis Project)'],
        canonicalTarget: 'projects',
      },
      {
        id: 'sec_add_projects',
        title: 'ADDITIONAL PROJECT',
        kind: 'projects',
        lines: ['Portfolio reporting dashboard (Excel based)'],
        canonicalTarget: 'projects',
      },
    ],
    customSections: [],
  });

  assert.ok(payload?.sections);
  const projectSections = payload?.sections?.filter(section => section.kind === 'projects') || [];
  assert.equal(projectSections.length, 1);
  assert.equal(projectSections[0]?.id, 'sec_uni_projects');
  assert.equal(projectSections[0]?.title, 'UNIVERSITY PROJECT EXPERIENCE');
  assert.equal(projectSections[0]?.renderMode, 'canonical');
  assert.deepEqual(projectSections[0]?.lines, [
    'FinTech LAB Student project (Process Analysis Project)',
    '',
    'Portfolio reporting dashboard (Excel based)',
  ]);
  assert.deepEqual(payload?.sectionOrder, ['section-header', 'sec_uni_projects']);
});

test('buildCanonicalExportPayload returns null when no canonical parse payload exists', () => {
  const payload = buildCanonicalExportPayload(null);
  assert.equal(payload, null);
});

test('buildCanonicalExportPayload falls back to resumeData sectionOrder when parsed sections are absent', () => {
  const base = makeParsedPayload();
  const payload = buildCanonicalExportPayload({
    ...base,
    resumeData: {
      ...base.resumeData,
      sectionOrder: ['canonical-header', 'canonical-work'],
    },
    sections: [],
    customSections: [],
  });

  assert.ok(payload);
  assert.equal(payload?.sections, undefined);
  assert.deepEqual(payload?.sectionOrder, ['canonical-header', 'canonical-work']);
});

test('buildCanonicalExportPayload uses resumeData override for canonical sections', () => {
  const payload = buildCanonicalExportPayload(makeParsedPayload(), {
    resumeDataOverride: {
      ...makeParsedPayload().resumeData,
      work: [
        {
          company: 'Acme',
          position: 'Engineer',
          highlights: [
            {
              text: 'Built and scaled backend APIs',
              originalText: 'Built backend APIs',
            },
          ],
        },
      ],
      sectionOrder: [],
    },
  });

  assert.ok(payload);
  assert.equal(payload?.work?.[0]?.highlights?.[0]?.text, 'Built and scaled backend APIs');
  assert.equal(payload?.work?.[0]?.highlights?.[0]?.originalText, 'Built backend APIs');
});

test('buildSectionViewModel renders parsed sections and tracks updated lines', () => {
  const updatedText = `Jane Doe
jane@example.com

Experience
- Built and scaled backend APIs`;

  const rows = buildSectionViewModel({
    originalText: SAMPLE_RESUME_TEXT,
    updatedText,
    parsedSections: SAMPLE_PARSED_SECTIONS,
  });

  const work = rows.find(row => row.key === 'canonical-work');
  assert.ok(work);
  assert.equal(work?.changed, true);
  assert.equal(work?.updatedValue.includes('scaled backend APIs'), true);

  const custom = rows.find(row => row.key === 'custom-custom-publications');
  assert.ok(custom);
  assert.equal(custom?.kind, 'custom');
  assert.equal(custom?.hasContent, true);
});

test('buildSectionViewModel respects resumeData sectionOrder and keeps header first', () => {
  const rows = buildSectionViewModel({
    originalText: `Jane Doe
Summary
Product-focused engineer
Skills
TypeScript
Experience
- Built backend APIs`,
    updatedText: `Jane Doe
Summary
Product-focused engineer
Skills
TypeScript
Experience
- Built backend APIs`,
    parsedSections: [
      {
        id: 'sec-header',
        title: 'Header',
        kind: 'header',
        lines: ['Jane Doe'],
        canonicalTarget: 'none',
      },
      {
        id: 'sec-summary',
        title: 'Summary',
        kind: 'summary',
        lines: ['Product-focused engineer'],
        canonicalTarget: 'summary',
      },
      {
        id: 'sec-skills',
        title: 'Skills',
        kind: 'skills',
        lines: ['TypeScript'],
        canonicalTarget: 'skills',
      },
      {
        id: 'sec-work',
        title: 'Experience',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
    ],
    resumeData: {
      basics: { name: 'Jane Doe' },
      summary: 'Product-focused engineer',
      work: [{ company: 'Acme', position: 'Engineer', highlights: ['Built backend APIs'] }],
      education: [],
      projects: [],
      awards: [],
      skills: [{ name: 'TypeScript', category: 'Technical' }],
      languages: [],
      customSections: [],
      sectionOrder: [
        'canonical-work',
        'canonical-header',
        'canonical-skills',
        'unknown-key',
      ],
      versions: [],
    },
  });

  const nonEmptyRowKeys = rows.filter(row => row.hasContent).map(row => row.key);
  assert.deepEqual(nonEmptyRowKeys, [
    'canonical-header',
    'canonical-work',
    'canonical-skills',
    'canonical-summary',
  ]);
});

test('buildSectionViewModel uses canonical header fallback when parsed header is missing', () => {
  const rows = buildSectionViewModel({
    originalText: `Experience
- Built backend APIs`,
    updatedText: `Experience
- Built backend APIs`,
    parsedSections: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
    ],
    resumeData: {
      basics: {
        name: 'Jane Doe',
        title: 'Software Engineer',
        email: 'jane@example.com',
        location: {
          city: 'Belgrade',
          country: 'Serbia',
        },
      },
      summary: undefined,
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const header = rows.find(row => row.key === 'canonical-header');
  assert.ok(header);
  assert.equal(header?.originalLines.includes('Jane Doe'), true);
  assert.equal(header?.originalLines.includes('Software Engineer'), true);
  assert.equal(header?.originalLines.includes('Belgrade, Serbia'), true);
  assert.equal(header?.originalLines.includes('jane@example.com'), true);
});

test('buildSectionViewModel falls back to canonical header when parsed header contains section-heading spillover', () => {
  const rawText = `Jane Doe
Software Engineer
WORK EXPERIENCE
Acme Corp`;

  const rows = buildSectionViewModel({
    originalText: rawText,
    updatedText: rawText,
    parsedSections: [
      {
        id: 'section-header',
        title: 'Header',
        kind: 'header',
        lines: ['Jane Doe', 'Software Engineer', 'WORK EXPERIENCE', 'Acme Corp'],
        canonicalTarget: 'none',
      },
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        lines: ['Acme Corp'],
        canonicalTarget: 'work',
      },
    ],
    resumeData: {
      basics: {
        name: 'Jane Doe',
        title: 'Software Engineer',
        email: 'jane@example.com',
        phone: '+381654071575',
        location: {
          city: 'Belgrade',
          country: 'Serbia',
        },
      },
      summary: undefined,
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const header = rows.find(row => row.key === 'canonical-header');
  assert.ok(header);
  assert.equal(header?.originalLines.includes('WORK EXPERIENCE'), false);
  assert.equal(header?.updatedLines.includes('WORK EXPERIENCE'), false);
  assert.equal(header?.updatedLines.includes('jane@example.com'), true);
  assert.equal(header?.updatedLines.includes('+381654071575'), true);
});

test('buildSectionViewModel keeps parsed header lines when parsed header is short and header-like', () => {
  const parsedHeaderLines = [
    'Marko Markovic',
    'Digital Account Manager',
    'markovicm668@gmail.com',
    '+381654071575',
  ];
  const rawText = `${parsedHeaderLines.join('\n')}
Experience
Acme Corp`;

  const rows = buildSectionViewModel({
    originalText: rawText,
    updatedText: rawText,
    parsedSections: [
      {
        id: 'section-header',
        title: 'CONTACT',
        kind: 'header',
        lines: parsedHeaderLines,
        canonicalTarget: 'none',
      },
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        lines: ['Acme Corp'],
        canonicalTarget: 'work',
      },
    ],
    resumeData: {
      basics: {
        name: 'Jane Different',
        title: 'Engineer',
        email: 'different@example.com',
      },
      summary: undefined,
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const header = rows.find(row => row.key === 'canonical-header');
  assert.ok(header);
  assert.deepEqual(header?.originalLines, parsedHeaderLines);
  assert.deepEqual(header?.updatedLines, parsedHeaderLines);
  assert.equal(header?.title, 'CONTACT');
});

test('buildSectionViewModel keeps parsed section lines when both parsed and canonical data exist', () => {
  const parsedSummaryLine = 'Parsed summary from section block';
  const rows = buildSectionViewModel({
    originalText: `Professional Summary
${parsedSummaryLine}`,
    updatedText: `Professional Summary
${parsedSummaryLine}`,
    parsedSections: [
      {
        id: 'section-summary',
        title: 'Professional Summary',
        kind: 'summary',
        lines: [parsedSummaryLine],
        canonicalTarget: 'summary',
      },
    ],
    resumeData: {
      basics: undefined,
      summary: 'Canonical summary that should not override parsed line.',
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const summary = rows.find(row => row.key === 'canonical-summary');
  assert.ok(summary);
  assert.equal(summary?.originalValue, parsedSummaryLine);
});

test('buildSectionViewModel uses canonical summary fallback when parsed summary is missing', () => {
  const rows = buildSectionViewModel({
    originalText: `Experience
- Built backend APIs`,
    updatedText: `Experience
- Built backend APIs`,
    parsedSections: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
    ],
    resumeData: {
      basics: undefined,
      summary: 'Canonical summary fallback',
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const summary = rows.find(row => row.key === 'canonical-summary');
  assert.ok(summary);
  assert.equal(summary?.originalValue, 'Canonical summary fallback');
  assert.equal(summary?.updatedValue, 'Canonical summary fallback');
});

test('buildSectionViewModel prefers canonical updated summary when parsed summary exists', () => {
  const parsedSummaryLine = 'Parsed summary from section block';
  const editedCanonicalSummary = 'Edited summary saved to canonical resume data';

  const rows = buildSectionViewModel({
    originalText: `Professional Summary
${parsedSummaryLine}`,
    updatedText: `Professional Summary
${parsedSummaryLine}`,
    parsedSections: [
      {
        id: 'section-summary',
        title: 'Professional Summary',
        kind: 'summary',
        lines: [parsedSummaryLine],
        canonicalTarget: 'summary',
      },
    ],
    resumeData: {
      basics: undefined,
      summary: editedCanonicalSummary,
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const summary = rows.find(row => row.key === 'canonical-summary');
  assert.ok(summary);
  assert.equal(summary?.originalValue, parsedSummaryLine);
  assert.equal(summary?.updatedValue, editedCanonicalSummary);
});

test('buildSectionViewModel prefers canonical section content and avoids multi-column spillover', () => {
  const rawText = `NIKOLA STANOJEVIC
PROFILE
Fast learner and good at acquiring new knowledges.
EXPERTISE
WORK EXPERIENCE
Creativity
Responsibility
Without work experience
LANGUAGES
English - Professional working proficiency
EDUCATION
ELSE
University of Belgrade, Faculty of Organizational Sciences 2020 - 2024
Attended to Startit to Belgrade Java beginner course in 2018
SKILL
Fifth Belgrade Gymnasium 2016 - 2020
Communicative
Learning
80%
70%
75%
90%`;

  const parsedSections: ResumeSectionBlockV2[] = [
    {
      id: 'sec_header',
      title: 'Header',
      kind: 'header',
      lines: ['NIKOLA STANOJEVIC'],
      canonicalTarget: 'none',
    },
    {
      id: 'sec_profile',
      title: 'PROFILE',
      kind: 'summary',
      lines: ['Fast learner and good at acquiring new knowledges.'],
      canonicalTarget: 'summary',
    },
    {
      id: 'sec_expertise',
      title: 'EXPERTISE',
      kind: 'skills',
      lines: ['Creativity', 'Responsibility'],
      canonicalTarget: 'skills',
    },
    {
      id: 'sec_work',
      title: 'WORK EXPERIENCE',
      kind: 'work',
      lines: ['Without work experience'],
      canonicalTarget: 'work',
    },
    {
      id: 'sec_lang',
      title: 'LANGUAGES',
      kind: 'languages',
      lines: ['English - Professional working proficiency'],
      canonicalTarget: 'languages',
    },
    {
      id: 'sec_edu',
      title: 'EDUCATION',
      kind: 'education',
      lines: ['University of Belgrade, Faculty of Organizational Sciences 2020 - 2024'],
      canonicalTarget: 'education',
    },
    {
      id: 'sec_else',
      title: 'ELSE',
      kind: 'custom',
      lines: ['Attended to Startit to Belgrade Java beginner course in 2018'],
      canonicalTarget: 'none',
    },
    {
      id: 'sec_skill',
      title: 'SKILL',
      kind: 'skills',
      lines: [
        'Fifth Belgrade Gymnasium 2016 - 2020',
        'Communicative',
        'Learning',
        '80%',
        '70%',
        '75%',
        '90%',
      ],
      canonicalTarget: 'skills',
    },
  ];

  const rows = buildSectionViewModel({
    originalText: rawText,
    updatedText: rawText,
    parsedSections,
    resumeData: {
      basics: {
        name: 'NIKOLA STANOJEVIC',
      },
      summary: 'Fast learner and good at acquiring new knowledges.',
      work: [],
      projects: [],
      awards: [],
      skills: [
        { name: 'Creativity', category: 'soft' },
        { name: 'Responsibility', category: 'soft' },
        { name: 'Communicative', category: 'soft' },
        { name: 'Learning', category: 'soft' },
      ],
      education: [
        {
          institution: 'University of Belgrade, Faculty of Organizational Sciences',
          startDate: '2020',
          endDate: '2024',
          degree: "Bachelor's degree",
          area: 'Information systems and technologies',
          honors: [],
        },
        {
          institution: 'Fifth Belgrade Gymnasium',
          startDate: '2016',
          endDate: '2020',
          degree: 'High school',
          area: 'Natural sciences and mathematics',
          honors: [],
        },
      ],
      languages: [{ language: 'English', fluency: 'Professional working proficiency' }],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const work = rows.find(row => row.key === 'canonical-work');
  assert.ok(work);
  assert.equal(work?.changed, false);
  assert.deepEqual(work?.updatedLines, ['Without work experience']);

  const skills = rows.find(row => row.key === 'canonical-skills');
  assert.ok(skills);
  assert.equal(skills?.updatedValue.includes('80%'), false);
  assert.equal(skills?.updatedValue.includes('70%'), false);
  assert.equal(skills?.updatedValue.includes('soft:'), true);
  assert.equal(skills?.updatedValue.includes('Communicative'), true);

  const education = rows.find(row => row.key === 'canonical-education');
  assert.ok(education);
  assert.equal(education?.updatedValue.includes('Fifth Belgrade Gymnasium'), true);
});

test('buildSectionViewModel keeps custom section updated lines from parsed section blocks', () => {
  const parsedSections: ResumeSectionBlockV2[] = [
    {
      id: 'sec_edu',
      title: 'EDUCATION',
      kind: 'education',
      lines: ['University of Belgrade, Faculty of Organizational Sciences 2020 - 2024'],
      canonicalTarget: 'education',
    },
    {
      id: 'sec_else',
      title: 'ELSE',
      kind: 'custom',
      lines: ['Attended to Startit to Belgrade Java beginner course in 2018'],
      canonicalTarget: 'none',
    },
  ];

  const rawText = `EDUCATION
ELSE
University of Belgrade, Faculty of Organizational Sciences 2020 - 2024
Attended to Startit to Belgrade Java beginner course in 2018`;

  const rows = buildSectionViewModel({
    originalText: rawText,
    updatedText: rawText,
    parsedSections,
    resumeData: {
      basics: undefined,
      summary: undefined,
      work: [],
      education: [],
      projects: [],
      awards: [],
      skills: [],
      languages: [],
      customSections: [],
      sectionOrder: [],
      versions: [],
    },
  });

  const custom = rows.find(row => row.key === 'custom-sec_else');
  assert.ok(custom);
  assert.deepEqual(custom?.originalLines, ['Attended to Startit to Belgrade Java beginner course in 2018']);
  assert.deepEqual(custom?.updatedLines, ['Attended to Startit to Belgrade Java beginner course in 2018']);
  assert.equal(custom?.updatedValue.includes('University of Belgrade'), false);
});

test('buildSectionViewModel reflects work bullet changes when resume data is patched before mapping', () => {
  const baseResumeData = {
    basics: { name: 'Jane Doe' },
    summary: undefined,
    work: [
      {
        company: 'Acme',
        position: 'Engineer',
        highlights: [{ text: 'Built backend APIs', originalText: 'Built backend APIs' }],
      },
    ],
    education: [],
    projects: [],
    awards: [],
    skills: [],
    languages: [],
    customSections: [],
    sectionOrder: [],
    versions: [],
  };

  const patchedResumeData = applyBulletChangesToResumeData(
    baseResumeData,
    [
      {
        section: 'experience',
        type: 'modified',
        original: 'Built backend APIs',
        improved: 'Built and scaled backend APIs',
      },
    ],
    'user'
  );

  const rows = buildSectionViewModel({
    originalText: `Experience
- Built backend APIs`,
    updatedText: `Experience
- Built and scaled backend APIs`,
    parsedSections: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        lines: ['- Built backend APIs'],
        canonicalTarget: 'work',
      },
    ],
    resumeData: patchedResumeData,
  });

  const work = rows.find(row => row.key === 'canonical-work');
  assert.ok(work);
  assert.equal(work?.originalValue.includes('Built backend APIs'), true);
  assert.equal(work?.updatedValue.includes('Built and scaled backend APIs'), true);
});
