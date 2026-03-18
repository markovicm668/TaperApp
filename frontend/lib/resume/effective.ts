import type {
  BulletChange,
  ResumeDataV2,
  ResumeHighlightV2,
  ResumeProjectItemV2,
  ResumeSectionBlockV2,
  ResumeWorkItemV2,
} from '@resume-scanner/resume-contract';
import { buildSectionViewModel, type SectionViewModelRow } from './mappers';

const LIST_PREFIX_RE = /^\s*(?:[-*•●▪◦–—−]|(?:\(?\d{1,3}[.)]))\s+/u;

type CanonicalBulletSection =
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages';

type ChangeOrigin = 'ai' | 'user';

interface NormalizedBulletChange {
  index: number;
  type: BulletChange['type'];
  original: string;
  improved: string;
  normalizedOriginal: string;
  normalizedOriginalLoose: string;
  section?: CanonicalBulletSection;
}

function stripListPrefix(value: string): string {
  return String(value || '').replace(LIST_PREFIX_RE, '').trim();
}

function normalizeBulletForStorage(value: string): string {
  return stripListPrefix(value).replace(/\s+/g, ' ').trim();
}

function normalizeBulletForMatch(value: string): string {
  return normalizeBulletForStorage(value)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
}

function normalizeBulletLooseKey(value: string): string {
  return normalizeBulletForStorage(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function bulletMatchesChange(
  normalizedBullet: string,
  normalizedBulletLoose: string,
  change: { normalizedOriginal: string; normalizedOriginalLoose: string }
): boolean {
  if (!change.normalizedOriginal && !change.normalizedOriginalLoose) return false;

  const directMatch =
    Boolean(change.normalizedOriginal) &&
    (normalizedBullet === change.normalizedOriginal ||
      normalizedBullet.includes(change.normalizedOriginal) ||
      change.normalizedOriginal.includes(normalizedBullet));

  if (directMatch) return true;
  if (!change.normalizedOriginalLoose) return false;

  return (
    normalizedBulletLoose === change.normalizedOriginalLoose ||
    normalizedBulletLoose.includes(change.normalizedOriginalLoose) ||
    change.normalizedOriginalLoose.includes(normalizedBulletLoose)
  );
}

function normalizeBulletSection(section: string | undefined): CanonicalBulletSection | undefined {
  const normalized = String(section || '').trim().toLowerCase();
  if (!normalized) return undefined;

  if (
    normalized === 'experience' ||
    normalized === 'work' ||
    normalized === 'professional experience' ||
    normalized === 'employment' ||
    normalized === 'work history'
  ) {
    return 'work';
  }

  if (
    normalized === 'project' ||
    normalized === 'projects' ||
    normalized === 'personal projects' ||
    normalized === 'side projects'
  ) {
    return 'projects';
  }

  if (normalized === 'summary' || normalized === 'profile' || normalized === 'objective') {
    return 'summary';
  }
  if (normalized === 'skills' || normalized === 'skill') return 'skills';
  if (normalized === 'education' || normalized === 'academic') return 'education';
  if (normalized === 'awards' || normalized === 'achievements') return 'awards';
  if (normalized === 'languages' || normalized === 'language') return 'languages';

  return undefined;
}

function normalizeBulletChanges(changes: BulletChange[]): NormalizedBulletChange[] {
  return changes.map((change, index) => ({
    index,
    type: change.type,
    original: change.original || '',
    improved: change.improved || '',
    normalizedOriginal: normalizeBulletForMatch(change.original || ''),
    normalizedOriginalLoose: normalizeBulletLooseKey(change.original || ''),
    section: normalizeBulletSection(change.section),
  }));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item || '').trim()).filter(Boolean);
}

function normalizeHighlight(
  value: unknown,
  entryId: string,
  index: number
): ResumeHighlightV2 | null {
  if (typeof value === 'string') {
    const text = normalizeBulletForStorage(value);
    if (!text) return null;
    return {
      id: `${entryId}-highlight-${index + 1}`,
      text,
      originalText: text,
      source: 'user',
      locked: false,
      aiTags: [],
      keywordMatches: [],
    };
  }

  if (!value || typeof value !== 'object') return null;
  const highlight = value as Partial<ResumeHighlightV2>;
  const baselineText = normalizeBulletForStorage(highlight.originalText || highlight.text || '');
  const currentText = normalizeBulletForStorage(highlight.text || highlight.originalText || '');
  if (!baselineText && !currentText) return null;

  const originalText = baselineText || currentText;
  const text = currentText || baselineText;

  return {
    ...highlight,
    id: highlight.id || `${entryId}-highlight-${index + 1}`,
    text,
    originalText,
    source: highlight.source || 'user',
    locked: Boolean(highlight.locked),
    aiTags: normalizeStringList(highlight.aiTags),
    keywordMatches: normalizeStringList(highlight.keywordMatches),
  };
}

function normalizeHighlights(value: unknown, entryId: string): ResumeHighlightV2[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeHighlight(item, entryId, index))
    .filter((item): item is ResumeHighlightV2 => Boolean(item));
}

