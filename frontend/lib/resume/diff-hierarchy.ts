import type { SectionViewModelRow } from './mappers';
import { normalizeWhitespace } from './normalize';

export type DiffHierarchyRow =
  | { id: string; type: 'spacer' }
  | { id: string; type: 'neutral'; text: string }
  | { id: string; type: 'added'; text: string; changeIndex: number }
  | { id: string; type: 'removed'; text: string; changeIndex: number }
  | {
      id: string;
      type: 'modified';
      original: string;
      improved: string;
      changeIndex: number;
    };

export type DiffHierarchyContentRow = Exclude<DiffHierarchyRow, { type: 'spacer' }>;
export type DiffHierarchyChangeRow = Exclude<DiffHierarchyContentRow, { type: 'neutral' }>;
export type DiffHierarchySectionKind = SectionViewModelRow['kind'];

export type DiffHierarchyNeutralRow = Extract<DiffHierarchyContentRow, { type: 'neutral' }>;

export type DiffHierarchyBlock =
  | {
      id: string;
      type: 'header';
      name?: string;
      title?: string;
      details: string[];
      nameRow?: DiffHierarchyNeutralRow;
      titleRow?: DiffHierarchyNeutralRow;
      detailRows: DiffHierarchyNeutralRow[];
      changes: DiffHierarchyChangeRow[];
    }
  | {
      id: string;
      type: 'entry';
      entryKind: 'work' | 'projects' | 'education' | 'awards' | 'custom';
      heading?: string;
      subheading?: string;
      meta: string[];
      headingRow?: DiffHierarchyNeutralRow;
      subheadingRow?: DiffHierarchyNeutralRow;
      metaRows: DiffHierarchyNeutralRow[];
      rows: DiffHierarchyContentRow[];
    }
  | {
      id: string;
      type: 'skills-category';
      title: string;
      rows: DiffHierarchyContentRow[];
    }
  | {
      id: string;
      type: 'summary-group';
      rows: DiffHierarchyContentRow[];
    }
  | {
      id: string;
      type: 'simple-list';
      listStyle: 'bulleted' | 'plain';
      rows: DiffHierarchyContentRow[];
    }
  | {
      id: string;
      type: 'unplaced-changes';
      rows: DiffHierarchyChangeRow[];
    };

const DATE_RANGE_TOKEN =
  '(?:present|current|now|\\d{4}|\\d{1,2}[/-]\\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*\\d{2,4})';

const DATE_RANGE_RE = new RegExp(
  `^\\s*${DATE_RANGE_TOKEN}(?:\\s*(?:-|–|—|to)\\s*${DATE_RANGE_TOKEN})?\\s*$`,
  'i'
);

const LOCATION_KEYWORD_RE = /^(remote|hybrid|on-site|onsite|worldwide)$/i;
const REMOTE_MIX_RE = /\b(remote|hybrid|on-site|onsite)\b/i;

export function isNeutralRow(row: DiffHierarchyRow): row is DiffHierarchyNeutralRow {
  return row.type === 'neutral';
}

export function isChangedRow(row: DiffHierarchyRow): row is DiffHierarchyChangeRow {
  return row.type !== 'spacer' && row.type !== 'neutral';
}

export function getComparableTextFromRow(row: DiffHierarchyContentRow): string {
  if (row.type === 'neutral') return normalizeWhitespace(row.text);
  if (row.type === 'modified') return normalizeWhitespace(row.improved || row.original);
  return normalizeWhitespace(row.text);
}

export function isDateRangeLike(text: string): boolean {
  return DATE_RANGE_RE.test(normalizeWhitespace(text));
}

export function isTechnologiesLine(text: string): boolean {
  return /^technologies\s*:/i.test(normalizeWhitespace(text));
}

export function isSkillCategoryLine(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized.endsWith(':')) return false;
  if (normalized.length > 48) return false;
  if (/[.!?]/.test(normalized)) return false;
  return true;
}

function looksSentenceLike(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return false;
  if (normalized.length > 90) return true;
  if (/[.!?]$/.test(normalized)) return true;
  return normalized.split(/\s+/).length > 10;
}

