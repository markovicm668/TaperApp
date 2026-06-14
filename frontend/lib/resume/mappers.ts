import {
  analysisSnapshotSchema,
  type AiParsedResumePayloadV2,
  type AnalysisSnapshotV1,
  type ResumeAwardItemV2,
  type ResumeBasicsV2,
  type ResumeDataV2,
  type ResumeEducationItemV2,
  type ResumeHighlightV2,
  type ResumeLanguageItemV2,
  type ResumeLocationV2,
  type ResumeProjectItemV2,
  type ResumeSectionBlockV2,
  type ResumeSectionKindV2,
  type ResumeSkillItemV2,
  type ResumeWorkItemV2,
} from '@resume-scanner/resume-contract';
import type {
  AnalysisResult,
  ResumeExportSection,
  ResumePdfPayload,
} from '../types';
import {
  applySectionOrderToItems,
  getSectionOrderKeyForExportSection,
} from './section-order';
import { dedupeSections, nonEmpty, type CanonicalSectionKind } from './normalize';

type SectionRowKind = CanonicalSectionKind | 'custom';

const CANONICAL_SECTION_ORDER: CanonicalSectionKind[] = [
  'header',
  'summary',
  'work',
  'projects',
  'skills',
  'education',
  'awards',
  'languages',
];

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

function orderExportSectionsForCanonicalUiParity(
  sections: ResumeExportSection[]
): ResumeExportSection[] {
  if (sections.length <= 1) return sections;

  const canonicalBuckets = new Map<CanonicalSectionKind, ResumeExportSection[]>(
    CANONICAL_SECTION_ORDER.map(kind => [kind, []])
  );
  const customSections: ResumeExportSection[] = [];

  sections.forEach(section => {
    if (section.kind === 'custom') {
      customSections.push(section);
      return;
    }

    const bucket = canonicalBuckets.get(section.kind as CanonicalSectionKind);
    if (!bucket) {
      customSections.push(section);
      return;
    }
    bucket.push(section);
  });

  return [
    ...CANONICAL_SECTION_ORDER.flatMap(kind => canonicalBuckets.get(kind) || []),
    ...customSections,
  ];
}

interface ParsedSectionShape {
  key: string;
  id: string;
  title: string;
  kind: ResumeSectionKindV2;
  canonicalTarget?:
    | 'summary'
    | 'work'
    | 'projects'
    | 'skills'
    | 'education'
    | 'awards'
    | 'languages'
    | 'none';
  headingKey: string | null;
  lines: string[];
}

export interface SectionViewModelRow {
  key: string;
  id: string;
  title: string;
  kind: SectionRowKind;
  originalLines: string[];
  updatedLines: string[];
  originalValue: string;
  updatedValue: string;
  hasContent: boolean;
  changed: boolean;
  isSelectedDefault: boolean;
  isCustom: boolean;
}

function normalizeHeading(line: string): string {
  return line.trim().replace(/[:]+$/, '').toLowerCase();
}

const HEADER_PARSED_LINE_LIMIT = 12;
const KNOWN_SECTION_HEADING_KEYS = new Set<string>([
  'summary',
  'professional summary',
  'profile',
  'about',
  'objective',
  'experience',
  'work experience',
  'professional experience',
  'employment',
  'work history',
  'projects',
  'skills',
  'education',
  'awards',
  'achievements',
  'languages',
]);

function shouldUseParsedHeaderLines(parsedLines: string[], canonicalLines: string[]): boolean {
  const nonEmptyParsedLines = parsedLines
    .map(line => String(line || '').trim())
    .filter(Boolean);

  if (!nonEmptyParsedLines.length) return false;

  if (
    nonEmptyParsedLines.some(line => KNOWN_SECTION_HEADING_KEYS.has(normalizeHeading(line)))
  ) {
    return false;
  }

  const hasCanonicalHeaderLines = canonicalLines.some(line => String(line || '').trim().length > 0);
  if (hasCanonicalHeaderLines && nonEmptyParsedLines.length > HEADER_PARSED_LINE_LIMIT) {
    return false;
  }

  return true;
}

