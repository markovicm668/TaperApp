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

type CanonicalSectionKind =
  | 'header'
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages';

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

function toNonEmptyLine(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function formatLocation(location: ResumeLocationV2 | undefined): string | undefined {
  if (!location) return undefined;

  const primaryParts = [
    toNonEmptyLine(location.city),
    toNonEmptyLine(location.region),
    toNonEmptyLine(location.country),
  ].filter(Boolean);
  if (primaryParts.length) return primaryParts.join(', ');

  const secondaryParts = [
    toNonEmptyLine(location.address),
    toNonEmptyLine(location.postalCode),
    toNonEmptyLine(location.countryCode),
  ].filter(Boolean);
  return secondaryParts.length ? secondaryParts.join(', ') : undefined;
}

function formatDateRange(start: string | undefined, end: string | undefined, isCurrent?: boolean): string | undefined {
  const normalizedStart = toNonEmptyLine(start);
  const normalizedEnd = toNonEmptyLine(end) || (isCurrent ? 'Present' : undefined);
  if (normalizedStart && normalizedEnd) return `${normalizedStart} - ${normalizedEnd}`;
  return normalizedStart || normalizedEnd;
}

function buildHeaderLinesFromBasics(basics: ResumeBasicsV2 | undefined): string[] {
  if (!basics) return [];

  const lines: string[] = [];
  const title = toNonEmptyLine(basics.title) || toNonEmptyLine(basics.label);

  const pushLine = (line: string | undefined) => {
    if (line) lines.push(line);
  };

  pushLine(toNonEmptyLine(basics.name));
  pushLine(title);
  pushLine(formatLocation(basics.location));
  pushLine(toNonEmptyLine(basics.phone));
  pushLine(toNonEmptyLine(basics.email));
  pushLine(toNonEmptyLine(basics.url));

  const profiles = Array.isArray(basics.profiles) ? basics.profiles : [];
  profiles.forEach(profile => {
    const label = toNonEmptyLine(profile.network) || toNonEmptyLine(profile.username);
    const url = toNonEmptyLine(profile.url);
    if (label && url) {
      pushLine(`${label}: ${url}`);
      return;
    }
    pushLine(url || label);
  });

  return lines;
}

function buildSummaryLines(summary: string | undefined): string[] {
  const normalized = toNonEmptyLine(summary);
  return normalized ? [normalized] : [];
}

function resolveHighlightText(
  highlight: ResumeHighlightV2 | undefined,
  mode: 'original' | 'updated'
): string | undefined {
  if (!highlight) return undefined;
  if (mode === 'original') {
    return toNonEmptyLine(highlight.originalText) || toNonEmptyLine(highlight.text);
  }
  return toNonEmptyLine(highlight.text) || toNonEmptyLine(highlight.originalText);
}

function buildWorkLines(work: ResumeWorkItemV2[] | undefined, mode: 'original' | 'updated'): string[] {
  const entries = Array.isArray(work) ? work : [];
  const lines: string[] = [];

  entries.forEach(entry => {
    const entryLines: string[] = [];
    const position = toNonEmptyLine(entry.position);
    const company = toNonEmptyLine(entry.company);
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
    const name = toNonEmptyLine(entry.name);
    const role = toNonEmptyLine(entry.role);
    const heading = name && role ? `${name} - ${role}` : name || role;
    if (heading) entryLines.push(heading);

    const dateRange = formatDateRange(entry.startDate, entry.endDate, false);
    if (dateRange) entryLines.push(dateRange);
    const description = toNonEmptyLine(entry.description);
    if (description) entryLines.push(description);

    const technologies = (Array.isArray(entry.technologies) ? entry.technologies : [])
      .map(technology => toNonEmptyLine(technology.name))
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
    const institution = toNonEmptyLine(entry.institution);
    if (institution) entryLines.push(institution);

    const degree = toNonEmptyLine(entry.degree) || toNonEmptyLine(entry.studyType);
    const area = toNonEmptyLine(entry.area);
    const degreeLine =
      degree && area
        ? `${degree}, ${area}`
        : degree || area;
    if (degreeLine) entryLines.push(degreeLine);

    const dateRange = formatDateRange(entry.startDate, entry.endDate, false);
    if (dateRange) entryLines.push(dateRange);

    const location = formatLocation(entry.location);
    if (location) entryLines.push(location);

    const gpa = toNonEmptyLine(entry.gpa);
    if (gpa) entryLines.push(`GPA: ${gpa}`);

    const honors = Array.isArray(entry.honors) ? entry.honors : [];
    honors
      .map(honor => toNonEmptyLine(honor))
      .filter(Boolean)
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
    const name = toNonEmptyLine(entry.name);
    if (!name) return;

    const category = toNonEmptyLine(entry.category) || 'General';
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
    const title = toNonEmptyLine(entry.title);
    const issuer = toNonEmptyLine(entry.issuer);
    const date = toNonEmptyLine(entry.date);
    const summary = toNonEmptyLine(entry.summary);

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
      const language = toNonEmptyLine(entry.language);
      const fluency = toNonEmptyLine(entry.fluency);
      if (language && fluency) return `${language} - ${fluency}`;
      return language || fluency;
    })
    .filter((line): line is string => Boolean(line));
}

function buildCanonicalFallbackLines(
  resumeData: ResumeDataV2 | undefined,
  mode: 'original' | 'updated'
): Record<CanonicalSectionKind, string[]> {
  return {
    header: buildHeaderLinesFromBasics(resumeData?.basics),
    summary: buildSummaryLines(resumeData?.summary),
    work: buildWorkLines(resumeData?.work, mode),
    projects: buildProjectLines(resumeData?.projects, mode),
    skills: buildSkillsLines(resumeData?.skills),
    education: buildEducationLines(resumeData?.education),
    awards: buildAwardsLines(resumeData?.awards),
    languages: buildLanguagesLines(resumeData?.languages),
  };
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

function getNextHeadingIndex(sections: ParsedSectionShape[], fromIndex: number): number {
  for (let index = fromIndex; index < sections.length; index += 1) {
    if (sections[index].headingKey) return index;
  }
  return -1;
}

function parseTextByParsedSections(resumeText: string, parsedSections: ParsedSectionShape[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  parsedSections.forEach(section => buckets.set(section.key, []));

  if (!parsedSections.length) return buckets;

  let currentIndex = parsedSections.findIndex(section => section.headingKey === null);
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  let nextHeadingIndex = getNextHeadingIndex(parsedSections, 0);

  for (const rawLine of resumeText.split(/\r?\n/)) {
    const normalized = normalizeHeading(rawLine);

    if (
      nextHeadingIndex !== -1 &&
      parsedSections[nextHeadingIndex].headingKey === normalized
    ) {
      currentIndex = nextHeadingIndex;
      nextHeadingIndex = getNextHeadingIndex(parsedSections, nextHeadingIndex + 1);
      continue;
    }

    const currentSection = parsedSections[currentIndex];
    const bucket = buckets.get(currentSection.key);
    if (bucket) {
      bucket.push(rawLine);
    }
  }

  return buckets;
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

export function buildSectionViewModel(options: {
  originalText: string;
  updatedText: string;
  parsedSections?: ResumeSectionBlockV2[] | null;
  resumeData?: ResumeDataV2;
}): SectionViewModelRow[] {
  const originalText = options.originalText || '';
  const updatedText = options.updatedText || originalText;
  const parsedSections =
    Array.isArray(options.parsedSections) && options.parsedSections.length > 0
      ? sanitizeParsedSections(options.parsedSections)
      : [];
  const fallbackOriginalByKind = buildCanonicalFallbackLines(options.resumeData, 'original');
  const fallbackUpdatedByKind = buildCanonicalFallbackLines(options.resumeData, 'updated');

  if (!parsedSections.length) {
    return CANONICAL_SECTION_ORDER.map(kind =>
      createSectionRow({
        key: `canonical-${kind}`,
        id: `canonical-${kind}`,
        title: CANONICAL_SECTION_TITLES[kind],
        kind,
        originalLines: fallbackOriginalByKind[kind],
        updatedLines: fallbackUpdatedByKind[kind],
        isCustom: false,
      })
    );
  }

  const updatedBySection = parseTextByParsedSections(updatedText, parsedSections);
  const canonicalRows = CANONICAL_SECTION_ORDER.map(kind => {
    const matching = parsedSections.filter(section => toRowKind(section) === kind);
    const parsedOriginalLines = combineLineGroups(matching.map(section => section.lines));
    const parsedUpdatedLines = combineLineGroups(
      matching.map(section => updatedBySection.get(section.key) || [])
    );
    const originalLines = parsedOriginalLines.length ? parsedOriginalLines : fallbackOriginalByKind[kind];
    const updatedLines = parsedUpdatedLines.length ? parsedUpdatedLines : fallbackUpdatedByKind[kind];
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
        updatedLines: updatedBySection.get(section.key) || [],
        isCustom: true,
      })
    );

  return [...canonicalRows, ...customRows];
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
  const seenMergedSections = new Set<string>();
  const mergedSections = parsedSections.filter(section => {
    const dedupeKey = `${section.id}::${section.kind}::${section.title}`;
    if (seenMergedSections.has(dedupeKey)) return false;
    seenMergedSections.add(dedupeKey);
    return true;
  });

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

  return {
    ...resumeData,
    sections: sections.length ? sections : undefined,
    sectionOrder: sections.length
      ? sections.map(section => section.id)
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
