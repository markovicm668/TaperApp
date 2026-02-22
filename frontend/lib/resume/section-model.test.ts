import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiParsedResumePayloadV2, ResumeSectionBlockV2 } from '@resume-scanner/resume-contract';
import {
  buildCanonicalExportPayload,
  buildSectionViewModel,
} from './mappers.ts';

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
