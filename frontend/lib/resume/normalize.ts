/**
 * Shared normalization and utility functions used across the resume module.
 *
 * Consolidates duplicate implementations that were previously scattered
 * across effective.ts, mappers.ts, pdf-selection.ts, diff-hierarchy.ts,
 * and inline-edits.ts.
 */

// ---------------------------------------------------------------------------
// Canonical section kind — the single authoritative definition
// ---------------------------------------------------------------------------

export type CanonicalSectionKind =
  | 'header'
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages';

// ---------------------------------------------------------------------------
// Whitespace / text helpers
// ---------------------------------------------------------------------------

/** Collapse runs of whitespace to a single space and trim. */
export function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Return a trimmed non-empty string, or `undefined`.
 * Accepts string | number; anything else returns `undefined`.
 */
export function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/** Lowercase + collapse whitespace — used for case-insensitive text matching. */
export function normalizeMatchText(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

// ---------------------------------------------------------------------------
// Section deduplication
// ---------------------------------------------------------------------------

/** Deduplicate an array of sections by id::kind::title composite key. */
export function dedupeSections<T extends { id: string; kind: string; title: string }>(
  sections: T[],
): T[] {
  const seen = new Set<string>();
  return sections.filter(section => {
    const key = `${section.id}::${section.kind}::${section.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
