import type { ResumeLocationV2, ResumeProfileV2 } from '@resume-scanner/resume-contract';
import type { ResumeExportSection, ResumePdfPayload } from '../types';
import { nonEmpty, normalizeMatchText, normalizeWhitespace, type CanonicalSectionKind } from './normalize';

type TriState = 'checked' | 'unchecked' | 'indeterminate';

export type PdfSelectionItemKind =
  | 'header-slot'
  | 'summary'
  | 'work-entry'
  | 'work-highlight'
  | 'project-entry'
  | 'project-highlight'
  | 'education-entry'
  | 'award-entry'
  | 'skill'
  | 'language'
  | 'custom-line';

export type PdfSelectionOverrides = Record<string, false>;

export interface PdfSelectableItem {
  key: string;
  sectionKey: string;
  kind: PdfSelectionItemKind;
  label?: string;
  category?: string;
  parentKey?: string;
  childKeys: string[];
  matchTexts?: string[];
  defaultUnchecked?: boolean;
}

export interface PdfSelectableSection {
  key: string;
  id?: string;
  kind: ResumeExportSection['kind'];
  title: string;
  itemKeys: string[];
}

export interface PdfSelectionModel {
  sections: Record<string, PdfSelectableSection>;
  sectionOrder: string[];
  items: Record<string, PdfSelectableItem>;
  keySet: Set<string>;
}

const CANONICAL_SECTION_TITLES: Record<CanonicalSectionKind, string> = {
  header: 'Header',
  summary: 'Summary',
  work: 'Professional Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  awards: 'Achievements',
  languages: 'Languages',
};

function formatLocation(location: ResumeLocationV2 | undefined): string | undefined {
  if (!location) return undefined;
  const primary = [nonEmpty(location.city), nonEmpty(location.region), nonEmpty(location.country)].filter(Boolean);
  if (primary.length) return primary.join(', ');
  const secondary = [
    nonEmpty(location.address),
    nonEmpty(location.postalCode),
    nonEmpty(location.countryCode),
  ].filter(Boolean);
  return secondary.length ? secondary.join(', ') : undefined;
}

function formatHeaderProfile(profile: ResumeProfileV2 | undefined): string | undefined {
  if (!profile) return undefined;
  const network = nonEmpty(profile.network);
  const username = nonEmpty(profile.username);
  const url = nonEmpty(profile.url);
  const label = network || username;
  if (label && url) return `${label}: ${url}`;
  return url || label;
}

function canonicalSectionKey(kind: CanonicalSectionKind): string {
  return `canonical-${kind}`;
}

function sectionKeyFromExportSection(section: ResumeExportSection): string {
  if (section.kind === 'custom') return `custom-${section.id}`;
  return canonicalSectionKey(section.kind as CanonicalSectionKind);
}

function workEntryKey(entry: ResumePdfPayload['work'][number], index: number): string {
  return `item:work:entry:${entry?.id || index}`;
}

function workHighlightKey(
  entry: ResumePdfPayload['work'][number],
  highlight: NonNullable<ResumePdfPayload['work'][number]>['highlights'][number],
  entryIndex: number,
  highlightIndex: number
): string {
  return `item:work:highlight:${entry?.id || entryIndex}:${highlight?.id || highlightIndex}`;
}

function projectEntryKey(entry: ResumePdfPayload['projects'][number], index: number): string {
  return `item:projects:entry:${entry?.id || index}`;
}

function projectHighlightKey(
  entry: ResumePdfPayload['projects'][number],
  highlight: NonNullable<ResumePdfPayload['projects'][number]>['highlights'][number],
  entryIndex: number,
  highlightIndex: number
): string {
  return `item:projects:highlight:${entry?.id || entryIndex}:${highlight?.id || highlightIndex}`;
}

function educationEntryKey(entry: ResumePdfPayload['education'][number], index: number): string {
  return `item:education:entry:${entry?.id || index}`;
}

function awardEntryKey(entry: ResumePdfPayload['awards'][number], index: number): string {
  return `item:awards:entry:${entry?.id || index}`;
}

function skillKey(skill: ResumePdfPayload['skills'][number], index: number): string {
  return `item:skills:${skill?.id || index}`;
}

function languageKey(language: ResumePdfPayload['languages'][number], index: number): string {
  return `item:languages:${language?.id || index}`;
}

function customLineKey(sectionId: string, lineIndex: number): string {
  return `item:custom:${sectionId}:line:${lineIndex}`;
}

