import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiParsedMetaV2, ResumeDataV2 } from '@resume-scanner/resume-contract';
import {
  __private__,
  applyInlineEditToParsedMeta,
  applyInlineEditToResumeData,
  parseResumeInlineEntryItemKey,
  parseResumeInlineItemTarget,
  resumeInlineEditTargetKey,
} from './inline-edits.ts';

function makeResumeData(): ResumeDataV2 {
  return {
    id: 'resume-1',
    metadata: {},
    basics: {
      name: 'Jane Doe',
      title: 'Engineer',
      location: { city: 'Belgrade', country: 'Serbia' },
      profiles: [{ id: 'li', network: 'LinkedIn', url: 'linkedin.com/in/jane' }],
    },
    summary: 'Product-minded engineer.',
    work: [
      {
        id: 'work-1',
        company: 'Acme',
        position: 'Engineer',
        startDate: '2022',
        endDate: '2024',
        location: { city: 'Belgrade', country: 'Serbia' },
        highlights: [{ id: 'wh-1', text: 'Built APIs', originalText: 'Built APIs' }],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Project One',
        role: 'Owner',
        description: 'Desc',
        technologies: [
          { skillRefId: 'tech-1', name: 'React' },
          { skillRefId: 'tech-2', name: 'Node.js' },
        ],
        highlights: [{ id: 'ph-1', text: 'Launched MVP', originalText: 'Launched MVP' }],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University',
        degree: 'BSc',
        area: 'CS',
        startDate: '2018',
        endDate: '2022',
        location: { city: 'Novi Sad', country: 'Serbia' },
        gpa: '9.5',
        honors: ['Dean list', 'Scholarship'],
      },
    ],
    awards: [{ id: 'award-1', title: 'Award', issuer: 'Org', date: '2024', summary: 'Nice award' }],
    skills: [
      { id: 'skill-1', name: 'TypeScript', category: 'Technical' },
      { id: 'skill-2', name: 'React', category: 'Technical' },
      { id: 'skill-3', name: 'Communication', category: 'Soft Skills' },
    ],
    languages: [{ id: 'lang-1', language: 'English', fluency: 'Fluent' }],
    customSections: [
      {
        id: 'custom-publications',
        title: 'Publications',
        items: [{ id: 'pub-1', text: 'Paper A' }],
      },
    ],
    sectionOrder: [],
    versions: [],
  };
}

test('parses direct item and entry keys into inline edit targets', () => {
  const itemTarget = parseResumeInlineItemTarget('item:projects:description:proj-1');
  assert.deepEqual(itemTarget, { kind: 'item', itemKey: 'item:projects:description:proj-1' });

  const entryRef = parseResumeInlineEntryItemKey('item:education:entry:edu-1');
  assert.deepEqual(entryRef, {
    section: 'education',
    entryItemKey: 'item:education:entry:edu-1',
    entryToken: 'edu-1',
  });

  assert.equal(
    resumeInlineEditTargetKey({ kind: 'skills-category', category: 'Technical' }),
    'skills-category:Technical'
  );
});

test('private parsers handle composite line formats', () => {
  assert.deepEqual(__private__.parseHeadingPair('Engineer - Acme'), {
    primary: 'Engineer',
    secondary: 'Acme',
  });
  assert.deepEqual(__private__.parseDateRange('2023 - Present'), {
    startDate: '2023',
    endDate: undefined,
    isCurrent: true,
  });
  assert.deepEqual(__private__.parseLocationLine('Belgrade, Central Serbia, Serbia'), {
    city: 'Belgrade',
    region: 'Central Serbia',
    country: 'Serbia',
    address: undefined,
    postalCode: undefined,
    countryCode: undefined,
  });
  assert.deepEqual(__private__.parseLanguageLine('English - Native'), {
    language: 'English',
    fluency: 'Native',
  });
});

test('applyInlineEditToResumeData updates canonical fields across sections', () => {
  let resume = makeResumeData();

  resume = applyInlineEditToResumeData(resume, {
    kind: 'item',
    itemKey: 'item:header:profile:li',
  }, 'LinkedIn: https://linkedin.com/in/jane-doe');
  assert.equal(resume.basics?.profiles?.[0]?.network, 'LinkedIn');
  assert.equal(resume.basics?.profiles?.[0]?.url, 'https://linkedin.com/in/jane-doe');

  resume = applyInlineEditToResumeData(resume, {
    kind: 'entry-slot',
    section: 'work',
    entryItemKey: 'item:work:entry:work-1',
    slot: 'date',
  }, '2024 - Present');
  assert.equal(resume.work[0]?.startDate, '2024');
  assert.equal(resume.work[0]?.endDate, undefined);
  assert.equal(resume.work[0]?.isCurrent, true);

  resume = applyInlineEditToResumeData(resume, {
    kind: 'entry-slot',
    section: 'projects',
    entryItemKey: 'item:projects:entry:proj-1',
    slot: 'technologies',
  }, 'Technologies: TypeScript, Next.js');
  assert.deepEqual(resume.projects[0]?.technologies.map(tech => tech.name), ['TypeScript', 'Next.js']);
  assert.equal(resume.projects[0]?.technologies[0]?.skillRefId, 'tech-1');

  resume = applyInlineEditToResumeData(resume, {
    kind: 'entry-slot',
    section: 'education',
    entryItemKey: 'item:education:entry:edu-1',
    slot: 'honor',
    index: 0,
  }, 'Best Student');
  assert.equal(resume.education[0]?.honors?.[0], 'Best Student');

  resume = applyInlineEditToResumeData(resume, {
    kind: 'skills-category',
    category: 'Technical',
  }, 'Engineering');
  assert.equal(resume.skills[0]?.category, 'Engineering');
  assert.equal(resume.skills[1]?.category, 'Engineering');
  assert.equal(resume.skills[2]?.category, 'Soft Skills');
});

test('applyInlineEditToParsedMeta patches custom section lines only and blank edits are ignored', () => {
  const parsedMeta: AiParsedMetaV2 = {
    version: '2',
    notes: [],
    sections: [
      {
        id: 'section-work',
        title: 'Experience',
        kind: 'work',
        lines: ['Built APIs'],
        canonicalTarget: 'work',
      },
    ],
    customSections: [
      {
        id: 'custom-publications',
        title: 'Publications',
        kind: 'custom',
        lines: ['Paper A'],
        canonicalTarget: 'none',
      },
    ],
  };

  const next = applyInlineEditToParsedMeta(parsedMeta, {
    kind: 'item',
    itemKey: 'item:custom:custom-publications:line:0',
  }, 'Paper B');
  assert.equal(next?.customSections?.[0]?.lines?.[0], 'Paper B');
  assert.equal(next?.sections?.[0]?.lines?.[0], 'Built APIs');

  const resume = makeResumeData();
  const unchanged = applyInlineEditToResumeData(resume, {
    kind: 'item',
    itemKey: 'item:summary',
  }, '   ');
  assert.equal(unchanged, resume);
});
