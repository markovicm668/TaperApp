import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResumePdfPayload } from '../types.ts';
import {
  buildPdfSelectionModel,
  filterResumePdfPayloadForSelection,
  getPdfItemCheckState,
  getPdfSectionCheckState,
  normalizePdfSelectionOverrides,
  togglePdfSelectionItem,
  togglePdfSelectionSection,
  type PdfSelectionOverrides,
} from './pdf-selection.ts';

function makePayload(): ResumePdfPayload {
  return {
    id: 'resume-1',
    metadata: {
      lastModified: '2026-02-23T00:00:00.000Z',
    },
    basics: {
      name: 'Jane Doe',
      title: 'Engineer',
      email: 'jane@example.com',
      phone: '+1 555 555 5555',
      location: { city: 'Belgrade', country: 'Serbia' },
      profiles: [
        { id: 'li', network: 'LinkedIn', url: 'linkedin.com/in/jane' },
        { id: 'gh', network: 'GitHub', url: 'github.com/jane' },
      ],
    },
    summary: 'Product-minded engineer.',
    work: [
      {
        id: 'work-1',
        company: 'Acme',
        position: 'Engineer',
        highlights: [
          { id: 'wh-1', text: 'Built backend APIs', originalText: 'Built backend APIs' },
          { id: 'wh-2', text: 'Improved reliability', originalText: 'Improved reliability' },
        ],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Project One',
        technologies: [],
        highlights: [{ id: 'ph-1', text: 'Launched MVP', originalText: 'Launched MVP' }],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University',
        degree: 'BSc',
        area: 'CS',
        honors: [],
      },
    ],
    awards: [{ id: 'award-1', title: 'Award', issuer: 'Org' }],
    skills: [
      { id: 'skill-1', name: 'TypeScript', category: 'Technical' },
      { id: 'skill-2', name: 'React', category: 'Technical' },
    ],
    languages: [
      { id: 'lang-1', language: 'English', fluency: 'Fluent' },
      { id: 'lang-2', language: 'German', fluency: 'Basic' },
    ],
    customSections: [],
    sectionOrder: [
      'sec-header',
      'sec-summary',
      'sec-work',
      'sec-projects',
      'sec-skills',
      'sec-education',
      'sec-awards',
      'sec-languages',
      'sec-custom',
    ],
    versions: [],
    sections: [
      { id: 'sec-header', title: 'Header', kind: 'header', lines: [], renderMode: 'canonical' },
      { id: 'sec-summary', title: 'Summary', kind: 'summary', lines: ['Product-minded engineer.'], renderMode: 'canonical' },
      { id: 'sec-work', title: 'Experience', kind: 'work', lines: ['Engineer - Acme'], renderMode: 'canonical' },
      { id: 'sec-projects', title: 'Projects', kind: 'projects', lines: ['Project One'], renderMode: 'canonical' },
      { id: 'sec-skills', title: 'Skills', kind: 'skills', lines: ['Technical:', 'TypeScript', 'React'], renderMode: 'canonical' },
      { id: 'sec-education', title: 'Education', kind: 'education', lines: ['University'], renderMode: 'canonical' },
      { id: 'sec-awards', title: 'Achievements', kind: 'awards', lines: ['Award - Org'], renderMode: 'canonical' },
      { id: 'sec-languages', title: 'Languages', kind: 'languages', lines: ['English - Fluent', 'German - Basic'], renderMode: 'canonical' },
      { id: 'sec-custom', title: 'ELSE', kind: 'custom', lines: ['Line A', 'Line B'], renderMode: 'lines' },
    ],
  };
}

test('section toggle cascades to descendants and supports indeterminate state', () => {
  const model = buildPdfSelectionModel(makePayload());
  let overrides: PdfSelectionOverrides = {};

  overrides = togglePdfSelectionSection(model, overrides, 'canonical-work', false);
  assert.equal(getPdfSectionCheckState(model, overrides, 'canonical-work'), 'unchecked');
  assert.equal(getPdfItemCheckState(model, overrides, 'item:work:entry:work-1'), 'unchecked');
  assert.equal(getPdfItemCheckState(model, overrides, 'item:work:highlight:work-1:wh-1'), 'unchecked');

  overrides = togglePdfSelectionItem(model, overrides, 'item:work:highlight:work-1:wh-1', true);
  assert.equal(getPdfSectionCheckState(model, overrides, 'canonical-work'), 'indeterminate');
  assert.equal(getPdfItemCheckState(model, overrides, 'item:work:entry:work-1'), 'indeterminate');
});