export function isLocationLike(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return false;
  if (LOCATION_KEYWORD_RE.test(normalized)) return true;
  if (REMOTE_MIX_RE.test(normalized) && normalized.length < 80) return true;
  if (normalized.includes(':')) return false;
  if (!normalized.includes(',')) return false;
  if (normalized.length > 80) return false;
  if (/[.!?]/.test(normalized)) return false;

  const segments = normalized
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (segments.length < 2 || segments.length > 4) return false;
  return segments.every(part => /^[\p{L}\p{N} .'-]{1,40}$/u.test(part));
}

function isChangedOnlyGroup(rows: DiffHierarchyContentRow[]): rows is DiffHierarchyChangeRow[] {
  return rows.length > 0 && rows.every(isChangedRow);
}

function splitRowsIntoGroups(rows: DiffHierarchyRow[]): DiffHierarchyContentRow[][] {
  const groups: DiffHierarchyContentRow[][] = [];
  let current: DiffHierarchyContentRow[] = [];

  rows.forEach(row => {
    if (row.type === 'spacer') {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      return;
    }
    current.push(row);
  });

  if (current.length) groups.push(current);
  return groups;
}

function isEntryMetaRow(
  kind: DiffHierarchySectionKind,
  text: string,
  options: { topIndex: number }
): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return false;

  if (isDateRangeLike(normalized) || isLocationLike(normalized) || isTechnologiesLine(normalized)) {
    return true;
  }

  if (/^(gpa|cgpa)\s*:/i.test(normalized)) return true;
  if (/^(issuer|issued by)\s*:/i.test(normalized)) return true;
  if (/^(url|website|repository|repo)\s*:/i.test(normalized)) return true;

  if ((kind === 'work' || kind === 'projects') && options.topIndex <= 2) {
    if (/^(full[- ]?time|part[- ]?time|contract|intern(ship)?|freelance)$/i.test(normalized)) {
      return true;
    }
  }

  if (kind === 'awards' && options.topIndex <= 2) {
    if (normalized.length <= 40 && !looksSentenceLike(normalized)) return true;
  }

  return false;
}

function buildUnplacedBlock(id: string, rows: DiffHierarchyChangeRow[]): DiffHierarchyBlock {
  return {
    id,
    type: 'unplaced-changes',
    rows,
  };
}

function buildSimpleListBlock(
  id: string,
  rows: DiffHierarchyContentRow[],
  listStyle: 'bulleted' | 'plain'
): DiffHierarchyBlock {
  if (isChangedOnlyGroup(rows)) {
    return buildUnplacedBlock(id, rows);
  }
  return {
    id,
    type: 'simple-list',
    listStyle,
    rows,
  };
}

function parseEntryLikeGroup(
  id: string,
  kind: 'work' | 'projects' | 'education' | 'awards' | 'custom',
  rows: DiffHierarchyContentRow[]
): DiffHierarchyBlock {
  if (!rows.length) {
    return { id, type: 'simple-list', listStyle: 'plain', rows: [] };
  }

  const first = rows[0];
  if (!first || !isNeutralRow(first)) {
    if (isChangedOnlyGroup(rows)) return buildUnplacedBlock(id, rows);
    return buildSimpleListBlock(id, rows, 'plain');
  }

  const heading = normalizeWhitespace(first.text);
  const remaining = rows.slice(1);

  let leadingNeutralCount = 0;
  while (
    leadingNeutralCount < remaining.length &&
    leadingNeutralCount < 4 &&
    isNeutralRow(remaining[leadingNeutralCount]!)
  ) {
    leadingNeutralCount += 1;
  }

  const leading = remaining.slice(0, leadingNeutralCount).filter(isNeutralRow);
  const consumed = new Set<number>();
  const meta: string[] = [];
  const metaRows: DiffHierarchyNeutralRow[] = [];

  leading.forEach((row, index) => {
    if (
      isEntryMetaRow(kind, row.text, {
        topIndex: index,
      })
    ) {
      meta.push(normalizeWhitespace(row.text));
      metaRows.push(row);
      consumed.add(index);
    }
  });

  let subheading: string | undefined;
  let subheadingRow: DiffHierarchyNeutralRow | undefined;
  for (let index = 0; index < leading.length; index += 1) {
    if (consumed.has(index)) continue;
    const text = normalizeWhitespace(leading[index]?.text || '');
    if (!text) {
      consumed.add(index);
      continue;
    }
    if (!looksSentenceLike(text) || kind === 'education' || kind === 'awards') {
      subheading = text;
      subheadingRow = leading[index];
      consumed.add(index);
    }
    break;
  }

  const leadingRemainder = leading.filter((_, index) => !consumed.has(index));
  const trailing = remaining.slice(leadingNeutralCount);
  const bodyRows = [...leadingRemainder, ...trailing];

  if (kind === 'custom' && !subheading && meta.length === 0 && bodyRows.length === 0 && looksSentenceLike(heading)) {
    return {
      id,
      type: 'summary-group',
      rows: [{ id: `${id}-line`, type: 'neutral', text: heading }],
    };
  }

  return {
    id,
    type: 'entry',
    entryKind: kind,
    heading,
    subheading,
    meta,
    headingRow: first,
    subheadingRow,
    metaRows,
    rows: bodyRows,
  };
}

function isEmbeddedEntryHeadingCandidate(
  kind: 'work' | 'projects' | 'education' | 'awards' | 'custom',
  row: DiffHierarchyContentRow
): row is DiffHierarchyNeutralRow {
  if (!isNeutralRow(row)) return false;
  if (kind !== 'work' && kind !== 'projects') return false;

  const text = normalizeWhitespace(row.text);
  if (!text) return false;
  if (isDateRangeLike(text) || isLocationLike(text) || isTechnologiesLine(text)) return false;
  if (looksSentenceLike(text)) return false;

  return true;
}

function hasDateLikeLookaheadWithinNextNeutralRows(
  rows: DiffHierarchyContentRow[],
  startIndex: number
): boolean {
  let neutralSeen = 0;

  for (let index = startIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    if (!isNeutralRow(row)) continue;

    neutralSeen += 1;
    if (isDateRangeLike(row.text)) return true;
    if (neutralSeen >= 2) return false;
  }

  return false;
}

function splitEntryLikeGroupByEmbeddedBoundaries(
  kind: 'work' | 'projects' | 'education' | 'awards' | 'custom',
  rows: DiffHierarchyContentRow[]
): DiffHierarchyContentRow[][] {
  if (!rows.length) return [];
  if (kind !== 'work' && kind !== 'projects') return [rows];

  const groups: DiffHierarchyContentRow[][] = [];
  let current: DiffHierarchyContentRow[] = [];

  rows.forEach((row, index) => {
    const shouldSplitHere =
      index > 0 &&
      current.length >= 2 &&
      isEmbeddedEntryHeadingCandidate(kind, row) &&
      hasDateLikeLookaheadWithinNextNeutralRows(rows, index);

    if (shouldSplitHere && current.length > 0) {
      groups.push(current);
      current = [row];
      return;
    }

    current.push(row);
  });

  if (current.length > 0) groups.push(current);
  return groups;
}

function buildEntryLikeBlocks(
  kind: 'work' | 'projects' | 'education' | 'awards' | 'custom',
  groups: DiffHierarchyContentRow[][]
): DiffHierarchyBlock[] {
  const segmentedGroups = groups.flatMap(group => splitEntryLikeGroupByEmbeddedBoundaries(kind, group));
  return segmentedGroups.map((group, index) => parseEntryLikeGroup(`group-${index + 1}`, kind, group));
}

function buildSkillsBlocks(groups: DiffHierarchyContentRow[][]): DiffHierarchyBlock[] {
  return groups.map((group, index) => {
    const first = group[0];
    // Neutral category header (unchanged)
    if (first && isNeutralRow(first) && isSkillCategoryLine(first.text)) {
      return {
        id: `skills-${index + 1}`,
        type: 'skills-category',
        title: normalizeWhitespace(first.text).replace(/:\s*$/, ''),
        rows: group.slice(1),
      };
    }
    // Renamed category header (modified row where the improved text is a category line)
    if (first && first.type === 'modified' && isSkillCategoryLine(first.improved)) {
      return {
        id: `skills-${index + 1}`,
        type: 'skills-category',
        title: normalizeWhitespace(first.improved).replace(/:\s*$/, ''),
        rows: group,
      };
    }
    // New category header (added row that looks like a category line)
    if (first && first.type === 'added' && isSkillCategoryLine(first.text)) {
      return {
        id: `skills-${index + 1}`,
        type: 'skills-category',
        title: normalizeWhitespace(first.text).replace(/:\s*$/, ''),
        rows: group.slice(1),
      };
    }
    // For skills, never produce unplaced-changes — always render as a bulleted list
    return {
      id: `skills-${index + 1}`,
      type: 'simple-list',
      listStyle: 'bulleted' as const,
      rows: group,
    };
  });
}

function buildSummaryBlocks(groups: DiffHierarchyContentRow[][]): DiffHierarchyBlock[] {
  return groups.map((group, index) => {
    if (isChangedOnlyGroup(group)) return buildUnplacedBlock(`summary-${index + 1}`, group);
    return {
      id: `summary-${index + 1}`,
      type: 'summary-group',
      rows: group,
    };
  });
}

function buildHeaderBlocks(groups: DiffHierarchyContentRow[][]): DiffHierarchyBlock[] {
  const allRows = groups.flat();
  if (!allRows.length) return [];

  const neutralRows = allRows.filter(isNeutralRow).filter(row => normalizeWhitespace(row.text));
  const changes = allRows.filter(isChangedRow);

  const [nameRow, titleRow, ...detailRows] = neutralRows;
  const name = nameRow ? normalizeWhitespace(nameRow.text) : undefined;
  const title = titleRow ? normalizeWhitespace(titleRow.text) : undefined;
  const details = detailRows.map(row => normalizeWhitespace(row.text));
  return [
    {
      id: 'header-profile',
      type: 'header',
      name,
      title,
      details,
      nameRow,
      titleRow,
      detailRows,
      changes,
    },
  ];
}

function buildCustomBlocks(groups: DiffHierarchyContentRow[][]): DiffHierarchyBlock[] {
  return groups.map((group, index) => {
    if (isChangedOnlyGroup(group)) return buildUnplacedBlock(`custom-${index + 1}`, group);

    const first = group[0];
    const neutralCount = group.filter(isNeutralRow).length;
    const hasChange = group.some(isChangedRow);

    if (first && isNeutralRow(first) && group.length >= 2 && (hasChange || neutralCount >= 3)) {
      return parseEntryLikeGroup(`custom-${index + 1}`, 'custom', group);
    }

    if (group.every(isNeutralRow) && group.some(row => looksSentenceLike(row.text))) {
      return {
        id: `custom-${index + 1}`,
        type: 'summary-group',
        rows: group,
      };
    }

    return buildSimpleListBlock(`custom-${index + 1}`, group, 'plain');
  });
}

function buildSimpleSectionBlocks(
  prefix: string,
  listStyle: 'bulleted' | 'plain',
  groups: DiffHierarchyContentRow[][]
): DiffHierarchyBlock[] {
  return groups.map((group, index) => buildSimpleListBlock(`${prefix}-${index + 1}`, group, listStyle));
}

export function buildHierarchicalSectionBlocks(
  sectionKind: DiffHierarchySectionKind,
  rows: DiffHierarchyRow[]
): DiffHierarchyBlock[] {
  const groups = splitRowsIntoGroups(rows);
  if (!groups.length) return [];

  switch (sectionKind) {
    case 'work':
    case 'projects':
    case 'education':
    case 'awards':
      return buildEntryLikeBlocks(sectionKind, groups);
    case 'skills':
      return buildSkillsBlocks(groups);
    case 'languages':
      return buildSimpleSectionBlocks('languages', 'bulleted', groups);
    case 'summary':
      return buildSummaryBlocks(groups);
    case 'header':
      return buildHeaderBlocks(groups);
    case 'custom':
    default:
      return buildCustomBlocks(groups);
  }
}