function applyChangesToHighlights(
  highlights: ResumeHighlightV2[],
  changes: NormalizedBulletChange[],
  usedChanges: Set<number>,
  origin: ChangeOrigin
): ResumeHighlightV2[] {
  const nextHighlights: ResumeHighlightV2[] = [];

  for (const highlight of highlights) {
    const originalText = normalizeBulletForStorage(highlight.originalText || highlight.text || '');
    const currentText = normalizeBulletForStorage(highlight.text || highlight.originalText || '');
    const canonicalOriginal = originalText || currentText;
    const canonicalCurrent = currentText || originalText;

    if (!canonicalOriginal && !canonicalCurrent) continue;

    const normalizedOriginal = normalizeBulletForMatch(canonicalOriginal);
    const normalizedOriginalLoose = normalizeBulletLooseKey(canonicalOriginal);
    const normalizedCurrent = normalizeBulletForMatch(canonicalCurrent);
    const normalizedCurrentLoose = normalizeBulletLooseKey(canonicalCurrent);

    const matchedChange = changes.find(change => {
      if (usedChanges.has(change.index)) return false;
      if (change.type === 'added') return false;

      return (
        bulletMatchesChange(normalizedOriginal, normalizedOriginalLoose, change) ||
        bulletMatchesChange(normalizedCurrent, normalizedCurrentLoose, change)
      );
    });

    if (!matchedChange) {
      nextHighlights.push({
        ...highlight,
        text: canonicalCurrent,
        originalText: canonicalOriginal,
        aiTags: normalizeStringList(highlight.aiTags),
        keywordMatches: normalizeStringList(highlight.keywordMatches),
      });
      continue;
    }

    usedChanges.add(matchedChange.index);
    if (matchedChange.type === 'removed') continue;

    const improvedText = normalizeBulletForStorage(matchedChange.improved);
    const text = improvedText || canonicalOriginal;

    nextHighlights.push({
      ...highlight,
      text,
      originalText: canonicalOriginal,
      source: text === canonicalOriginal ? highlight.source || 'user' : origin,
      aiTags: normalizeStringList(highlight.aiTags),
      keywordMatches: normalizeStringList(highlight.keywordMatches),
    });
  }

  return nextHighlights;
}

function getAddedHighlights(changes: NormalizedBulletChange[], usedChanges: Set<number>): Array<{
  changeIndex: number;
  text: string;
}> {
  return changes
    .filter(change => !usedChanges.has(change.index) && change.type === 'added')
    .map(change => ({
      changeIndex: change.index,
      text: normalizeBulletForStorage(change.improved || change.original),
    }))
    .filter(change => Boolean(change.text));
}

function hasWorkContent(entry: ResumeWorkItemV2): boolean {
  return Boolean(
    entry.company ||
      entry.position ||
      entry.startDate ||
      entry.endDate ||
      entry.isCurrent ||
      entry.location ||
      (Array.isArray(entry.highlights) && entry.highlights.length > 0)
  );
}

function hasProjectContent(entry: ResumeProjectItemV2): boolean {
  return Boolean(
    entry.name ||
      entry.role ||
      entry.description ||
      entry.startDate ||
      entry.endDate ||
      entry.repository ||
      entry.url ||
      (Array.isArray(entry.technologies) && entry.technologies.length > 0) ||
      (Array.isArray(entry.highlights) && entry.highlights.length > 0)
  );
}

function applyChangesToWork(
  workEntries: ResumeWorkItemV2[],
  changes: NormalizedBulletChange[],
  origin: ChangeOrigin
): { work: ResumeWorkItemV2[]; usedChanges: Set<number> } {
  if (!changes.length) {
    return { work: Array.isArray(workEntries) ? workEntries : [], usedChanges: new Set<number>() };
  }

  const usedChanges = new Set<number>();
  const entries = (Array.isArray(workEntries) ? workEntries : []).map((entry, index) => {
    const entryId = entry.id || `work-${index + 1}`;
    return {
      ...entry,
      id: entryId,
      highlights: normalizeHighlights(entry.highlights, entryId),
    };
  });

  entries.forEach(entry => {
    entry.highlights = applyChangesToHighlights(entry.highlights || [], changes, usedChanges, origin);
  });

  const additions = getAddedHighlights(changes, usedChanges);
  if (additions.length) {
    const targetEntry = entries.length > 0 ? entries[entries.length - 1] : { id: 'work-1', highlights: [] };
    if (entries.length === 0) entries.push(targetEntry as ResumeWorkItemV2);
    const targetId = targetEntry.id || `work-${entries.length}`;

    const existingAdded = new Set(
      (targetEntry.highlights || [])
        .filter(highlight => normalizeBulletForStorage(highlight.originalText || '') === '')
        .map(highlight => normalizeBulletForStorage(highlight.text || ''))
    );

    targetEntry.highlights = [
      ...(targetEntry.highlights || []),
      ...additions
        .filter(addition => {
          const text = normalizeBulletForStorage(addition.text);
          if (!text || existingAdded.has(text)) {
            usedChanges.add(addition.changeIndex);
            return false;
          }
          existingAdded.add(text);
          return true;
        })
        .map((addition, index) => {
          usedChanges.add(addition.changeIndex);
          return {
            id: `${targetId}-added-highlight-${index + 1}`,
            text: addition.text,
            originalText: '',
            source: origin,
            locked: false,
            aiTags: [],
            keywordMatches: [],
          } as ResumeHighlightV2;
        }),
    ];
  }

  const cleaned = entries
    .map(entry => {
      const entryId = entry.id || 'work';
      return {
        ...entry,
        highlights: normalizeHighlights(entry.highlights, entryId),
      };
    })
    .filter(hasWorkContent);

  return { work: cleaned, usedChanges };
}