function sectionText(lines: string[]): string {
  return lines.join('\n').trim();
}

function normalizeForComparison(value: string): string {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .join('\n')
    .trim();
}

function combineLineGroups(groups: string[][]): string[] {
  return groups.reduce<string[]>((acc, group) => {
    const nonEmpty = group.filter(line => line.trim().length > 0);
    if (!nonEmpty.length) return acc;
    if (acc.length > 0) acc.push('');
    acc.push(...nonEmpty);
    return acc;
  }, []);
}


function formatLocation(location: ResumeLocationV2 | undefined): string | undefined {
  if (!location) return undefined;

  const primaryParts = [
    nonEmpty(location.city),
    nonEmpty(location.region),
    nonEmpty(location.country),
  ].filter(Boolean);
  if (primaryParts.length) return primaryParts.join(', ');

  const secondaryParts = [
    nonEmpty(location.address),
    nonEmpty(location.postalCode),
    nonEmpty(location.countryCode),
  ].filter(Boolean);
  return secondaryParts.length ? secondaryParts.join(', ') : undefined;
}

function formatDateRange(start: string | undefined, end: string | undefined, isCurrent?: boolean): string | undefined {
  const normalizedStart = nonEmpty(start);
  const normalizedEnd = nonEmpty(end) || (isCurrent ? 'Present' : undefined);
  if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd}`;
  return normalizedStart || normalizedEnd;
}

function buildHeaderLinesFromBasics(basics: ResumeBasicsV2 | undefined): string[] {
  if (!basics) return [];

  const lines: string[] = [];
  const title = nonEmpty(basics.title) || nonEmpty(basics.label);

  const pushLine = (line: string | undefined) => {
    if (line) lines.push(line);
  };

  pushLine(nonEmpty(basics.name));
  pushLine(title);
  pushLine(formatLocation(basics.location));
  pushLine(nonEmpty(basics.phone));
  pushLine(nonEmpty(basics.email));
  pushLine(nonEmpty(basics.url));

  const profiles = Array.isArray(basics.profiles) ? basics.profiles : [];
  profiles.forEach(profile => {
    const label = nonEmpty(profile.network) || nonEmpty(profile.username);
    const url = nonEmpty(profile.url);
    if (label && url) {
      pushLine(`${label}: ${url}`);
      return;
    }
    pushLine(url || label);
  });

  return lines;
}

function buildSummaryLines(summary: string | undefined): string[] {
  const normalized = nonEmpty(summary);
  return normalized ? [normalized] : [];
}

function resolveHighlightText(
  highlight: ResumeHighlightV2 | undefined,
  mode: 'original' | 'updated'
): string | undefined {
  if (!highlight) return undefined;
  if (mode === 'original') {
    return nonEmpty(highlight.originalText) || nonEmpty(highlight.text);
  }
  return nonEmpty(highlight.text) || nonEmpty(highlight.originalText);
}

function buildWorkLines(work: ResumeWorkItemV2[] | undefined, mode: 'original' | 'updated'): string[] {
  const entries = Array.isArray(work) ? work : [];
  const lines: string[] = [];

  entries.forEach(entry => {
    const entryLines: string[] = [];
    const position = nonEmpty(entry.position);
    const company = nonEmpty(entry.company);
    const roleLine =
      position && company
        ? `${position} - ${company}`
        : position || company;

    if (roleLine) entryLines.push(roleLine);
    const dateRange = formatDateRange(entry.startDate, entry.endDate, entry.isCurrent);
    if (dateRange) entryLines.push(dateRange);
    const location = formatLocation(entry.location);
    if (location) entryLines.push(location);

    const highlights = Array.isArray(entry.highlights) ? entry.highlights : [];
    highlights.forEach(highlight => {
      const text = resolveHighlightText(highlight, mode);
      if (text) entryLines.push(text);
    });

    if (!entryLines.length) return;
    if (lines.length) lines.push('');
    lines.push(...entryLines);
  });

  return lines;
}

function buildProjectLines(projects: ResumeProjectItemV2[] | undefined, mode: 'original' | 'updated'): string[] {
  const entries = Array.isArray(projects) ? projects : [];
  const lines: string[] = [];

  entries.forEach(entry => {
    const entryLines: string[] = [];
    const name = nonEmpty(entry.name);
    const role = nonEmpty(entry.role);
    const heading = name && role ? `${name} - ${role}` : name || role;
    if (heading) entryLines.push(heading);

    const dateRange = formatDateRange(entry.startDate, entry.endDate, false);
    if (dateRange) entryLines.push(dateRange);

    const technologies = (Array.isArray(entry.technologies) ? entry.technologies : [])
      .map(technology => nonEmpty(technology.name))
      .filter(Boolean);
    if (technologies.length) entryLines.push(`Technologies: ${technologies.join(', ')}`);

    const highlights = Array.isArray(entry.highlights) ? entry.highlights : [];
    highlights.forEach(highlight => {
      const text = resolveHighlightText(highlight, mode);
      if (text) entryLines.push(text);
    });

    if (!entryLines.length) return;
    if (lines.length) lines.push('');
    lines.push(...entryLines);
  });

  return lines;
}

function buildEducationLines(education: ResumeEducationItemV2[] | undefined): string[] {
  const entries = Array.isArray(education) ? education : [];
  const lines: string[] = [];

  entries.forEach(entry => {
    const entryLines: string[] = [];
    const institution = nonEmpty(entry.institution);
    if (institution) entryLines.push(institution);

    const degree = nonEmpty(entry.degree) || nonEmpty(entry.studyType);
    const area = nonEmpty(entry.area);
    const degreeLine =
      degree && area
        ? `${degree}, ${area}`
        : degree || area;
    if (degreeLine) entryLines.push(degreeLine);

    const dateRange = formatDateRange(entry.startDate, entry.endDate, false);
    if (dateRange) entryLines.push(dateRange);

    const location = formatLocation(entry.location);
    if (location) entryLines.push(location);

    const gpa = nonEmpty(entry.gpa);
    if (gpa) entryLines.push(`GPA: ${gpa}`);

    const honors = Array.isArray(entry.honors) ? entry.honors : [];
    honors
      .map(honor => nonEmpty(honor))
      .filter((h): h is string => Boolean(h))
      .forEach(honor => {
        entryLines.push(honor);
      });

    if (!entryLines.length) return;
    if (lines.length) lines.push('');
    lines.push(...entryLines);
  });

  return lines;
}

function buildSkillsLines(skills: ResumeSkillItemV2[] | undefined): string[] {
  const entries = Array.isArray(skills) ? skills : [];
  const grouped = new Map<string, string[]>();

  entries.forEach(entry => {
    const name = nonEmpty(entry.name);
    if (!name) return;

    const category = nonEmpty(entry.category) || 'General';
    const existing = grouped.get(category) || [];
    if (!existing.includes(name)) {
      existing.push(name);
      grouped.set(category, existing);
    }
  });

  const lines: string[] = [];
  grouped.forEach((names, category) => {
    if (lines.length) lines.push('');
    lines.push(`${category}:`);
    names.forEach(name => lines.push(name));
  });

  return lines;
}

function buildAwardsLines(awards: ResumeAwardItemV2[] | undefined): string[] {
  const entries = Array.isArray(awards) ? awards : [];
  const lines: string[] = [];

  entries.forEach(entry => {
    const title = nonEmpty(entry.title);
    const issuer = nonEmpty(entry.issuer);
    const date = nonEmpty(entry.date);
    const summary = nonEmpty(entry.summary);

    const entryLines: string[] = [];
    const heading = title && issuer ? `${title} - ${issuer}` : title || issuer;
    if (heading) entryLines.push(heading);
    if (date) entryLines.push(date);
    if (summary) entryLines.push(summary);

    if (!entryLines.length) return;
    if (lines.length) lines.push('');
    lines.push(...entryLines);
  });

  return lines;
}

function buildLanguagesLines(languages: ResumeLanguageItemV2[] | undefined): string[] {
  const entries = Array.isArray(languages) ? languages : [];
  return entries
    .map(entry => {
      const language = nonEmpty(entry.language);
      const fluency = nonEmpty(entry.fluency);
      if (language && fluency) return `${language} - ${fluency}`;
      return language || fluency;
    })
    .filter((line): line is string => Boolean(line));
}


function mapSectionKind(kind: string): ResumeSectionKindV2 {
  if (kind === 'experience') return 'work';
  if (
    kind === 'header' ||
    kind === 'summary' ||
    kind === 'work' ||
    kind === 'projects' ||
    kind === 'skills' ||
    kind === 'education' ||
    kind === 'awards' ||
    kind === 'languages' ||
    kind === 'custom'
  ) {
    return kind;
  }
  return 'custom';
}

function mapCanonicalTarget(
  target: string | undefined
):
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages'
  | 'none'
  | undefined {
  if (!target) return undefined;
  if (target === 'experience') return 'work';
  if (
    target === 'summary' ||
    target === 'work' ||
    target === 'projects' ||
    target === 'skills' ||
    target === 'education' ||
    target === 'awards' ||
    target === 'languages' ||
    target === 'none'
  ) {
    return target;
  }
  return undefined;
}

function sanitizeParsedSections(parsedSections: ResumeSectionBlockV2[]): ParsedSectionShape[] {
  return parsedSections.map((section, index) => {
    const lines = Array.isArray(section.lines)
      ? section.lines.map(line => String(line)).filter(Boolean)
      : [];

    const title = section.title?.trim() || `Section ${index + 1}`;
    const rawKey = section.id?.trim() || `section-${index + 1}`;

    return {
      key: rawKey,
      id: rawKey,
      title,
      kind: mapSectionKind(section.kind),
      canonicalTarget: mapCanonicalTarget(section.canonicalTarget),
      headingKey: section.kind === 'header' ? null : normalizeHeading(title),
      lines,
    };
  });
}

function inferSectionKindFromTitle(title: string): CanonicalSectionKind | 'custom' {
  const normalized = normalizeHeading(title);
  if (/^header$/.test(normalized)) return 'header';
  if (/summary|profile|about|objective/.test(normalized)) return 'summary';
  if (/experience|employment|work history/.test(normalized)) return 'work';
  if (/project/.test(normalized)) return 'projects';
  if (/skills|competenc/.test(normalized)) return 'skills';
  if (/education|academic/.test(normalized)) return 'education';
  if (/award|achievement|honor/.test(normalized)) return 'awards';
  if (/language/.test(normalized)) return 'languages';
  return 'custom';
}

function toRowKind(section: ParsedSectionShape): SectionRowKind {
  if (section.kind === 'header') return 'header';
  if (section.kind === 'summary') return 'summary';
  if (section.kind === 'work') return 'work';
  if (section.kind === 'projects') return 'projects';
  if (section.kind === 'skills') return 'skills';
  if (section.kind === 'education') return 'education';
  if (section.kind === 'awards') return 'awards';
  if (section.kind === 'languages') return 'languages';

  if (section.canonicalTarget === 'summary') return 'summary';
  if (section.canonicalTarget === 'work') return 'work';
  if (section.canonicalTarget === 'projects') return 'projects';
  if (section.canonicalTarget === 'skills') return 'skills';
  if (section.canonicalTarget === 'education') return 'education';
  if (section.canonicalTarget === 'awards') return 'awards';
  if (section.canonicalTarget === 'languages') return 'languages';

  return inferSectionKindFromTitle(section.title);
}

function createSectionRow({
  key,
  id,
  title,
  kind,
  originalLines,
  updatedLines,
  isCustom,
}: {
  key: string;
  id: string;
  title: string;
  kind: SectionRowKind;
  originalLines: string[];
  updatedLines: string[];
  isCustom: boolean;
}): SectionViewModelRow {
  const originalValue = sectionText(originalLines);
  const updatedValue = sectionText(updatedLines);
  const hasContent = Boolean(originalValue || updatedValue);

  return {
    key,
    id,
    title,
    kind,
    originalLines,
    updatedLines,
    originalValue,
    updatedValue,
    hasContent,
    changed: normalizeForComparison(originalValue) !== normalizeForComparison(updatedValue),
    isSelectedDefault: hasContent,
    isCustom,
  };
}

function orderSectionRowsForUserPreference(
  rows: SectionViewModelRow[],
  requestedOrder?: string[] | null
): SectionViewModelRow[] {
  return applySectionOrderToItems(rows, row => row.key, requestedOrder);
}

export function buildSectionViewModel(options: {
  parsedSections?: ResumeSectionBlockV2[] | null;
  resumeData?: ResumeDataV2;
}): SectionViewModelRow[] {
  const parsedSections =
    Array.isArray(options.parsedSections) && options.parsedSections.length > 0
      ? sanitizeParsedSections(options.parsedSections)
      : [];
  const sharedLines = {
    header: buildHeaderLinesFromBasics(options.resumeData?.basics),
    summary: buildSummaryLines(options.resumeData?.summary),
    skills: buildSkillsLines(options.resumeData?.skills),
    education: buildEducationLines(options.resumeData?.education),
    awards: buildAwardsLines(options.resumeData?.awards),
    languages: buildLanguagesLines(options.resumeData?.languages),
  };
  const canonicalOriginalByKind: Record<CanonicalSectionKind, string[]> = {
    ...sharedLines,
    work: buildWorkLines(options.resumeData?.work, 'original'),
    projects: buildProjectLines(options.resumeData?.projects, 'original'),
  };
  const canonicalUpdatedByKind: Record<CanonicalSectionKind, string[]> = {
    ...sharedLines,
    work: buildWorkLines(options.resumeData?.work, 'updated'),
    projects: buildProjectLines(options.resumeData?.projects, 'updated'),
  };

  if (!parsedSections.length) {
    const rows = CANONICAL_SECTION_ORDER.map(kind =>
      createSectionRow({
        key: `canonical-${kind}`,
        id: `canonical-${kind}`,
        title: CANONICAL_SECTION_TITLES[kind],
        kind,
        originalLines: canonicalOriginalByKind[kind],
        updatedLines: canonicalUpdatedByKind[kind],
        isCustom: false,
      })
    );
    return orderSectionRowsForUserPreference(rows, options.resumeData?.sectionOrder);
  }

  const canonicalRows = CANONICAL_SECTION_ORDER.map(kind => {
    const matching = parsedSections.filter(section => toRowKind(section) === kind);
    const parsedLines = combineLineGroups(matching.map(section => section.lines));
    const canonicalOriginalLines = canonicalOriginalByKind[kind];
    const canonicalUpdatedLines = canonicalUpdatedByKind[kind];

    // For header: prefer parsed lines if they're short and don't contain section headings.
    // For other sections: prefer canonical lines (from structured resumeData) since they
    // reflect inline edits and bullet changes applied by the reducer.
    let originalLines: string[];
    let updatedLines: string[];

    if (kind === 'header') {
      const useParsed = shouldUseParsedHeaderLines(parsedLines, canonicalOriginalLines);
      originalLines = useParsed ? parsedLines : canonicalOriginalLines;
      updatedLines = useParsed ? parsedLines : canonicalUpdatedLines;
    } else if (kind === 'summary') {
      originalLines = parsedLines.length ? parsedLines : canonicalOriginalLines;
      updatedLines = canonicalUpdatedLines.length ? canonicalUpdatedLines : parsedLines;
    } else {
      originalLines = canonicalOriginalLines.length ? canonicalOriginalLines : parsedLines;
      updatedLines = canonicalUpdatedLines.length ? canonicalUpdatedLines : parsedLines;
    }

    const title = matching[0]?.title || CANONICAL_SECTION_TITLES[kind];

    return createSectionRow({
      key: `canonical-${kind}`,
      id: `canonical-${kind}`,
      title,
      kind,
      originalLines,
      updatedLines,
      isCustom: false,
    });
  });

  const customRows = parsedSections
    .filter(section => toRowKind(section) === 'custom')
    .map(section =>
      createSectionRow({
        key: `custom-${section.key}`,
        id: section.id,
        title: section.title,
        kind: 'custom',
        originalLines: section.lines,
        updatedLines: section.lines,
        isCustom: true,
      })
    );

  return orderSectionRowsForUserPreference(
    [...canonicalRows, ...customRows],
    options.resumeData?.sectionOrder
  );
}

export function buildCanonicalExportPayload(
  parsedPayload: AiParsedResumePayloadV2 | null,
  options: {
    resumeDataOverride?: ResumeDataV2;
  } = {}
): ResumePdfPayload | null {
  if (!parsedPayload) return null;

  const resumeData = options.resumeDataOverride || parsedPayload.resumeData;

  const parsedSections = sanitizeParsedSections([
    ...(Array.isArray(parsedPayload.sections) ? parsedPayload.sections : []),
    ...(Array.isArray(parsedPayload.customSections) ? parsedPayload.customSections : []),
  ]);
  const mergedSections = dedupeSections(parsedSections);

  const canonicalSectionIndex = new Map<CanonicalSectionKind, number>();
  const sections: ResumeExportSection[] = [];

  mergedSections.forEach(section => {
    const effectiveKind = toRowKind(section);
    const lines = Array.isArray(section.lines) ? section.lines.map(line => String(line || '')) : [];

    if (effectiveKind === 'custom') {
      sections.push({
        id: section.id,
        title: section.title,
        kind: 'custom',
        lines,
        renderMode: 'lines',
      });
      return;
    }

    const existingIndex = canonicalSectionIndex.get(effectiveKind);
    if (existingIndex === undefined) {
      canonicalSectionIndex.set(effectiveKind, sections.length);
      sections.push({
        id: section.id,
        title: section.title,
        kind: effectiveKind,
        lines,
        renderMode: 'canonical',
      });
      return;
    }

    if (!lines.length) return;
    const existing = sections[existingIndex];
    if (!existing) return;
    if (existing.lines.length > 0 && existing.lines[existing.lines.length - 1] !== '') {
      existing.lines.push('');
    }
    existing.lines.push(...lines);
  });

  const canonicalOrderedSections = sections.length
    ? orderExportSectionsForCanonicalUiParity(sections)
    : sections;
  const orderedSections = canonicalOrderedSections.length
    ? applySectionOrderToItems(
        canonicalOrderedSections,
        getSectionOrderKeyForExportSection,
        resumeData.sectionOrder
      )
    : canonicalOrderedSections;

  return {
    ...resumeData,
    sections: orderedSections.length ? orderedSections : undefined,
    sectionOrder: orderedSections.length
      ? orderedSections.map(section => section.id)
      : Array.isArray(resumeData.sectionOrder)
        ? resumeData.sectionOrder
        : [],
  };
}

export function analysisResultToSnapshot(result: AnalysisResult): AnalysisSnapshotV1 {
  return analysisSnapshotSchema.parse(result);
}

export function snapshotToAnalysisResult(snapshot: AnalysisSnapshotV1): AnalysisResult {
  return {
    ...snapshot,
  };
}