function cloneOverrides(overrides: PdfSelectionOverrides): PdfSelectionOverrides {
  return { ...overrides };
}

function isRawKeyChecked(overrides: PdfSelectionOverrides, key: string): boolean {
  return overrides[key] !== false;
}

function addSection(
  model: PdfSelectionModel,
  section: PdfSelectableSection
): PdfSelectableSection {
  const existing = model.sections[section.key];
  if (existing) return existing;
  model.sections[section.key] = section;
  model.sectionOrder.push(section.key);
  model.keySet.add(section.key);
  return section;
}

function addItem(model: PdfSelectionModel, item: PdfSelectableItem): PdfSelectableItem {
  if (model.items[item.key]) return model.items[item.key];
  model.items[item.key] = item;
  model.keySet.add(item.key);
  const section = model.sections[item.sectionKey];
  if (section) section.itemKeys.push(item.key);
  if (item.parentKey) {
    const parent = model.items[item.parentKey];
    if (parent && !parent.childKeys.includes(item.key)) parent.childKeys.push(item.key);
  }
  return item;
}

function makeEmptyModel(): PdfSelectionModel {
  return {
    sections: {},
    sectionOrder: [],
    items: {},
    keySet: new Set<string>(),
  };
}

function getHeaderSlotDisplayValues(payload: ResumePdfPayload): Array<{ key: string; label: string }> {
  const basics = payload.basics;
  if (!basics) return [];

  const values: Array<{ key: string; label: string }> = [];
  const name = nonEmpty(basics.name);
  const title = nonEmpty(basics.title) || nonEmpty(basics.label);
  const location = formatLocation(basics.location);
  const phone = nonEmpty(basics.phone);
  const email = nonEmpty(basics.email);
  const url = nonEmpty(basics.url);

  if (name) values.push({ key: 'item:header:name', label: name });
  if (title) values.push({ key: 'item:header:title', label: title });
  if (location) values.push({ key: 'item:header:location', label: location });
  if (phone) values.push({ key: 'item:header:phone', label: phone });
  if (email) values.push({ key: 'item:header:email', label: email });
  if (url) values.push({ key: 'item:header:url', label: url });

  const profiles = Array.isArray(basics.profiles) ? basics.profiles : [];
  profiles.forEach((profile, index) => {
    const label = formatHeaderProfile(profile);
    if (!label) return;
    values.push({ key: `item:header:profile:${profile?.id || index}`, label });
  });

  return values;
}

