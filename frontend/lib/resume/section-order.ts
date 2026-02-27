import type { ResumeExportSection } from '../types';

export const HEADER_SECTION_ORDER_KEY = 'canonical-header' as const;

const CANONICAL_SECTION_ORDER_KINDS = [
  'header',
  'summary',
  'work',
  'projects',
  'skills',
  'education',
  'awards',
  'languages',
] as const;

export const CANONICAL_SECTION_ORDER_KEYS = CANONICAL_SECTION_ORDER_KINDS.map(
  kind => `canonical-${kind}`
);

function pushUnique(
  target: string[],
  seen: Set<string>,
  available: Set<string>,
  key: string | undefined | null
) {
  if (!key || seen.has(key) || !available.has(key)) return;
  seen.add(key);
  target.push(key);
}

function normalizeAvailableKeys(availableKeys: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  availableKeys.forEach(key => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });
  return normalized;
}

export function canonicalSectionOrderKey(kind: string): string {
  return `canonical-${String(kind || '').trim()}`;
}

export function getSectionOrderKeyForExportSection(section: ResumeExportSection): string {
  if (section.kind === 'custom') return `custom-${section.id}`;
  return canonicalSectionOrderKey(section.kind);
}

export function normalizeSectionOrderKeys(
  availableKeys: readonly string[],
  requestedKeys?: readonly string[] | null,
  fallbackKeys: readonly string[] = CANONICAL_SECTION_ORDER_KEYS
): string[] {
  const available = normalizeAvailableKeys(availableKeys);
  if (!available.length) return [];

  const availableSet = new Set(available);
  const seen = new Set<string>();
  const ordered: string[] = [];

  pushUnique(ordered, seen, availableSet, HEADER_SECTION_ORDER_KEY);

  (Array.isArray(requestedKeys) ? requestedKeys : []).forEach(key => {
    if (key === HEADER_SECTION_ORDER_KEY) return;
    pushUnique(ordered, seen, availableSet, key);
  });

  (Array.isArray(fallbackKeys) ? fallbackKeys : []).forEach(key => {
    if (key === HEADER_SECTION_ORDER_KEY) return;
    pushUnique(ordered, seen, availableSet, key);
  });

  available.forEach(key => {
    if (key === HEADER_SECTION_ORDER_KEY) return;
    pushUnique(ordered, seen, availableSet, key);
  });

  if (availableSet.has(HEADER_SECTION_ORDER_KEY) && !ordered.includes(HEADER_SECTION_ORDER_KEY)) {
    ordered.unshift(HEADER_SECTION_ORDER_KEY);
  }

  return ordered;
}

export function applySectionOrderToItems<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  requestedKeys?: readonly string[] | null,
  fallbackKeys: readonly string[] = CANONICAL_SECTION_ORDER_KEYS
): T[] {
  if (items.length <= 1) return [...items];

  const buckets = new Map<string, T[]>();
  const availableKeys: string[] = [];

  items.forEach(item => {
    const key = getKey(item);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      availableKeys.push(key);
    }
    buckets.get(key)?.push(item);
  });

  const orderedKeys = normalizeSectionOrderKeys(availableKeys, requestedKeys, fallbackKeys);
  if (!orderedKeys.length) return [...items];

  const ordered: T[] = [];
  const emitted = new Set<string>();

  orderedKeys.forEach(key => {
    const bucket = buckets.get(key);
    if (!bucket || emitted.has(key)) return;
    ordered.push(...bucket);
    emitted.add(key);
  });

  items.forEach(item => {
    const key = getKey(item);
    if (emitted.has(key)) return;
    ordered.push(item);
    emitted.add(key);
  });

  return ordered;
}