test('work entry toggle cascades to highlights', () => {
  const model = buildPdfSelectionModel(makePayload());
  const overrides = togglePdfSelectionItem(model, {}, 'item:work:entry:work-1', false);

  assert.equal(getPdfItemCheckState(model, overrides, 'item:work:entry:work-1'), 'unchecked');
  assert.equal(getPdfItemCheckState(model, overrides, 'item:work:highlight:work-1:wh-1'), 'unchecked');
  assert.equal(getPdfItemCheckState(model, overrides, 'item:work:highlight:work-1:wh-2'), 'unchecked');
});

test('filtering removes single highlight and keeps rest of work entry', () => {
  const payload = makePayload();
  const model = buildPdfSelectionModel(payload);
  const overrides = togglePdfSelectionItem(model, {}, 'item:work:highlight:work-1:wh-2', false);

  const filtered = filterResumePdfPayloadForSelection(payload, model, overrides);
  assert.equal(filtered.work.length, 1);
  assert.equal(filtered.work[0]?.highlights.length, 1);
  assert.equal(filtered.work[0]?.highlights[0]?.id, 'wh-1');
});

test('project entry toggle cascades to highlights', () => {
  const model = buildPdfSelectionModel(makePayload());
  const overrides = togglePdfSelectionItem(model, {}, 'item:projects:entry:proj-1', false);

  assert.equal(getPdfItemCheckState(model, overrides, 'item:projects:entry:proj-1'), 'unchecked');
  assert.equal(getPdfItemCheckState(model, overrides, 'item:projects:highlight:proj-1:ph-1'), 'unchecked');
});

test('filtering removes unchecked header slot, summary, custom line, and section order entries', () => {
  const payload = makePayload();
  const model = buildPdfSelectionModel(payload);
  let overrides: PdfSelectionOverrides = {};

  overrides = togglePdfSelectionItem(model, overrides, 'item:header:email', false);
  overrides = togglePdfSelectionItem(model, overrides, 'item:summary', false);
  overrides = togglePdfSelectionItem(model, overrides, 'item:custom:sec-custom:line:1', false);
  overrides = togglePdfSelectionSection(model, overrides, 'canonical-awards', false);

  const filtered = filterResumePdfPayloadForSelection(payload, model, overrides);
  assert.equal(filtered.basics?.email, undefined);
  assert.equal(filtered.summary, undefined);
  assert.deepEqual(filtered.sections?.find(section => section.id === 'sec-custom')?.lines, ['Line A']);
  assert.equal(filtered.sections?.some(section => section.id === 'sec-awards'), false);
  assert.equal(filtered.sectionOrder.includes('sec-awards'), false);
});

test('filtering removes custom section when all line items are unchecked', () => {
  const payload = makePayload();
  const model = buildPdfSelectionModel(payload);
  let overrides: PdfSelectionOverrides = {};
  overrides = togglePdfSelectionItem(model, overrides, 'item:custom:sec-custom:line:0', false);
  overrides = togglePdfSelectionItem(model, overrides, 'item:custom:sec-custom:line:1', false);

  const filtered = filterResumePdfPayloadForSelection(payload, model, overrides);
  assert.equal(filtered.sections?.some(section => section.id === 'sec-custom'), false);
  assert.equal(filtered.sectionOrder.includes('sec-custom'), false);
});

test('normalize overrides drops unknown keys', () => {
  const model = buildPdfSelectionModel(makePayload());
  const overrides = normalizePdfSelectionOverrides(model, {
    'canonical-work': false,
    'item:work:highlight:work-1:wh-1': false,
    'unknown:key': false,
  });

  assert.equal(overrides['canonical-work'], false);
  assert.equal(overrides['item:work:highlight:work-1:wh-1'], false);
  assert.equal(Object.hasOwn(overrides, 'unknown:key'), false);
});