function buildHighlightMatchTexts(
  highlight: { text?: string; originalText?: string } | undefined
): string[] {
  const values = [nonEmpty(highlight?.text), nonEmpty(highlight?.originalText)].filter(Boolean) as string[];
  const deduped: string[] = [];
  const seen = new Set<string>();
  values.forEach(value => {
    const key = normalizeMatchText(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(value);
  });
  return deduped;
}

function buildEntryLabel(parts: Array<string | undefined>, fallback: string): string {
  const filtered = parts.filter(Boolean) as string[];
  return filtered.length ? filtered.join(' - ') : fallback;
}

function ensureCanonicalSections(model: PdfSelectionModel, payload: ResumePdfPayload): void {
  const titleByKind: Partial<Record<CanonicalSectionKind, string>> = {};
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  sections.forEach(section => {
    if (section.kind === 'custom') return;
    const kind = section.kind as CanonicalSectionKind;
    if (!titleByKind[kind]) {
      titleByKind[kind] = nonEmpty(section.title) || CANONICAL_SECTION_TITLES[kind];
    }
  });

  (Object.keys(CANONICAL_SECTION_TITLES) as CanonicalSectionKind[]).forEach(kind => {
    addSection(model, {
      key: canonicalSectionKey(kind),
      kind,
      title: titleByKind[kind] || CANONICAL_SECTION_TITLES[kind],
      itemKeys: [],
    });
  });

  sections.forEach(section => {
    if (section.kind !== 'custom') return;
    addSection(model, {
      key: sectionKeyFromExportSection(section),
      id: section.id,
      kind: 'custom',
      title: nonEmpty(section.title) || 'Custom',
      itemKeys: [],
    });
  });
}

export function buildPdfSelectionModel(payload: ResumePdfPayload): PdfSelectionModel {
  const model = makeEmptyModel();
  ensureCanonicalSections(model, payload);

  const headerSectionKey = canonicalSectionKey('header');
  getHeaderSlotDisplayValues(payload).forEach(slot => {
    addItem(model, {
      key: slot.key,
      sectionKey: headerSectionKey,
      kind: 'header-slot',
      label: slot.label,
      childKeys: [],
      matchTexts: [slot.label],
    });
  });

  const summaryText = nonEmpty(payload.summary);
  if (summaryText) {
    addItem(model, {
      key: 'item:summary',
      sectionKey: canonicalSectionKey('summary'),
      kind: 'summary',
      label: summaryText,
      childKeys: [],
      matchTexts: [summaryText],
    });
  }

  (Array.isArray(payload.work) ? payload.work : []).forEach((entry, entryIndex) => {
    const entryKey = workEntryKey(entry, entryIndex);
    addItem(model, {
      key: entryKey,
      sectionKey: canonicalSectionKey('work'),
      kind: 'work-entry',
      label: buildEntryLabel([nonEmpty(entry?.position), nonEmpty(entry?.company)], `Work ${entryIndex + 1}`),
      childKeys: [],
    });

    (Array.isArray(entry?.highlights) ? entry.highlights : []).forEach((highlight, highlightIndex) => {
      const texts = buildHighlightMatchTexts(highlight);
      addItem(model, {
        key: workHighlightKey(entry, highlight, entryIndex, highlightIndex),
        sectionKey: canonicalSectionKey('work'),
        kind: 'work-highlight',
        parentKey: entryKey,
        label: texts[0],
        childKeys: [],
        matchTexts: texts,
      });
    });
  });

  (Array.isArray(payload.projects) ? payload.projects : []).forEach((entry, entryIndex) => {
    const entryKey = projectEntryKey(entry, entryIndex);
    addItem(model, {
      key: entryKey,
      sectionKey: canonicalSectionKey('projects'),
      kind: 'project-entry',
      label: buildEntryLabel([nonEmpty(entry?.name), nonEmpty(entry?.role)], `Project ${entryIndex + 1}`),
      childKeys: [],
    });

    (Array.isArray(entry?.highlights) ? entry.highlights : []).forEach((highlight, highlightIndex) => {
      const texts = buildHighlightMatchTexts(highlight);
      addItem(model, {
        key: projectHighlightKey(entry, highlight, entryIndex, highlightIndex),
        sectionKey: canonicalSectionKey('projects'),
        kind: 'project-highlight',
        parentKey: entryKey,
        label: texts[0],
        childKeys: [],
        matchTexts: texts,
      });
    });
  });

  (Array.isArray(payload.education) ? payload.education : []).forEach((entry, entryIndex) => {
    addItem(model, {
      key: educationEntryKey(entry, entryIndex),
      sectionKey: canonicalSectionKey('education'),
      kind: 'education-entry',
      label: nonEmpty(entry?.institution) || nonEmpty(entry?.degree) || `Education ${entryIndex + 1}`,
      childKeys: [],
    });
  });

  (Array.isArray(payload.awards) ? payload.awards : []).forEach((entry, entryIndex) => {
    addItem(model, {
      key: awardEntryKey(entry, entryIndex),
      sectionKey: canonicalSectionKey('awards'),
      kind: 'award-entry',
      label: nonEmpty(entry?.title) || nonEmpty(entry?.issuer) || `Award ${entryIndex + 1}`,
      childKeys: [],
    });
  });

  (Array.isArray(payload.skills) ? payload.skills : []).forEach((skill, index) => {
    const label = nonEmpty(skill?.name);
    if (!label) return;
    const originalLabel = nonEmpty(skill?.originalName);
    const matchTexts = [label];
    if (originalLabel && originalLabel !== label) matchTexts.push(originalLabel);
    addItem(model, {
      key: skillKey(skill, index),
      sectionKey: canonicalSectionKey('skills'),
      kind: 'skill',
      label,
      category: nonEmpty(skill?.category),
      childKeys: [],
      matchTexts,
      defaultUnchecked: skill?.source === 'removed' || undefined,
    });
  });

  (Array.isArray(payload.languages) ? payload.languages : []).forEach((language, index) => {
    const lang = nonEmpty(language?.language);
    const fluency = nonEmpty(language?.fluency);
    const label = lang && fluency ? `${lang} - ${fluency}` : lang || fluency;
    if (!label) return;
    addItem(model, {
      key: languageKey(language, index),
      sectionKey: canonicalSectionKey('languages'),
      kind: 'language',
      label,
      childKeys: [],
      matchTexts: [label],
    });
  });

  (Array.isArray(payload.sections) ? payload.sections : []).forEach(section => {
    if (section.kind !== 'custom') return;
    const sectionKey = sectionKeyFromExportSection(section);
    (Array.isArray(section.lines) ? section.lines : []).forEach((line, lineIndex) => {
      if (!nonEmpty(line)) return;
      addItem(model, {
        key: customLineKey(section.id, lineIndex),
        sectionKey,
        kind: 'custom-line',
        label: line,
        childKeys: [],
        matchTexts: [line],
      });
    });
  });

  return model;
}

function collectItemDescendants(model: PdfSelectionModel, itemKey: string, acc = new Set<string>()): Set<string> {
  const item = model.items[itemKey];
  if (!item) return acc;
  item.childKeys.forEach(childKey => {
    if (acc.has(childKey)) return;
    acc.add(childKey);
    collectItemDescendants(model, childKey, acc);
  });
  return acc;
}

function applyCheckedState(
  model: PdfSelectionModel,
  overrides: PdfSelectionOverrides,
  keys: string[],
  checked: boolean
): PdfSelectionOverrides {
  const next = cloneOverrides(overrides);
  keys.forEach(key => {
    if (!model.keySet.has(key)) return;
    if (checked) {
      delete next[key];
    } else {
      next[key] = false;
    }
  });
  return next;
}

function getLeafState(model: PdfSelectionModel, overrides: PdfSelectionOverrides, key: string): TriState {
  if (key in overrides) return overrides[key] === false ? 'unchecked' : 'checked';
  const item = model.items[key];
  return item?.defaultUnchecked ? 'unchecked' : 'checked';
}

export function getPdfItemCheckState(
  model: PdfSelectionModel | null | undefined,
  overrides: PdfSelectionOverrides,
  itemKey: string
): TriState {
  if (!model) return 'checked';
  const item = model.items[itemKey];
  if (!item) return 'checked';
  if (!item.childKeys.length) return getLeafState(model, overrides, itemKey);

  let checkedCount = 0;
  let uncheckedCount = 0;
  item.childKeys.forEach(childKey => {
    const state = getPdfItemCheckState(model, overrides, childKey);
    if (state === 'checked') checkedCount += 1;
    else if (state === 'unchecked') uncheckedCount += 1;
    else {
      checkedCount += 1;
      uncheckedCount += 1;
    }
  });

  if (checkedCount > 0 && uncheckedCount > 0) return 'indeterminate';
  return checkedCount > 0 ? 'checked' : 'unchecked';
}

export function getPdfSectionCheckState(
  model: PdfSelectionModel | null | undefined,
  overrides: PdfSelectionOverrides,
  sectionKey: string
): TriState {
  if (!model) return 'checked';
  const section = model.sections[sectionKey];
  if (!section) return 'checked';
  if (!section.itemKeys.length) return getLeafState(model, overrides, sectionKey);

  let checkedCount = 0;
  let uncheckedCount = 0;

  section.itemKeys.forEach(itemKey => {
    const state = getPdfItemCheckState(model, overrides, itemKey);
    if (state === 'checked') checkedCount += 1;
    else if (state === 'unchecked') uncheckedCount += 1;
    else {
      checkedCount += 1;
      uncheckedCount += 1;
    }
  });

  if (checkedCount > 0 && uncheckedCount > 0) return 'indeterminate';
  return checkedCount > 0 ? 'checked' : 'unchecked';
}

export function isPdfItemChecked(
  model: PdfSelectionModel | null | undefined,
  overrides: PdfSelectionOverrides,
  itemKey: string
): boolean {
  return getPdfItemCheckState(model, overrides, itemKey) !== 'unchecked';
}

export function isPdfSectionChecked(
  model: PdfSelectionModel | null | undefined,
  overrides: PdfSelectionOverrides,
  sectionKey: string
): boolean {
  return getPdfSectionCheckState(model, overrides, sectionKey) !== 'unchecked';
}

export function togglePdfSelectionItem(
  model: PdfSelectionModel,
  overrides: PdfSelectionOverrides,
  itemKey: string,
  checked: boolean
): PdfSelectionOverrides {
  if (!model.items[itemKey]) return overrides;
  const descendantKeys = Array.from(collectItemDescendants(model, itemKey));
  return applyCheckedState(model, overrides, [itemKey, ...descendantKeys], checked);
}

export function togglePdfSelectionSection(
  model: PdfSelectionModel,
  overrides: PdfSelectionOverrides,
  sectionKey: string,
  checked: boolean
): PdfSelectionOverrides {
  const section = model.sections[sectionKey];
  if (!section) return overrides;
  return applyCheckedState(model, overrides, [sectionKey, ...section.itemKeys], checked);
}

export function normalizePdfSelectionOverrides(
  model: PdfSelectionModel | null | undefined,
  overrides: PdfSelectionOverrides | null | undefined
): PdfSelectionOverrides {
  if (!model || !overrides) return {};
  const next: PdfSelectionOverrides = {};
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== false) return;
    if (!model.keySet.has(key)) return;
    next[key] = false;
  });
  return next;
}