function applyChangesToProjects(
  projectEntries: ResumeProjectItemV2[],
  changes: NormalizedBulletChange[],
  origin: ChangeOrigin
): { projects: ResumeProjectItemV2[]; usedChanges: Set<number> } {
  if (!changes.length) {
    return {
      projects: Array.isArray(projectEntries) ? projectEntries : [],
      usedChanges: new Set<number>(),
    };
  }

  const usedChanges = new Set<number>();
  const entries = (Array.isArray(projectEntries) ? projectEntries : []).map((entry, index) => {
    const entryId = entry.id || `project-${index + 1}`;
    return {
      ...entry,
      id: entryId,
      technologies: Array.isArray(entry.technologies) ? entry.technologies : [],
      highlights: normalizeHighlights(entry.highlights, entryId),
    };
  });

  entries.forEach(entry => {
    entry.highlights = applyChangesToHighlights(entry.highlights || [], changes, usedChanges, origin);
  });

  const additions = getAddedHighlights(changes, usedChanges);
  if (additions.length) {
    const targetEntry =
      entries.length > 0 ? entries[entries.length - 1] : { id: 'project-1', technologies: [], highlights: [] };
    if (entries.length === 0) entries.push(targetEntry as ResumeProjectItemV2);
    const targetId = targetEntry.id || `project-${entries.length}`;

    const existingAdded = new Set(
      (targetEntry.highlights || [])
        .filter(highlight => normalizeBulletForStorage(highlight.originalText || '') === '')
        .map(highlight => normalizeBulletForStorage(highlight.text || ''))
    );

    targetEntry.highlights = [
      ...(targetEntry.highlights || []),
      ...additions
        .filter(addition => {
          const text = normalizeBulletForStorage(addition.text);
          if (!text || existingAdded.has(text)) {
            usedChanges.add(addition.changeIndex);
            return false;
          }
          existingAdded.add(text);
          return true;
        })
        .map((addition, index) => {
          usedChanges.add(addition.changeIndex);
          return {
            id: `${targetId}-added-highlight-${index + 1}`,
            text: addition.text,
            originalText: '',
            source: origin,
            locked: false,
            aiTags: [],
            keywordMatches: [],
          } as ResumeHighlightV2;
        }),
    ];
  }

  const cleaned = entries
    .map(entry => {
      const entryId = entry.id || 'project';
      return {
        ...entry,
        technologies: Array.isArray(entry.technologies) ? entry.technologies : [],
        highlights: normalizeHighlights(entry.highlights, entryId),
      };
    })
    .filter(hasProjectContent);

  return { projects: cleaned, usedChanges };
}

export function applyBulletChangesToResumeData(
  baseResumeData: ResumeDataV2,
  bulletChanges: BulletChange[],
  origin: ChangeOrigin
): ResumeDataV2 {
  if (!Array.isArray(bulletChanges) || bulletChanges.length === 0) {
    return baseResumeData;
  }

  const normalizedChanges = normalizeBulletChanges(bulletChanges);
  const workScopedChanges = normalizedChanges.filter(change => change.section === 'work');
  const projectScopedChanges = normalizedChanges.filter(change => change.section === 'projects');
  const unscopedChanges = normalizedChanges.filter(change => change.section === undefined);

  const workResult = applyChangesToWork(
    Array.isArray(baseResumeData.work) ? baseResumeData.work : [],
    [...workScopedChanges, ...unscopedChanges],
    origin
  );

  const remainingUnscoped = unscopedChanges.filter(
    change => !workResult.usedChanges.has(change.index)
  );

  const projectResult = applyChangesToProjects(
    Array.isArray(baseResumeData.projects) ? baseResumeData.projects : [],
    [...projectScopedChanges, ...remainingUnscoped],
    origin
  );

  return {
    ...baseResumeData,
    work: workResult.work,
    projects: projectResult.projects,
  };
}

export function materializeEffectiveSections(
  parsedSections?: ResumeSectionBlockV2[] | null,
  resumeData?: ResumeDataV2
): SectionViewModelRow[] {
  return buildSectionViewModel({
    parsedSections,
    resumeData,
  });
}
