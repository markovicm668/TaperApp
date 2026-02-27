import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResumeExportSection } from '../types.ts';
import {
  applySectionOrderToItems,
  getSectionOrderKeyForExportSection,
  normalizeSectionOrderKeys,
} from './section-order.ts';

test('normalizeSectionOrderKeys drops unknown keys and duplicates', () => {
  const available = [
    'canonical-header',
    'canonical-summary',
    'canonical-work',
    'custom-publications',
  ];

  const normalized = normalizeSectionOrderKeys(available, [
    'canonical-work',
    'canonical-work',
    'unknown-key',
    'custom-publications',
  ]);

  assert.deepEqual(normalized, [
    'canonical-header',
    'canonical-work',
    'custom-publications',
    'canonical-summary',
  ]);
});

test('normalizeSectionOrderKeys keeps header first even if requested later', () => {
  const available = ['canonical-header', 'canonical-summary', 'canonical-work'];

  const normalized = normalizeSectionOrderKeys(available, [
    'canonical-work',
    'canonical-header',
    'canonical-summary',
  ]);

  assert.deepEqual(normalized, [
    'canonical-header',
    'canonical-work',
    'canonical-summary',
  ]);
});

test('normalizeSectionOrderKeys appends missing keys using fallback canonical order then available order', () => {
  const available = [
    'canonical-header',
    'custom-publications',
    'canonical-skills',
    'canonical-work',
    'custom-volunteering',
  ];

  const normalized = normalizeSectionOrderKeys(available, ['canonical-skills']);

  assert.deepEqual(normalized, [
    'canonical-header',
    'canonical-skills',
    'canonical-work',
    'custom-publications',
    'custom-volunteering',
  ]);
});

test('applySectionOrderToItems preserves custom relative order when not explicitly reordered', () => {
  const items = [
    { key: 'canonical-header' },
    { key: 'custom-publications' },
    { key: 'custom-volunteering' },
    { key: 'canonical-work' },
  ];

  const ordered = applySectionOrderToItems(items, item => item.key, ['canonical-work']);

  assert.deepEqual(
    ordered.map(item => item.key),
    ['canonical-header', 'canonical-work', 'custom-publications', 'custom-volunteering']
  );
});

test('getSectionOrderKeyForExportSection maps canonical and custom sections to UI order keys', () => {
  const canonical: ResumeExportSection = {
    id: 'sec-work',
    title: 'Experience',
    kind: 'work',
    lines: [],
  };
  const custom: ResumeExportSection = {
    id: 'sec-custom',
    title: 'Publications',
    kind: 'custom',
    lines: [],
  };

  assert.equal(getSectionOrderKeyForExportSection(canonical), 'canonical-work');
  assert.equal(getSectionOrderKeyForExportSection(custom), 'custom-sec-custom');
});
