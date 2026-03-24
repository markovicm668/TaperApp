import type {
  AiParsedMetaV2,
  ResumeAwardItemV2,
  ResumeDataV2,
  ResumeEducationItemV2,
  ResumeHighlightV2,
  ResumeLanguageItemV2,
  ResumeLocationV2,
  ResumeProfileV2,
  ResumeProjectItemV2,
  ResumeTechnologyV2,
  ResumeWorkItemV2,
} from '@resume-scanner/resume-contract';
import { nonEmpty, normalizeWhitespace } from './normalize';

type InlineEntrySection = 'work' | 'projects' | 'education' | 'awards';

type WorkEntrySlot = 'heading' | 'date' | 'location';
type ProjectEntrySlot = 'heading' | 'date' | 'technologies';
type EducationEntrySlot = 'institution' | 'degreeArea' | 'date' | 'location' | 'gpa' | 'honor';
type AwardEntrySlot = 'heading' | 'date' | 'summary';

export type ResumeInlineEditTarget =
  | { kind: 'item'; itemKey: string }
  | {
      kind: 'entry-slot';
      section: 'work';
      entryItemKey: string;
      slot: WorkEntrySlot;
    }
  | {
      kind: 'entry-slot';
      section: 'projects';
      entryItemKey: string;
      slot: ProjectEntrySlot;
    }
  | {
      kind: 'entry-slot';
      section: 'education';
      entryItemKey: string;
      slot: Exclude<EducationEntrySlot, 'honor'>;
    }
  | {
      kind: 'entry-slot';
      section: 'education';
      entryItemKey: string;
      slot: 'honor';
      index: number;
    }
  | {
      kind: 'entry-slot';
      section: 'awards';
      entryItemKey: string;
      slot: AwardEntrySlot;
    }
  | { kind: 'skills-category'; category: string };

export interface ResumeInlineEntryRef {
  section: InlineEntrySection;
  entryItemKey: string;
  entryToken: string;
}

type ParsedInlineItemKey =
  | { type: 'summary' }
  | { type: 'header-slot'; slot: 'name' | 'title' | 'location' | 'phone' | 'email' | 'url' }
  | { type: 'header-profile'; profileToken: string }
  | { type: 'work-highlight'; entryToken: string; highlightToken: string }
  | { type: 'project-description'; entryToken: string }
  | { type: 'project-highlight'; entryToken: string; highlightToken: string }
  | { type: 'skill'; skillToken: string }
  | { type: 'language'; languageToken: string }
  | { type: 'custom-line'; sectionId: string; lineIndex: number };

const NON_EMPTY_TOKEN_RE = /^(?:0|[1-9]\d*)$/;
const PRESENT_RE = /^(present|current|now)$/i;


function normalizeCategory(value: string | undefined): string {
  return normalizeWhitespace(value || 'General').toLowerCase();
}

