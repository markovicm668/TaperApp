import type { BulletChange } from './types';

export type NormalizedChange = {
  index: number;
  type: BulletChange['type'];
  section: string;
  original: string;
  improved: string;
  normalizedOriginal: string;
};

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
const normalizeSectionName = (text: string) =>
  normalizeText(text).replace(/[:]+$/, '').toLowerCase();
const stripBulletPrefix = (text: string) => text.replace(/^[-*\u2022]\s*/, '').trim();
export const normalizeLine = (text: string) =>
  normalizeText(stripBulletPrefix(text)).toLowerCase();

const BULLET_PREFIX_RE = /^(\s*[-*\u2022]\s+)/;

const isLineMatch = (normalizedLine: string, change: NormalizedChange) => {
  if (!change.normalizedOriginal) return false;
  return (
    normalizedLine === change.normalizedOriginal ||
    normalizedLine.includes(change.normalizedOriginal) ||
    change.normalizedOriginal.includes(normalizedLine)
  );
};

const replaceOnceIgnoreCase = (source: string, search: string, replacement: string) => {
  const sourceLower = source.toLowerCase();
  const searchLower = search.toLowerCase();
  const index = sourceLower.indexOf(searchLower);
  if (index === -1) return { text: source, replaced: false };
  return {
    text: `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`,
    replaced: true,
  };
};

const cleanupText = (text: string) =>
  text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();

export const applyBulletChangesToText = (
  resumeText: string,
  changes: BulletChange[]
) => {
  if (!resumeText.trim() || changes.length === 0) {
    return { updatedText: resumeText, appliedCount: 0 };
  }

  const normalizedChanges: NormalizedChange[] = changes.map((change, index) => ({
    index,
    type: change.type,
    section: normalizeSectionName(change.section || ''),
    original: change.original || '',
    improved: change.improved || '',
    normalizedOriginal: normalizeLine(change.original || ''),
  }));

  const used = new Set<number>();
  const lines = resumeText.split(/\r?\n/);
  const updatedLines: string[] = [];
  let appliedCount = 0;

  lines.forEach(line => {
    if (!line.trim()) {
      updatedLines.push(line);
      return;
    }

    const normalizedLine = normalizeLine(line);
    if (!normalizedLine) {
      updatedLines.push(line);
      return;
    }

    const match = normalizedChanges.find(
      change =>
        !used.has(change.index) &&
        change.type !== 'added' &&
        isLineMatch(normalizedLine, change)
    );

    if (!match) {
      updatedLines.push(line);
      return;
    }

    used.add(match.index);

    if (match.type === 'removed') {
      appliedCount += 1;
      return;
    }

    if (match.type === 'modified') {
      const improved = stripBulletPrefix(match.improved).trim();
      if (!improved) {
        updatedLines.push(line);
        return;
      }

      const prefixMatch = line.match(BULLET_PREFIX_RE);
      const prefix = prefixMatch ? prefixMatch[1] : line.match(/^(\s*)/)?.[1] ?? '';
      updatedLines.push(`${prefix}${improved}`);
      appliedCount += 1;
      return;
    }

    updatedLines.push(line);
  });

  const sectionNames = new Set(
    normalizedChanges
      .map(change => change.section)
      .filter(section => section.length > 0)
  );

  const headers: Array<{ name: string; index: number }> = [];
  const seenHeaders = new Set<string>();

  updatedLines.forEach((line, index) => {
    const normalized = normalizeSectionName(line);
    if (sectionNames.has(normalized) && !seenHeaders.has(normalized)) {
      headers.push({ name: normalized, index });
      seenHeaders.add(normalized);
    }
  });

  const ranges = new Map<string, { start: number; end: number }>();
  headers.forEach((header, idx) => {
    const nextHeader = headers[idx + 1];
    ranges.set(header.name, {
      start: header.index + 1,
      end: nextHeader ? nextHeader.index : updatedLines.length,
    });
  });

  const addedBySection = new Map<string, NormalizedChange[]>();
  normalizedChanges.forEach(change => {
    if (change.type !== 'added') return;
    const key = change.section || '__unassigned__';
    const bucket = addedBySection.get(key) ?? [];
    bucket.push(change);
    addedBySection.set(key, bucket);
  });

  const sectionInsertions = Array.from(addedBySection.entries())
    .map(([section, items]) => {
      const header = headers.find(item => item.name === section);
      return { section, items, headerIndex: header?.index };
    })
    .sort((a, b) => {
      if (a.headerIndex === undefined && b.headerIndex === undefined) return 0;
      if (a.headerIndex === undefined) return 1;
      if (b.headerIndex === undefined) return -1;
      return b.headerIndex - a.headerIndex;
    });

  sectionInsertions.forEach(({ section, items }) => {
    const range = ranges.get(section);
    let insertAt = updatedLines.length;
    let prefix = '- ';

    if (range) {
      for (let i = range.start; i < range.end; i += 1) {
        const match = updatedLines[i]?.match(BULLET_PREFIX_RE);
        if (match) {
          prefix = match[1];
          break;
        }
      }

      let lastContentIndex = -1;
      for (let i = range.end - 1; i >= range.start; i -= 1) {
        if (updatedLines[i]?.trim()) {
          lastContentIndex = i;
          break;
        }
      }

      insertAt = lastContentIndex >= 0 ? lastContentIndex + 1 : range.start;
    }

    const linesToInsert = items
      .map(change => {
        const text = (change.improved || change.original || '').trim();
        if (!text) return null;
        return `${prefix}${stripBulletPrefix(text)}`;
      })
      .filter((value): value is string => Boolean(value));

    if (linesToInsert.length) {
      updatedLines.splice(insertAt, 0, ...linesToInsert);
      appliedCount += linesToInsert.length;
    }
  });

  let updatedText = updatedLines.join('\n');

  normalizedChanges.forEach(change => {
    if (used.has(change.index) || change.type === 'added') return;
    if (!change.original) return;

    if (change.type === 'modified') {
      const improved = change.improved.trim();
      if (!improved) return;
      const result = replaceOnceIgnoreCase(updatedText, change.original, improved);
      if (result.replaced) {
        updatedText = result.text;
        used.add(change.index);
        appliedCount += 1;
      }
      return;
    }

    if (change.type === 'removed') {
      const result = replaceOnceIgnoreCase(updatedText, change.original, '');
      if (result.replaced) {
        updatedText = result.text;
        used.add(change.index);
        appliedCount += 1;
      }
    }
  });

  updatedText = cleanupText(updatedText);

  return { updatedText, appliedCount };
};