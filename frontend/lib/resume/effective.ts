import type {
  BulletChange,
  ResumeDataV2,
  ResumeHighlightV2,
  ResumeProjectItemV2,
  ResumeSectionBlockV2,
  ResumeSkillItemV2,
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
  id?: string;
  category?: string;
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
    id: change.id,
    category: change.category,
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
      if (change.id) return highlight.id === change.id;

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

function applyHighlightChangesToEntries<T extends { id: string; highlights?: ResumeHighlightV2[] }>(
  entries: T[],
  changes: NormalizedBulletChange[],
  origin: ChangeOrigin,
  prefix: string,
): { entries: T[]; usedChanges: Set<number> } {
  const usedChanges = new Set<number>();

  entries.forEach(entry => {
    entry.highlights = applyChangesToHighlights(entry.highlights || [], changes, usedChanges, origin);
  });

  const additions = getAddedHighlights(changes, usedChanges);
  if (additions.length) {
    const targetEntry = entries.length > 0 ? entries[entries.length - 1] : { id: `${prefix}-1`, highlights: [] } as unknown as T;
    if (entries.length === 0) entries.push(targetEntry);
    const targetId = targetEntry.id || `${prefix}-${entries.length}`;

    const existingAdded = new Set(
      (targetEntry.highlights || [])
        .filter(h => normalizeBulletForStorage(h.originalText || '') === '')
        .map(h => normalizeBulletForStorage(h.text || ''))
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

  return { entries, usedChanges };
}

function applyChangesToWork(
  workEntries: ResumeWorkItemV2[],
  changes: NormalizedBulletChange[],
  origin: ChangeOrigin
): { work: ResumeWorkItemV2[]; usedChanges: Set<number> } {
  if (!changes.length) {
    return { work: Array.isArray(workEntries) ? workEntries : [], usedChanges: new Set<number>() };
  }

  const entries = (Array.isArray(workEntries) ? workEntries : []).map((entry, index) => {
    const entryId = entry.id || `work-${index + 1}`;
    return { ...entry, id: entryId, highlights: normalizeHighlights(entry.highlights, entryId) };
  });

  const { usedChanges } = applyHighlightChangesToEntries(entries, changes, origin, 'work');

  const cleaned = entries
    .map(entry => ({ ...entry, highlights: normalizeHighlights(entry.highlights, entry.id || 'work') }))
    .filter(hasWorkContent);

  return { work: cleaned, usedChanges };
}

function applyChangesToProjects(
  projectEntries: ResumeProjectItemV2[],
  changes: NormalizedBulletChange[],
  origin: ChangeOrigin
): { projects: ResumeProjectItemV2[]; usedChanges: Set<number> } {
  if (!changes.length) {
    return { projects: Array.isArray(projectEntries) ? projectEntries : [], usedChanges: new Set<number>() };
  }

  const entries = (Array.isArray(projectEntries) ? projectEntries : []).map((entry, index) => {
    const entryId = entry.id || `project-${index + 1}`;
    return {
      ...entry,
      id: entryId,
      technologies: Array.isArray(entry.technologies) ? entry.technologies : [],
      highlights: normalizeHighlights(entry.highlights, entryId),
    };
  });

  const { usedChanges } = applyHighlightChangesToEntries(entries, changes, origin, 'project');

  const cleaned = entries
    .map(entry => ({
      ...entry,
      technologies: Array.isArray(entry.technologies) ? entry.technologies : [],
      highlights: normalizeHighlights(entry.highlights, entry.id || 'project'),
    }))
    .filter(hasProjectContent);

  return { projects: cleaned, usedChanges };
}

/** Parse "[Category] SkillName" bracket prefix from AI-added skills. */
function parseSkillCategoryPrefix(text: string): { category: string; name: string } | null {
  const match = text.match(/^\[([^\]]+)\]\s+(.+)$/);
  if (!match) return null;
  return { category: match[1].trim(), name: match[2].trim() };
}

function applyChangesToSkills(
  skillEntries: ResumeSkillItemV2[],
  changes: NormalizedBulletChange[],
  origin: ChangeOrigin,
  categoryRenames?: Array<{ from: string; to: string }>,
): { skills: ResumeSkillItemV2[]; usedChanges: Set<number> } {
  if (!changes.length && !categoryRenames?.length) {
    return { skills: Array.isArray(skillEntries) ? skillEntries : [], usedChanges: new Set<number>() };
  }

  const usedChanges = new Set<number>();
  const entries = (Array.isArray(skillEntries) ? skillEntries : []).slice();

  // Apply category renames first
  if (categoryRenames?.length) {
    for (const rename of categoryRenames) {
      const fromNorm = rename.from.trim().toLowerCase();
      for (const skill of entries) {
        if ((skill.category || '').trim().toLowerCase() === fromNorm) {
          skill.category = rename.to;
        }
      }
    }
  }

  // Apply modifications and removals
  const result: ResumeSkillItemV2[] = [];
  for (const skill of entries) {
    const skillName = String(skill.name || '').trim();
    if (!skillName) continue;

    const originalName = String(skill.originalName || skill.name || '').trim();
    const normalizedName = normalizeBulletForMatch(skillName);
    const normalizedNameLoose = normalizeBulletLooseKey(skillName);

    const matchedChange = changes.find(change => {
      if (usedChanges.has(change.index)) return false;
      if (change.type === 'added') return false;
      if (change.id) return skill.id === change.id;
      return bulletMatchesChange(normalizedName, normalizedNameLoose, change);
    });

    if (!matchedChange) {
      result.push({
        ...skill,
        originalName: originalName || skillName,
        source: skill.source || 'user',
      });
      continue;
    }

    usedChanges.add(matchedChange.index);

    if (matchedChange.type === 'removed') {
      result.push({
        ...skill,
        name: originalName,
        originalName: originalName || skillName,
        source: 'removed',
      });
      continue;
    }

    // modified: rename the skill and optionally update category, preserve original
    const improvedName = normalizeBulletForStorage(matchedChange.improved);
    const newName = improvedName || skillName;
    const newCategory = matchedChange.category !== undefined ? matchedChange.category : skill.category;
    result.push({
      ...skill,
      name: newName,
      category: newCategory,
      originalName: originalName || skillName,
      source: newName === originalName && newCategory === skill.category ? (skill.source || 'user') : origin,
    });
  }

  // Apply additions
  const additions = changes.filter(
    change => !usedChanges.has(change.index) && change.type === 'added'
  );

  const existingNames = new Set(
    result.map(s => normalizeBulletForMatch(String(s.name || '')))
  );

  // Collect existing categories for fuzzy matching
  const existingCategories = [
    ...new Set(result.map(s => (s.category || '').trim()).filter(Boolean)),
  ];
  const defaultCategory = existingCategories[0] || 'General';

  /** Match an AI-provided category to an existing one (case-insensitive substring). */
  function resolveCategory(requested: string): string {
    const reqLower = requested.trim().toLowerCase();
    // Exact match (case-insensitive)
    const exact = existingCategories.find(c => c.toLowerCase() === reqLower);
    if (exact) return exact;
    // One contains the other (e.g. "Soft" ↔ "Soft Skills")
    const fuzzy = existingCategories.find(
      c => c.toLowerCase().includes(reqLower) || reqLower.includes(c.toLowerCase()),
    );
    if (fuzzy) return fuzzy;
    // No match — use as-is (new category)
    return requested.trim();
  }

  for (const addition of additions) {
    const raw = normalizeBulletForStorage(addition.improved || addition.original);
    if (!raw) {
      usedChanges.add(addition.index);
      continue;
    }

    // Parse "[Category] SkillName" bracket prefix if present
    const parsed = parseSkillCategoryPrefix(raw);
    const name = parsed ? parsed.name : raw;
    const category = parsed ? resolveCategory(parsed.category) : defaultCategory;

    const normalizedName = normalizeBulletForMatch(name);
    if (existingNames.has(normalizedName)) {
      usedChanges.add(addition.index);
      continue;
    }
    existingNames.add(normalizedName);
    usedChanges.add(addition.index);
    const newSkill: ResumeSkillItemV2 = {
      id: `skill-added-${addition.index}`,
      name,
      originalName: '',
      category,
      source: origin,
    };
    // Insert after the last skill with the same category to avoid duplicate category headers
    const categoryNorm = category.trim().toLowerCase();
    const lastPeerIndex = result.reduce(
      (last, s, idx) => ((s.category || '').trim().toLowerCase() === categoryNorm ? idx : last),
      -1,
    );
    if (lastPeerIndex >= 0) {
      result.splice(lastPeerIndex + 1, 0, newSkill);
    } else {
      result.push(newSkill);
    }
  }

  return { skills: result, usedChanges };
}

export function applyBulletChangesToResumeData(
  baseResumeData: ResumeDataV2,
  bulletChanges: BulletChange[],
  origin: ChangeOrigin,
  skillCategoryRenames?: Array<{ from: string; to: string }>,
): ResumeDataV2 {
  if ((!Array.isArray(bulletChanges) || bulletChanges.length === 0) && !skillCategoryRenames?.length) {
    return baseResumeData;
  }

  const normalizedChanges = normalizeBulletChanges(bulletChanges);
  const workScopedChanges = normalizedChanges.filter(change => change.section === 'work');
  const projectScopedChanges = normalizedChanges.filter(change => change.section === 'projects');
  const skillsScopedChanges = normalizedChanges.filter(change => change.section === 'skills');
  const summaryScopedChanges = normalizedChanges.filter(change => change.section === 'summary');
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

  const skillsResult = applyChangesToSkills(
    Array.isArray(baseResumeData.skills) ? baseResumeData.skills : [],
    skillsScopedChanges,
    origin,
    skillCategoryRenames,
  );

  let nextSummary = baseResumeData.summary;
  if (summaryScopedChanges.length) {
    const summaryChange = summaryScopedChanges.find(c => c.type === 'modified');
    if (summaryChange) {
      const improved = normalizeBulletForStorage(summaryChange.improved);
      if (improved) nextSummary = improved;
    }
  }

  return {
    ...baseResumeData,
    summary: nextSummary,
    work: workResult.work,
    projects: projectResult.projects,
    skills: skillsResult.skills,
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