function parseIndexToken(token: string): number | null {
  if (!NON_EMPTY_TOKEN_RE.test(token)) return null;
  const index = Number(token);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function findIndexByIdOrIndex<T extends { id?: string }>(items: T[] | undefined, token: string): number {
  const list = Array.isArray(items) ? items : [];
  const byIdIndex = list.findIndex(item => String(item?.id || '') === token);
  if (byIdIndex >= 0) return byIdIndex;
  const numericIndex = parseIndexToken(token);
  if (numericIndex === null) return -1;
  return numericIndex >= 0 && numericIndex < list.length ? numericIndex : -1;
}

function splitOnFirst(
  text: string,
  pattern: RegExp
): { left: string; right?: string } {
  const match = text.match(pattern);
  if (!match) return { left: text.trim() };
  return {
    left: String(match[1] || '').trim(),
    right: String(match[2] || '').trim(),
  };
}

function parseHeadingPair(text: string): { primary?: string; secondary?: string } {
  const parts = splitOnFirst(text, /^(.*?)(?:\s(?:-|–|—)\s)(.+)$/u);
  const primary = nonEmpty(parts.left);
  const secondary = nonEmpty(parts.right);
  return { primary, secondary };
}

function parseDateRange(text: string): { startDate?: string; endDate?: string; isCurrent?: boolean } {
  const parts = splitOnFirst(text, /^(.*?)(?:\s(?:-|–|—|to)\s)(.+)$/iu);
  const startDate = nonEmpty(parts.left);
  const endRaw = nonEmpty(parts.right);
  if (!endRaw) {
    return {
      startDate,
      endDate: undefined,
      isCurrent: false,
    };
  }
  if (PRESENT_RE.test(endRaw)) {
    return {
      startDate,
      endDate: undefined,
      isCurrent: true,
    };
  }
  return {
    startDate,
    endDate: endRaw,
    isCurrent: false,
  };
}

function parseLocationLine(text: string): ResumeLocationV2 | undefined {
  const normalized = nonEmpty(text);
  if (!normalized) return undefined;
  const parts = normalized
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;

  if (parts.length === 1) {
    return {
      city: parts[0],
      region: undefined,
      country: undefined,
      address: undefined,
      postalCode: undefined,
      countryCode: undefined,
    };
  }

  if (parts.length === 2) {
    return {
      city: parts[0],
      country: parts[1],
      region: undefined,
      address: undefined,
      postalCode: undefined,
      countryCode: undefined,
    };
  }

  return {
    city: parts[0],
    region: parts[1],
    country: parts.slice(2).join(', '),
    address: undefined,
    postalCode: undefined,
    countryCode: undefined,
  };
}

function parseDegreeAreaLine(text: string): { degree?: string; area?: string } {
  const parts = splitOnFirst(text, /^(.*?),(.+)$/u);
  const degree = nonEmpty(parts.left);
  const area = nonEmpty(parts.right);
  return {
    degree,
    area,
  };
}

function parseGpaLine(text: string): string | undefined {
  const normalized = String(text || '').replace(/^gpa\s*:\s*/i, '');
  return nonEmpty(normalized);
}

function parseTechnologyNames(text: string): string[] {
  const normalized = String(text || '').replace(/^technologies\s*:\s*/i, '');
  return normalized
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseLanguageLine(text: string): { language?: string; fluency?: string } {
  const parts = splitOnFirst(text, /^(.*?)(?:\s(?:-|–|—)\s)(.+)$/u);
  return {
    language: nonEmpty(parts.left),
    fluency: nonEmpty(parts.right),
  };
}

function parseHeaderProfileLine(
  text: string,
  existing: ResumeProfileV2 | undefined
): ResumeProfileV2 {
  const normalized = String(text || '').trim();
  const colonIndex = normalized.indexOf(':');
  if (colonIndex > -1) {
    const network = nonEmpty(normalized.slice(0, colonIndex));
    const url = nonEmpty(normalized.slice(colonIndex + 1));
    return {
      ...(existing || {}),
      network,
      url,
    };
  }

  return {
    ...(existing || {}),
    url: nonEmpty(normalized),
  };
}

function cloneArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

function updateAtIndex<T>(
  items: T[],
  index: number,
  update: (item: T) => T
): T[] {
  if (index < 0 || index >= items.length) return items;
  const nextItem = update(items[index] as T);
  if (Object.is(nextItem, items[index])) return items;
  const next = [...items];
  next[index] = nextItem;
  return next;
}

function updateParsedSectionLines(
  sections: AiParsedMetaV2['sections'] | AiParsedMetaV2['customSections'],
  sectionId: string,
  lineIndex: number,
  text: string
) {
  if (!Array.isArray(sections)) return sections;
  let changed = false;
  const nextSections = sections.map(section => {
    if (!section || section.id !== sectionId || section.kind !== 'custom') return section;
    if (!Array.isArray(section.lines) || lineIndex < 0 || lineIndex >= section.lines.length) return section;
    if (section.lines[lineIndex] === text) return section;
    const nextLines = [...section.lines];
    nextLines[lineIndex] = text;
    changed = true;
    return {
      ...section,
      lines: nextLines,
    };
  });
  return changed ? nextSections : sections;
}

function parseInlineItemKey(itemKey: string): ParsedInlineItemKey | null {
  if (itemKey === 'item:summary') return { type: 'summary' };

  const headerSlotMatch = itemKey.match(/^item:header:(name|title|location|phone|email|url)$/);
  if (headerSlotMatch) {
    return {
      type: 'header-slot',
      slot: headerSlotMatch[1] as 'name' | 'title' | 'location' | 'phone' | 'email' | 'url',
    };
  }

  const headerProfileMatch = itemKey.match(/^item:header:profile:(.+)$/);
  if (headerProfileMatch) {
    return {
      type: 'header-profile',
      profileToken: headerProfileMatch[1] || '',
    };
  }

  const workHighlightMatch = itemKey.match(/^item:work:highlight:([^:]+):(.+)$/);
  if (workHighlightMatch) {
    return {
      type: 'work-highlight',
      entryToken: workHighlightMatch[1] || '',
      highlightToken: workHighlightMatch[2] || '',
    };
  }

  const projectDescriptionMatch = itemKey.match(/^item:projects:description:(.+)$/);
  if (projectDescriptionMatch) {
    return {
      type: 'project-description',
      entryToken: projectDescriptionMatch[1] || '',
    };
  }

  const projectHighlightMatch = itemKey.match(/^item:projects:highlight:([^:]+):(.+)$/);
  if (projectHighlightMatch) {
    return {
      type: 'project-highlight',
      entryToken: projectHighlightMatch[1] || '',
      highlightToken: projectHighlightMatch[2] || '',
    };
  }

  const skillMatch = itemKey.match(/^item:skills:(.+)$/);
  if (skillMatch) {
    return {
      type: 'skill',
      skillToken: skillMatch[1] || '',
    };
  }

  const languageMatch = itemKey.match(/^item:languages:(.+)$/);
  if (languageMatch) {
    return {
      type: 'language',
      languageToken: languageMatch[1] || '',
    };
  }

  const customLineMatch = itemKey.match(/^item:custom:(.+):line:(\d+)$/);
  if (customLineMatch) {
    const lineIndex = parseIndexToken(customLineMatch[2] || '');
    if (lineIndex === null) return null;
    return {
      type: 'custom-line',
      sectionId: customLineMatch[1] || '',
      lineIndex,
    };
  }

  return null;
}

export function parseResumeInlineItemTarget(itemKey: string): ResumeInlineEditTarget | null {
  return parseInlineItemKey(itemKey) ? { kind: 'item', itemKey } : null;
}

export function parseResumeInlineEntryItemKey(itemKey: string): ResumeInlineEntryRef | null {
  const match = itemKey.match(/^item:(work|projects|education|awards):entry:(.+)$/);
  if (!match) return null;
  return {
    section: match[1] as InlineEntrySection,
    entryItemKey: itemKey,
    entryToken: match[2] || '',
  };
}

export function resumeInlineEditTargetKey(target: ResumeInlineEditTarget): string {
  if (target.kind === 'item') return `item:${target.itemKey}`;
  if (target.kind === 'skills-category') return `skills-category:${normalizeWhitespace(target.category)}`;
  return `entry:${target.section}:${target.entryItemKey}:${target.slot}${'index' in target ? `:${target.index}` : ''}`;
}

function applyHeaderSlotEdit(
  resumeData: ResumeDataV2,
  slot: 'name' | 'title' | 'location' | 'phone' | 'email' | 'url',
  text: string
): ResumeDataV2 {
  const basics = { ...(resumeData.basics || {}) };

  if (slot === 'location') {
    basics.location = parseLocationLine(text);
  } else if (slot === 'title') {
    basics.title = text;
  } else if (slot === 'name') {
    basics.name = text;
  } else if (slot === 'phone') {
    basics.phone = text;
  } else if (slot === 'email') {
    basics.email = text;
  } else {
    basics.url = text;
  }

  return {
    ...resumeData,
    basics,
  };
}

function applyHeaderProfileEdit(resumeData: ResumeDataV2, profileToken: string, text: string): ResumeDataV2 {
  const basics = { ...(resumeData.basics || {}) };
  const profiles = cloneArray(basics.profiles);
  const profileIndex = findIndexByIdOrIndex(profiles, profileToken);
  if (profileIndex < 0) return resumeData;

  const updatedProfiles = updateAtIndex(profiles, profileIndex, profile =>
    parseHeaderProfileLine(text, profile)
  );
  if (updatedProfiles === profiles) return resumeData;

  basics.profiles = updatedProfiles;
  return {
    ...resumeData,
    basics,
  };
}

function patchHighlightText(
  highlights: ResumeHighlightV2[] | undefined,
  highlightToken: string,
  text: string
): ResumeHighlightV2[] | undefined {
  const list = Array.isArray(highlights) ? highlights : [];
  const highlightIndex = findIndexByIdOrIndex(list, highlightToken);
  if (highlightIndex < 0) return highlights;
  return updateAtIndex(list, highlightIndex, highlight => ({
    ...highlight,
    text,
  }));
}

function patchWorkEntry(resumeData: ResumeDataV2, entryToken: string, update: (entry: ResumeWorkItemV2) => ResumeWorkItemV2): ResumeDataV2 {
  const entries = cloneArray(resumeData.work);
  const entryIndex = findIndexByIdOrIndex(entries, entryToken);
  if (entryIndex < 0) return resumeData;
  const updated = updateAtIndex(entries, entryIndex, update);
  if (updated === entries) return resumeData;
  return { ...resumeData, work: updated };
}

function patchProjectEntry(
  resumeData: ResumeDataV2,
  entryToken: string,
  update: (entry: ResumeProjectItemV2) => ResumeProjectItemV2
): ResumeDataV2 {
  const entries = cloneArray(resumeData.projects);
  const entryIndex = findIndexByIdOrIndex(entries, entryToken);
  if (entryIndex < 0) return resumeData;
  const updated = updateAtIndex(entries, entryIndex, update);
  if (updated === entries) return resumeData;
  return { ...resumeData, projects: updated };
}

function patchEducationEntry(
  resumeData: ResumeDataV2,
  entryToken: string,
  update: (entry: ResumeEducationItemV2) => ResumeEducationItemV2
): ResumeDataV2 {
  const entries = cloneArray(resumeData.education);
  const entryIndex = findIndexByIdOrIndex(entries, entryToken);
  if (entryIndex < 0) return resumeData;
  const updated = updateAtIndex(entries, entryIndex, update);
  if (updated === entries) return resumeData;
  return { ...resumeData, education: updated };
}

function patchAwardEntry(
  resumeData: ResumeDataV2,
  entryToken: string,
  update: (entry: ResumeAwardItemV2) => ResumeAwardItemV2
): ResumeDataV2 {
  const entries = cloneArray(resumeData.awards);
  const entryIndex = findIndexByIdOrIndex(entries, entryToken);
  if (entryIndex < 0) return resumeData;
  const updated = updateAtIndex(entries, entryIndex, update);
  if (updated === entries) return resumeData;
  return { ...resumeData, awards: updated };
}

function applyItemEdit(resumeData: ResumeDataV2, itemKey: string, text: string): ResumeDataV2 {
  const parsed = parseInlineItemKey(itemKey);
  if (!parsed) return resumeData;

  switch (parsed.type) {
    case 'summary':
      return { ...resumeData, summary: text };

    case 'header-slot':
      return applyHeaderSlotEdit(resumeData, parsed.slot, text);

    case 'header-profile':
      return applyHeaderProfileEdit(resumeData, parsed.profileToken, text);

    case 'work-highlight':
      return patchWorkEntry(resumeData, parsed.entryToken, entry => {
        const nextHighlights = patchHighlightText(entry.highlights, parsed.highlightToken, text);
        if (nextHighlights === entry.highlights) return entry;
        return {
          ...entry,
          highlights: Array.isArray(nextHighlights) ? nextHighlights : [],
        };
      });

    case 'project-description':
      return patchProjectEntry(resumeData, parsed.entryToken, entry => ({
        ...entry,
        description: text,
      }));

    case 'project-highlight':
      return patchProjectEntry(resumeData, parsed.entryToken, entry => {
        const nextHighlights = patchHighlightText(entry.highlights, parsed.highlightToken, text);
        if (nextHighlights === entry.highlights) return entry;
        return {
          ...entry,
          highlights: Array.isArray(nextHighlights) ? nextHighlights : [],
        };
      });

    case 'skill': {
      const skills = cloneArray(resumeData.skills);
      const skillIndex = findIndexByIdOrIndex(skills, parsed.skillToken);
      if (skillIndex < 0) return resumeData;
      const nextSkills = updateAtIndex(skills, skillIndex, skill => ({ ...skill, name: text }));
      if (nextSkills === skills) return resumeData;
      return { ...resumeData, skills: nextSkills };
    }

    case 'language': {
      const languages = cloneArray(resumeData.languages);
      const languageIndex = findIndexByIdOrIndex(languages, parsed.languageToken);
      if (languageIndex < 0) return resumeData;
      const parts = parseLanguageLine(text);
      const nextLanguages = updateAtIndex(languages, languageIndex, (language: ResumeLanguageItemV2) => ({
        ...language,
        language: parts.language,
        fluency: parts.fluency,
      }));
      if (nextLanguages === languages) return resumeData;
      return { ...resumeData, languages: nextLanguages };
    }

    case 'custom-line': {
      const customSections = cloneArray(resumeData.customSections);
      const sectionIndex = customSections.findIndex(section => String(section?.id || '') === parsed.sectionId);
      if (sectionIndex < 0) return resumeData;
      const section = customSections[sectionIndex];
      if (!section) return resumeData;
      if (!Array.isArray(section.items) || parsed.lineIndex < 0 || parsed.lineIndex >= section.items.length) {
        return resumeData;
      }
      const nextItems = updateAtIndex(section.items, parsed.lineIndex, item => ({ ...item, text }));
      if (nextItems === section.items) return resumeData;
      const nextSections = [...customSections];
      nextSections[sectionIndex] = {
        ...section,
        items: nextItems,
      };
      return {
        ...resumeData,
        customSections: nextSections,
      };
    }

    default:
      return resumeData;
  }
}

function applyEntrySlotEdit(resumeData: ResumeDataV2, target: Extract<ResumeInlineEditTarget, { kind: 'entry-slot' }>, text: string): ResumeDataV2 {
  const entryRef = parseResumeInlineEntryItemKey(target.entryItemKey);
  if (!entryRef || entryRef.section !== target.section) return resumeData;

  switch (target.section) {
    case 'work':
      return patchWorkEntry(resumeData, entryRef.entryToken, entry => {
        if (target.slot === 'heading') {
          const pair = parseHeadingPair(text);
          return {
            ...entry,
            position: pair.primary,
            company: pair.secondary,
          };
        }
        if (target.slot === 'date') {
          const range = parseDateRange(text);
          return {
            ...entry,
            startDate: range.startDate,
            endDate: range.endDate,
            isCurrent: Boolean(range.isCurrent),
          };
        }
        return {
          ...entry,
          location: parseLocationLine(text),
        };
      });

    case 'projects':
      return patchProjectEntry(resumeData, entryRef.entryToken, entry => {
        if (target.slot === 'heading') {
          const pair = parseHeadingPair(text);
          return {
            ...entry,
            name: pair.primary,
            role: pair.secondary,
          };
        }
        if (target.slot === 'date') {
          const range = parseDateRange(text);
          return {
            ...entry,
            startDate: range.startDate,
            endDate: range.endDate,
          };
        }
        const names = parseTechnologyNames(text);
        const existing = Array.isArray(entry.technologies) ? entry.technologies : [];
        const technologies: ResumeTechnologyV2[] = names.map((name, index) => ({
          ...(existing[index] || {}),
          name,
        }));
        return {
          ...entry,
          technologies,
        };
      });

    case 'education':
      return patchEducationEntry(resumeData, entryRef.entryToken, entry => {
        switch (target.slot) {
          case 'institution':
            return { ...entry, institution: text };
          case 'degreeArea': {
            const parts = parseDegreeAreaLine(text);
            return {
              ...entry,
              degree: parts.degree,
              area: parts.area,
            };
          }
          case 'date': {
            const range = parseDateRange(text);
            return {
              ...entry,
              startDate: range.startDate,
              endDate: range.endDate,
            };
          }
          case 'location':
            return {
              ...entry,
              location: parseLocationLine(text),
            };
          case 'gpa':
            return {
              ...entry,
              gpa: parseGpaLine(text),
            };
          case 'honor': {
            const honors = cloneArray(entry.honors);
            if (target.index < 0 || target.index >= honors.length) return entry;
            const nextHonors = [...honors];
            nextHonors[target.index] = text;
            return {
              ...entry,
              honors: nextHonors,
            };
          }
          default:
            return entry;
        }
      });

    case 'awards':
      return patchAwardEntry(resumeData, entryRef.entryToken, entry => {
        if (target.slot === 'heading') {
          const pair = parseHeadingPair(text);
          return {
            ...entry,
            title: pair.primary,
            issuer: pair.secondary,
          };
        }
        if (target.slot === 'date') {
          return {
            ...entry,
            date: text,
          };
        }
        return {
          ...entry,
          summary: text,
        };
      });

    default:
      return resumeData;
  }
}

function applySkillsCategoryEdit(resumeData: ResumeDataV2, category: string, text: string): ResumeDataV2 {
  const skills = cloneArray(resumeData.skills);
  if (!skills.length) return resumeData;

  const matchCategory = normalizeCategory(category);
  let changed = false;
  const nextSkills = skills.map(skill => {
    const currentCategory = normalizeCategory(skill.category);
    if (currentCategory !== matchCategory) return skill;
    changed = true;
    return {
      ...skill,
      category: text,
    };
  });

  if (!changed) return resumeData;
  return {
    ...resumeData,
    skills: nextSkills,
  };
}

export function applyInlineEditToResumeData(
  resumeData: ResumeDataV2,
  target: ResumeInlineEditTarget,
  rawText: string
): ResumeDataV2 {
  const text = nonEmpty(rawText);
  if (!text) return resumeData;

  if (target.kind === 'item') {
    return applyItemEdit(resumeData, target.itemKey, text);
  }
  if (target.kind === 'skills-category') {
    return applySkillsCategoryEdit(resumeData, target.category, text);
  }
  return applyEntrySlotEdit(resumeData, target, text);
}

export function applyInlineEditToParsedMeta(
  parsedMeta: AiParsedMetaV2 | null,
  target: ResumeInlineEditTarget,
  rawText: string
): AiParsedMetaV2 | null {
  if (!parsedMeta) return parsedMeta;
  const text = nonEmpty(rawText);
  if (!text) return parsedMeta;
  if (target.kind !== 'item') return parsedMeta;

  const parsed = parseInlineItemKey(target.itemKey);
  if (!parsed || parsed.type !== 'custom-line') return parsedMeta;

  const nextSections = updateParsedSectionLines(parsedMeta.sections, parsed.sectionId, parsed.lineIndex, text);
  const nextCustomSections = updateParsedSectionLines(
    parsedMeta.customSections,
    parsed.sectionId,
    parsed.lineIndex,
    text
  );

  if (nextSections === parsedMeta.sections && nextCustomSections === parsedMeta.customSections) {
    return parsedMeta;
  }

  return {
    ...parsedMeta,
    sections: nextSections,
    customSections: nextCustomSections,
  };
}

export const __private__ = {
  parseInlineItemKey,
  parseDateRange,
  parseHeadingPair,
  parseLocationLine,
  parseDegreeAreaLine,
  parseGpaLine,
  parseTechnologyNames,
  parseLanguageLine,
  parseHeaderProfileLine,
};