function copyProfile(profile: ResumeProfileV2 | undefined): ResumeProfileV2 {
  return { ...(profile || {}) };
}

function copySection(section: ResumeExportSection): ResumeExportSection {
  return {
    ...section,
    lines: Array.isArray(section.lines) ? [...section.lines] : [],
  };
}

function setCanonicalSectionTitles(payload: ResumePdfPayload, next: ResumePdfPayload): void {
  if (!Array.isArray(payload.sections)) return;
  const retainedSections = next.sections || [];
  const keptIds = new Set(retainedSections.map(section => section.id));
  next.sectionOrder = Array.isArray(payload.sectionOrder)
    ? payload.sectionOrder.filter(id => keptIds.has(id))
    : [];

  if (!retainedSections.length) {
    next.sections = undefined;
  }
}

export function filterResumePdfPayloadForSelection(
  payload: ResumePdfPayload,
  model: PdfSelectionModel,
  overrides: PdfSelectionOverrides
): ResumePdfPayload {
  const normalizedOverrides = normalizePdfSelectionOverrides(model, overrides);
  const next: ResumePdfPayload = {
    ...payload,
    basics: payload.basics ? { ...payload.basics } : undefined,
    work: (Array.isArray(payload.work) ? payload.work : []).map(entry => ({
      ...entry,
      location: entry.location ? { ...entry.location } : undefined,
      highlights: Array.isArray(entry.highlights) ? entry.highlights.map(highlight => ({ ...highlight })) : [],
    })),
    projects: (Array.isArray(payload.projects) ? payload.projects : []).map(entry => ({
      ...entry,
      technologies: Array.isArray(entry.technologies) ? entry.technologies.map(tech => ({ ...tech })) : [],
      highlights: Array.isArray(entry.highlights) ? entry.highlights.map(highlight => ({ ...highlight })) : [],
    })),
    education: (Array.isArray(payload.education) ? payload.education : []).map(entry => ({
      ...entry,
      location: entry.location ? { ...entry.location } : undefined,
      honors: Array.isArray(entry.honors) ? [...entry.honors] : [],
    })),
    awards: (Array.isArray(payload.awards) ? payload.awards : []).map(entry => ({ ...entry })),
    skills: (Array.isArray(payload.skills) ? payload.skills : []).map(entry => ({ ...entry })),
    languages: (Array.isArray(payload.languages) ? payload.languages : []).map(entry => ({ ...entry })),
    customSections: Array.isArray(payload.customSections)
      ? payload.customSections.map(section => ({
          ...section,
          items: Array.isArray(section.items) ? section.items.map(item => ({ ...item })) : [],
        }))
      : [],
    sections: Array.isArray(payload.sections) ? payload.sections.map(copySection) : undefined,
    sectionOrder: Array.isArray(payload.sectionOrder) ? [...payload.sectionOrder] : [],
  };

  const headerSectionKey = canonicalSectionKey('header');
  const headerSectionState = getPdfSectionCheckState(model, normalizedOverrides, headerSectionKey);
  if (next.basics) {
    const profiles = Array.isArray(next.basics.profiles) ? next.basics.profiles.map(copyProfile) : [];
    next.basics = { ...next.basics, profiles };
    if (headerSectionState === 'unchecked') {
      next.basics.name = undefined;
      next.basics.title = undefined;
      next.basics.label = undefined;
      next.basics.email = undefined;
      next.basics.phone = undefined;
      next.basics.url = undefined;
      next.basics.location = undefined;
      next.basics.profiles = [];
    } else {
      if (!isPdfItemChecked(model, normalizedOverrides, 'item:header:name')) next.basics.name = undefined;
      if (!isPdfItemChecked(model, normalizedOverrides, 'item:header:title')) {
        next.basics.title = undefined;
        next.basics.label = undefined;
      }
      if (!isPdfItemChecked(model, normalizedOverrides, 'item:header:email')) next.basics.email = undefined;
      if (!isPdfItemChecked(model, normalizedOverrides, 'item:header:phone')) next.basics.phone = undefined;
      if (!isPdfItemChecked(model, normalizedOverrides, 'item:header:url')) next.basics.url = undefined;
      if (!isPdfItemChecked(model, normalizedOverrides, 'item:header:location')) next.basics.location = undefined;
      next.basics.profiles = (next.basics.profiles || []).filter((profile, index) =>
        isPdfItemChecked(
          model,
          normalizedOverrides,
          `item:header:profile:${profile?.id || index}`
        )
      );
    }
  }

  const summarySectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('summary'));
  if (summarySectionState === 'unchecked' || !isPdfItemChecked(model, normalizedOverrides, 'item:summary')) {
    next.summary = undefined;
  }

  const workSectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('work'));
  if (workSectionState === 'unchecked') {
    next.work = [];
  } else {
    next.work = next.work.filter((entry, entryIndex) => {
      const entryKey = workEntryKey(payload.work?.[entryIndex], entryIndex);
      if (getPdfItemCheckState(model, normalizedOverrides, entryKey) === 'unchecked') return false;
      entry.highlights = (entry.highlights || []).filter((highlight, highlightIndex) =>
        isPdfItemChecked(
          model,
          normalizedOverrides,
          workHighlightKey(payload.work?.[entryIndex], payload.work?.[entryIndex]?.highlights?.[highlightIndex], entryIndex, highlightIndex)
        )
      );
      return true;
    });
  }

  const projectsSectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('projects'));
  if (projectsSectionState === 'unchecked') {
    next.projects = [];
  } else {
    next.projects = next.projects.filter((entry, entryIndex) => {
      const sourceEntry = payload.projects?.[entryIndex];
      const entryKey = projectEntryKey(sourceEntry, entryIndex);
      if (getPdfItemCheckState(model, normalizedOverrides, entryKey) === 'unchecked') return false;
      entry.highlights = (entry.highlights || []).filter((highlight, highlightIndex) =>
        isPdfItemChecked(
          model,
          normalizedOverrides,
          projectHighlightKey(
            sourceEntry,
            sourceEntry?.highlights?.[highlightIndex],
            entryIndex,
            highlightIndex
          )
        )
      );
      return true;
    });
  }

  const educationSectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('education'));
  next.education =
    educationSectionState === 'unchecked'
      ? []
      : next.education.filter((entry, index) =>
          isPdfItemChecked(model, normalizedOverrides, educationEntryKey(payload.education?.[index], index))
        );

  const awardsSectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('awards'));
  next.awards =
    awardsSectionState === 'unchecked'
      ? []
      : next.awards.filter((entry, index) =>
          isPdfItemChecked(model, normalizedOverrides, awardEntryKey(payload.awards?.[index], index))
        );

  const skillsSectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('skills'));
  next.skills =
    skillsSectionState === 'unchecked'
      ? []
      : next.skills.filter((entry, index) =>
          isPdfItemChecked(model, normalizedOverrides, skillKey(payload.skills?.[index], index))
        );

  const languagesSectionState = getPdfSectionCheckState(model, normalizedOverrides, canonicalSectionKey('languages'));
  next.languages =
    languagesSectionState === 'unchecked'
      ? []
      : next.languages.filter((entry, index) =>
          isPdfItemChecked(model, normalizedOverrides, languageKey(payload.languages?.[index], index))
        );

  if (Array.isArray(next.sections)) {
    next.sections = next.sections
      .filter(section => {
        const sectionKey = sectionKeyFromExportSection(section);
        return getPdfSectionCheckState(model, normalizedOverrides, sectionKey) !== 'unchecked';
      })
      .map(section => {
        if (section.kind !== 'custom') return section;
        const filteredLines = (section.lines || []).filter((line, lineIndex) => {
          if (!nonEmpty(line)) return false;
          return isPdfItemChecked(model, normalizedOverrides, customLineKey(section.id, lineIndex));
        });
        return { ...section, lines: filteredLines };
      })
      .filter(section => section.kind !== 'custom' || section.lines.length > 0);
  }

  setCanonicalSectionTitles(payload, next);
  return next;
}
