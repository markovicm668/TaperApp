'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Edit3 } from 'lucide-react';
import type { BulletChange } from '@/lib/types';
import type { SectionViewModelRow } from '@/lib/resume/mappers';
import {
  buildHierarchicalSectionBlocks,
  type DiffHierarchyBlock,
  type DiffHierarchyChangeRow,
  type DiffHierarchyContentRow,
  type DiffHierarchyNeutralRow,
  isDateRangeLike,
  isLocationLike,
  isTechnologiesLine,
} from '@/lib/resume/diff-hierarchy';
import type {
  PdfSelectionModel,
  PdfSelectionOverrides,
} from '@/lib/resume/pdf-selection';
import {
  getPdfItemCheckState,
  getPdfSectionCheckState,
} from '@/lib/resume/pdf-selection';
import {
  parseResumeInlineEntryItemKey,
  parseResumeInlineItemTarget,
  resumeInlineEditTargetKey,
  type ResumeInlineEditTarget,
} from '@/lib/resume/inline-edits';
import { useTargetRole } from '@/lib/resume/selectors';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface DiffViewProps {
  hasOriginal: boolean;
  changes: BulletChange[];
  onChangesUpdate?: (changes: BulletChange[]) => void;
  onInlineEdit?: (target: ResumeInlineEditTarget, text: string) => void;
  pdfSelectionModel?: PdfSelectionModel | null;
  pdfSelectionOverrides?: PdfSelectionOverrides;
  onPdfToggleItem?: (itemKey: string, checked: boolean) => void;
}

type IndexedChange = {
  index: number;
  change: BulletChange;
  sectionKey: string;
  normalizedOriginal: string;
  normalizedImproved: string;
};

type RenderRow =
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

type SectionRenderModel = {
  id: string;
  title: string;
  kind: SectionViewModelRow['kind'];
  changed: boolean;
  changeCount: number;
  rows: RenderRow[];
};

type CheckState = 'checked' | 'unchecked' | 'indeterminate';

type ActiveEditState =
  | { kind: 'change'; changeIndex: number }
  | { kind: 'inline'; target: ResumeInlineEditTarget };

type SectionSelectionContext = {
  sectionKey: string;
  headerItemKeys: string[];
  summaryItemKeys: string[];
  skillItemKeys: string[];
  languageItemKeys: string[];
  customLineItemKeys: string[];
  entryQueues: Record<'work' | 'projects' | 'education' | 'awards', string[]>;
  highlightQueuesByEntry: Record<string, string[]>;
};

type HeaderItemKind =
  | 'name'
  | 'title'
  | 'email'
  | 'phone'
  | 'location'
  | 'url'
  | 'profile'
  | 'unknown';

type HeaderDisplayItem = {
  itemKey: string;
  label: string;
  kind: HeaderItemKind;
  sourceIndex: number;
};

function TriStateCheckbox({
  state,
  disabled,
  ariaLabel,
  onChange,
}: {
  state: CheckState;
  disabled?: boolean;
  ariaLabel: string;
  onChange?: (checked: boolean) => void;
}) {
  const isChecked = state === 'checked';
  const isIndeterminate = state === 'indeterminate';
  const filled = isChecked || isIndeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isIndeterminate ? 'mixed' : isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        if (disabled) return;
        onChange?.(!isChecked);
      }}
      className={cn(
        'inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-[1.5px] p-0 transition-colors',
        filled ? 'border-primary bg-primary' : 'border-[#c7d0df] bg-white',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      )}
    >
      {isChecked && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {isIndeterminate && <span className="block h-[2px] w-[10px] rounded-full bg-white" />}
    </button>
  );
}

const LIST_PREFIX_RE = /^\s*(?:[-*•●▪◦–—−]|(?:\(?\d{1,3}[.)]))\s+/u;

function stripListPrefix(value: string): string {
  return String(value || '').replace(LIST_PREFIX_RE, '').trim();
}

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSectionLabel(value: string): string {
  return normalizeWhitespace(value).replace(/[:]+$/, '').toLowerCase();
}

function normalizeLineForMatch(value: string): string {
  return normalizeWhitespace(stripListPrefix(value)).toLowerCase();
}

function isLineMatch(normalizedLine: string, normalizedTarget: string): boolean {
  if (!normalizedLine || !normalizedTarget) return false;
  return (
    normalizedLine === normalizedTarget ||
    normalizedLine.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedLine)
  );
}

function toSectionKeyFromLabel(value: string | undefined): string {
  const normalized = normalizeSectionLabel(value || '');
  if (!normalized) return 'work';
  if (normalized === 'header') return 'header';
  if (/(summary|profile|objective|about)/.test(normalized)) return 'summary';
  if (
    normalized === 'experience' ||
    normalized === 'work' ||
    normalized === 'professional experience' ||
    normalized === 'employment' ||
    normalized === 'work history'
  ) {
    return 'work';
  }
  if (/(projects?|portfolio)/.test(normalized)) return 'projects';
  if (/(skills?|competenc|tech stack|technolog)/.test(normalized)) return 'skills';
  if (/(education|academic)/.test(normalized)) return 'education';
  if (/(awards?|achievements?|honors?)/.test(normalized)) return 'awards';
  if (/(languages?)/.test(normalized)) return 'languages';
  return `custom:${normalized}`;
}

function isRenderableFinalRow(row: DiffHierarchyContentRow | RenderRow): boolean {
  return row.type !== 'spacer' && row.type !== 'removed';
}

function rowTextsForItemMatch(row: DiffHierarchyContentRow | RenderRow): string[] {
  if (row.type === 'spacer' || row.type === 'removed') return [];
  if (row.type === 'modified') return [row.improved, row.original].filter(Boolean);
  return [row.text];
}

function createSectionSelectionContext(
  sectionId: string,
  model: PdfSelectionModel | null | undefined
): SectionSelectionContext | null {
  if (!model) return null;
  const section = model.sections[sectionId];
  if (!section) return null;

  const ctx: SectionSelectionContext = {
    sectionKey: sectionId,
    headerItemKeys: [],
    summaryItemKeys: [],
    skillItemKeys: [],
    languageItemKeys: [],
    customLineItemKeys: [],
    entryQueues: {
      work: [],
      projects: [],
      education: [],
      awards: [],
    },
    highlightQueuesByEntry: {},
  };

  section.itemKeys.forEach(itemKey => {
    const item = model.items[itemKey];
    if (!item) return;
    switch (item.kind) {
      case 'header-slot':
        ctx.headerItemKeys.push(itemKey);
        break;
      case 'summary':
        ctx.summaryItemKeys.push(itemKey);
        break;
      case 'skill':
        ctx.skillItemKeys.push(itemKey);
        break;
      case 'language':
        ctx.languageItemKeys.push(itemKey);
        break;
      case 'custom-line':
        ctx.customLineItemKeys.push(itemKey);
        break;
      case 'work-entry':
        ctx.entryQueues.work.push(itemKey);
        break;
      case 'project-entry':
        ctx.entryQueues.projects.push(itemKey);
        break;
      case 'education-entry':
        ctx.entryQueues.education.push(itemKey);
        break;
      case 'award-entry':
        ctx.entryQueues.awards.push(itemKey);
        break;
      case 'work-highlight':
      case 'project-highlight':
        if (!item.parentKey) break;
        if (!ctx.highlightQueuesByEntry[item.parentKey]) {
          ctx.highlightQueuesByEntry[item.parentKey] = [];
        }
        ctx.highlightQueuesByEntry[item.parentKey]!.push(itemKey);
        break;
      default:
        break;
    }
  });

  return ctx;
}

function consumeNext(queue: string[]): string | undefined {
  return queue.length ? queue.shift() : undefined;
}

function consumeMatchingItemKey(
  queue: string[],
  row: DiffHierarchyContentRow | RenderRow,
  model: PdfSelectionModel | null | undefined
): string | undefined {
  if (!model || !queue.length || !isRenderableFinalRow(row)) return undefined;
  const rowMatchValues = rowTextsForItemMatch(row)
    .map(value => normalizeLineForMatch(value))
    .filter(Boolean);
  if (!rowMatchValues.length) return undefined;

  const matchIndex = queue.findIndex(itemKey => {
    const item = model.items[itemKey];
    const targets = (item?.matchTexts || [])
      .map(text => normalizeLineForMatch(text))
      .filter(Boolean);
    if (!targets.length) return false;
    return rowMatchValues.some(rowValue => targets.some(target => isLineMatch(rowValue, target)));
  });

  if (matchIndex < 0) return undefined;
  const [matchedKey] = queue.splice(matchIndex, 1);
  return matchedKey;
}

function consumeSequentialItemKey(queue: string[], row: DiffHierarchyContentRow | RenderRow): string | undefined {
  if (!queue.length || !isRenderableFinalRow(row)) return undefined;
  return consumeNext(queue);
}

function consumeSkillItemKey(
  queue: string[],
  row: DiffHierarchyContentRow | RenderRow,
  model: PdfSelectionModel | null | undefined
): string | undefined {
  if (!queue.length || row.type === 'spacer') return undefined;
  if (row.type === 'removed') {
    if (!model) return undefined;
    const rowText = normalizeLineForMatch(row.text);
    if (!rowText) return undefined;
    const matchIndex = queue.findIndex(key => {
      const item = model.items[key];
      return (item?.matchTexts || []).some(mt => isLineMatch(rowText, normalizeLineForMatch(mt)));
    });
    if (matchIndex < 0) return undefined;
    return queue.splice(matchIndex, 1)[0];
  }
  return consumeNext(queue);
}

function parseHeaderItemKind(itemKey: string): HeaderItemKind {
  const slotMatch = itemKey.match(/^item:header:(name|title|location|phone|email|url)$/);
  if (slotMatch) {
    return slotMatch[1] as Exclude<HeaderItemKind, 'profile' | 'unknown'>;
  }
  if (/^item:header:profile:/.test(itemKey)) return 'profile';
  return 'unknown';
}

function headerItemSortRank(kind: HeaderItemKind): number {
  switch (kind) {
    case 'name':
      return 0;
    case 'title':
      return 1;
    case 'email':
      return 2;
    case 'phone':
      return 3;
    case 'location':
      return 4;
    case 'url':
      return 5;
    case 'profile':
      return 6;
    default:
      return 99;
  }
}

function buildOrderedHeaderDisplayItems(
  itemKeys: string[],
  model: PdfSelectionModel | null | undefined
): HeaderDisplayItem[] {
  if (!model || itemKeys.length === 0) return [];

  return itemKeys
    .map((itemKey, sourceIndex) => {
      const item = model.items[itemKey];
      return {
        itemKey,
        label: String(item?.label || itemKey),
        kind: parseHeaderItemKind(itemKey),
        sourceIndex,
      } satisfies HeaderDisplayItem;
    })
    .sort((a, b) => {
      const rankDelta = headerItemSortRank(a.kind) - headerItemSortRank(b.kind);
      if (rankDelta !== 0) return rankDelta;
      return a.sourceIndex - b.sourceIndex;
    });
}

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function titleFromSectionKey(key: string): string {
  if (key === 'header') return 'Header';
  if (key === 'summary') return 'Summary';
  if (key === 'work') return 'Professional Experience';
  if (key === 'projects') return 'Projects';
  if (key === 'skills') return 'Skills';
  if (key === 'education') return 'Education';
  if (key === 'awards') return 'Achievements';
  if (key === 'languages') return 'Languages';
  if (key.startsWith('custom:')) {
    return titleCase(key.slice('custom:'.length));
  }
  return titleCase(key);
}

function sectionKindFromSectionKey(key: string): SectionViewModelRow['kind'] {
  if (
    key === 'header' ||
    key === 'summary' ||
    key === 'work' ||
    key === 'projects' ||
    key === 'skills' ||
    key === 'education' ||
    key === 'awards' ||
    key === 'languages'
  ) {
    return key;
  }
  return 'custom';
}

function buildSectionRows(updatedLines: string[], sectionChanges: IndexedChange[]): RenderRow[] {
  const modifiedQueue = sectionChanges.filter(item => item.change.type === 'modified');
  const addedQueue = sectionChanges.filter(item => item.change.type === 'added');
  const removedQueue = sectionChanges.filter(item => item.change.type === 'removed');
  const rows: RenderRow[] = [];

  updatedLines.forEach((line, lineIndex) => {
    if (!line.trim()) {
      rows.push({ id: `space-${lineIndex}`, type: 'spacer' });
      return;
    }

    const normalizedLine = normalizeLineForMatch(line);
    const modifiedMatchIndex = modifiedQueue.findIndex(item =>
      isLineMatch(normalizedLine, item.normalizedImproved || item.normalizedOriginal)
    );
    if (modifiedMatchIndex >= 0) {
      const [match] = modifiedQueue.splice(modifiedMatchIndex, 1);
      if (match) {
        rows.push({
          id: `mod-${match.index}-${lineIndex}`,
          type: 'modified',
          original: match.change.original,
          improved: match.change.improved,
          changeIndex: match.index,
        });
        return;
      }
    }

    const addedMatchIndex = addedQueue.findIndex(item =>
      isLineMatch(normalizedLine, item.normalizedImproved || item.normalizedOriginal)
    );
    if (addedMatchIndex >= 0) {
      const [match] = addedQueue.splice(addedMatchIndex, 1);
      if (match) {
        rows.push({
          id: `add-${match.index}-${lineIndex}`,
          type: 'added',
          text: line,
          changeIndex: match.index,
        });
        return;
      }
    }

    const removedMatchIndex = removedQueue.findIndex(item =>
      isLineMatch(normalizedLine, item.normalizedOriginal)
    );
    if (removedMatchIndex >= 0) {
      const [match] = removedQueue.splice(removedMatchIndex, 1);
      if (match) {
        rows.push({
          id: `rem-${match.index}-${lineIndex}`,
          type: 'removed',
          text: match.change.original,
          changeIndex: match.index,
        });
        return;
      }
    }

    rows.push({ id: `line-${lineIndex}`, type: 'neutral', text: line });
  });

  removedQueue.forEach((item, idx) => {
    rows.push({
      id: `flush-remove-${item.index}-${idx}`,
      type: 'removed',
      text: item.change.original,
      changeIndex: item.index,
    });
  });

  modifiedQueue.forEach((item, idx) => {
    rows.push({
      id: `flush-mod-${item.index}-${idx}`,
      type: 'modified',
      original: item.change.original,
      improved: item.change.improved,
      changeIndex: item.index,
    });
  });

  addedQueue.forEach((item, idx) => {
    rows.push({
      id: `flush-add-${item.index}-${idx}`,
      type: 'added',
      text: item.change.improved || item.change.original,
      changeIndex: item.index,
    });
  });

  return rows;
}

export function DiffView({
  hasOriginal,
  changes,
  onChangesUpdate,
  onInlineEdit,
  pdfSelectionModel = null,
  pdfSelectionOverrides = {},
  onPdfToggleItem,
}: DiffViewProps) {
  const targetRole = useTargetRole();
  const normalizedTargetRole = useMemo(
    () => normalizeLineForMatch(targetRole || ''),
    [targetRole],
  );
  const [localChanges, setLocalChanges] = useState<BulletChange[]>(changes);
  const [activeEdit, setActiveEdit] = useState<ActiveEditState | null>(null);
  const [draftText, setDraftText] = useState('');
  // `null` means expansion state has not been initialized for the current populated view yet.
  const [expandedSections, setExpandedSections] = useState<Set<string> | null>(null);

  const sectionModels = useMemo<SectionRenderModel[]>(() => {
    const indexedChanges: IndexedChange[] = localChanges.map((change, index) => ({
      index,
      change,
      sectionKey: toSectionKeyFromLabel(change.section),
      normalizedOriginal: normalizeLineForMatch(change.original),
      normalizedImproved: normalizeLineForMatch(change.improved),
    }));

    const changesBySection = new Map<string, IndexedChange[]>();
    indexedChanges.forEach(item => {
      const bucket = changesBySection.get(item.sectionKey) || [];
      bucket.push(item);
      changesBySection.set(item.sectionKey, bucket);
    });

    const consumedKeys = new Set<string>();
    const mappedSections: SectionRenderModel[] = [];

    if (pdfSelectionModel) {
      pdfSelectionModel.sectionOrder.forEach(sectionId => {
        const section = pdfSelectionModel.sections[sectionId];
        if (!section) return;

        const sectionKey =
          section.kind === 'custom' && section.title
            ? `custom:${normalizeSectionLabel(section.title)}`
            : section.kind;
        consumedKeys.add(sectionKey);

        const sectionChanges = changesBySection.get(sectionKey) || [];

        // Skip canonical sections that have no content in the resume and no changes.
        // The `header` section is always rendered because it represents basic info.
        if (
          section.kind !== 'header' &&
          section.itemKeys.length === 0 &&
          sectionChanges.length === 0
        ) {
          return;
        }
        const updatedLines: string[] = [];
        let lastSkillCategory: string | null | undefined = undefined;
        section.itemKeys.forEach(itemKey => {
          const item = pdfSelectionModel.items[itemKey];
          if (!item?.label) return;
          if (item.parentKey) return;

          if (
            item.kind === 'work-entry' ||
            item.kind === 'project-entry' ||
            item.kind === 'education-entry' ||
            item.kind === 'award-entry'
          ) {
            if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== '') {
              updatedLines.push('');
            }
            updatedLines.push(item.label);
            item.childKeys.forEach(childKey => {
              const child = pdfSelectionModel.items[childKey];
              if (child?.label) updatedLines.push(child.label);
            });
            return;
          }

          if (item.kind === 'skill') {
            const category = item.category ?? null;
            if (category !== lastSkillCategory) {
              if (lastSkillCategory !== undefined && updatedLines.at(-1) !== '') {
                updatedLines.push('');
              }
              if (category) {
                updatedLines.push(`${category}:`);
              }
              lastSkillCategory = category;
            }
            updatedLines.push(item.label);
            return;
          }

          updatedLines.push(item.label);
        });

        const rows = buildSectionRows(updatedLines, sectionChanges);
        let extraChangeCount = 0;
        if (section.kind === 'header' && normalizedTargetRole) {
          const titleUpdatedByAi = section.itemKeys.some(itemKey => {
            if (itemKey !== 'item:header:title') return false;
            const item = pdfSelectionModel.items[itemKey];
            return !!item && normalizeLineForMatch(item.label || '') === normalizedTargetRole;
          });
          if (titleUpdatedByAi) extraChangeCount += 1;
        }
        const totalChangeCount = sectionChanges.length + extraChangeCount;
        mappedSections.push({
          id: sectionId,
          title: section.title,
          kind: section.kind,
          changed: totalChangeCount > 0,
          changeCount: totalChangeCount,
          rows,
        });
      });
    }

    const unmappedSections: SectionRenderModel[] = [];
    for (const [key, sectionChanges] of changesBySection.entries()) {
      if (consumedKeys.has(key)) continue;
      unmappedSections.push({
        id: `unmapped-${key}`,
        title: titleFromSectionKey(key),
        kind: sectionKindFromSectionKey(key),
        changed: true,
        changeCount: sectionChanges.length,
        rows: buildSectionRows([], sectionChanges),
      });
    }

    return [...mappedSections, ...unmappedSections];
  }, [localChanges, pdfSelectionModel, normalizedTargetRole]);

  useEffect(() => {
    if (sectionModels.length === 0) {
      setExpandedSections(prev => (prev === null ? prev : null));
      return;
    }

    setExpandedSections(prev => {
      const validIds = new Set<string>();
      sectionModels.forEach(section => {
        validIds.add(section.id);
        if (section.kind === 'header') {
          validIds.add(`${section.id}:target-title`);
        }
      });

      if (prev === null) {
        const defaults = new Set<string>();
        sectionModels.forEach(section => {
          if (section.changeCount > 0) defaults.add(section.id);
          if (section.kind === 'header') {
            defaults.add(`${section.id}:target-title`);
          }
        });
        return defaults;
      }

      const next = new Set<string>();
      let changed = false;

      for (const id of prev) {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [sectionModels]);

  const startChangeEditing = (index: number, currentText: string) => {
    setActiveEdit({ kind: 'change', changeIndex: index });
    setDraftText(currentText);
  };

  const startInlineEditing = (target: ResumeInlineEditTarget, currentText: string) => {
    setActiveEdit({ kind: 'inline', target });
    setDraftText(currentText);
  };

  const cancelEditing = () => {
    setActiveEdit(null);
    setDraftText('');
  };

  const saveEditing = () => {
    if (!activeEdit) return;
    const nextText = draftText.trim();
    if (!nextText) {
      cancelEditing();
      return;
    }

    if (activeEdit.kind === 'change') {
      const nextChanges = localChanges.map((change, index) =>
        index === activeEdit.changeIndex ? { ...change, improved: nextText } : change
      );
      setLocalChanges(nextChanges);
      onChangesUpdate?.(nextChanges);
      cancelEditing();
      return;
    }

    onInlineEdit?.(activeEdit.target, nextText);
    cancelEditing();
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      let next: Set<string>;
      if (prev === null) {
        next = new Set<string>();
        sectionModels.forEach(section => {
          next.add(section.id);
          if (section.kind === 'header') {
            next.add(`${section.id}:target-title`);
          }
        });
      } else {
        next = new Set(prev);
      }
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const getSectionCheckState = (sectionId: string): CheckState =>
    getPdfSectionCheckState(pdfSelectionModel, pdfSelectionOverrides, sectionId);

  const getItemCheckState = (itemKey: string): CheckState =>
    getPdfItemCheckState(pdfSelectionModel, pdfSelectionOverrides, itemKey);

  const isEditingChange = (changeIndex: number) =>
    activeEdit?.kind === 'change' && activeEdit.changeIndex === changeIndex;

  const isEditingInlineTarget = (target: ResumeInlineEditTarget | undefined) =>
    Boolean(
      target &&
        activeEdit?.kind === 'inline' &&
        resumeInlineEditTargetKey(activeEdit.target) === resumeInlineEditTargetKey(target)
    );

  const resolveInlineTargetFromItemKey = (itemKey?: string): ResumeInlineEditTarget | undefined => {
    if (!onInlineEdit || !itemKey) return undefined;
    return parseResumeInlineItemTarget(itemKey) || undefined;
  };

  const buildEntrySlotTarget = (
    entryItemKey: string | undefined,
    section: 'work' | 'projects' | 'education' | 'awards',
    slot: 'heading' | 'date' | 'location' | 'technologies' | 'institution' | 'degreeArea' | 'gpa' | 'summary' | 'honor',
    index?: number
  ): ResumeInlineEditTarget | undefined => {
    if (!onInlineEdit || !entryItemKey) return undefined;
    const entryRef = parseResumeInlineEntryItemKey(entryItemKey);
    if (!entryRef || entryRef.section !== section) return undefined;

    if (section === 'education' && slot === 'honor') {
      if (typeof index !== 'number' || index < 0) return undefined;
      return {
        kind: 'entry-slot',
        section,
        entryItemKey,
        slot: 'honor',
        index,
      };
    }

    if (section === 'education') {
      if (slot === 'institution' || slot === 'degreeArea' || slot === 'date' || slot === 'location' || slot === 'gpa') {
        return {
          kind: 'entry-slot',
          section,
          entryItemKey,
          slot,
        };
      }
      return undefined;
    }

    if (section === 'work') {
      if (slot === 'heading' || slot === 'date' || slot === 'location') {
        return {
          kind: 'entry-slot',
          section,
          entryItemKey,
          slot,
        };
      }
      return undefined;
    }

    if (section === 'projects') {
      if (slot === 'heading' || slot === 'date' || slot === 'technologies') {
        return {
          kind: 'entry-slot',
          section,
          entryItemKey,
          slot,
        };
      }
      return undefined;
    }

    if (slot === 'heading' || slot === 'date' || slot === 'summary') {
      return {
        kind: 'entry-slot',
        section: 'awards',
        entryItemKey,
        slot,
      };
    }

    return undefined;
  };

  const resolveEntryMetaInlineTarget = (
    entryKind: 'work' | 'projects' | 'education' | 'awards' | 'custom',
    row: DiffHierarchyNeutralRow,
    entryItemKey: string | undefined
  ): ResumeInlineEditTarget | undefined => {
    const text = row.text || '';
    const kind = entryKind;

    if (isDateRangeLike(text)) {
      if (kind === 'work' || kind === 'projects' || kind === 'education' || kind === 'awards') {
        return buildEntrySlotTarget(entryItemKey, kind, 'date');
      }
      return undefined;
    }

    if (/^(gpa|cgpa)\s*:/i.test(text)) {
      return kind === 'education' ? buildEntrySlotTarget(entryItemKey, 'education', 'gpa') : undefined;
    }

    if (isTechnologiesLine(text)) {
      return kind === 'projects'
        ? buildEntrySlotTarget(entryItemKey, 'projects', 'technologies')
        : undefined;
    }

    if (isLocationLike(text)) {
      if (kind === 'work') return buildEntrySlotTarget(entryItemKey, 'work', 'location');
      if (kind === 'education') return buildEntrySlotTarget(entryItemKey, 'education', 'location');
    }

    return undefined;
  };

  const renderInlineEditButton = (target: ResumeInlineEditTarget, currentText: string) => (
    <Button
      type="button"
      variant="quiet"
      size="icon"
      className="-mt-1 h-8 w-8 flex-shrink-0 border border-transparent text-muted-foreground opacity-75 transition hover:border-border/70 hover:opacity-100 focus-visible:opacity-100"
      onClick={() => startInlineEditing(target, currentText)}
    >
      <Edit3 className="h-4 w-4" />
    </Button>
  );

  const renderSelectableWrapper = (
    key: string,
    content: ReactNode,
    itemKey?: string
  ) => {
    if (!itemKey) return content;
    const state = getItemCheckState(itemKey);
    return (
      <div key={`${key}-select`} className="flex items-start gap-3">
        <TriStateCheckbox
          state={state}
          ariaLabel="Include item in PDF"
          onChange={checked => onPdfToggleItem?.(itemKey, checked)}
        />
        <div className={cn('min-w-0 flex-1', state === 'unchecked' && 'opacity-55')}>{content}</div>
      </div>
    );
  };

  const renderNeutralRow = (
    row: Extract<DiffHierarchyContentRow, { type: 'neutral' }>,
    variant: 'bullet' | 'detail' | 'plain' | 'paragraph',
    inlineTarget?: ResumeInlineEditTarget
  ) => {
    const isEditing = isEditingInlineTarget(inlineTarget);

    if (isEditing && inlineTarget) {
      const baseClasses =
        variant === 'bullet'
          ? 'flex items-start gap-2 text-sm leading-relaxed'
          : 'text-sm leading-relaxed';
      return (
        <div key={row.id} className={cn(baseClasses, 'text-foreground')}>
          {variant === 'bullet' && (
            <span className="mt-[0.42rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/55" />
          )}
          <div className="min-w-0 flex-1">
            <Textarea
              value={draftText}
              onChange={event => setDraftText(event.target.value)}
              className="min-h-[96px] bg-background font-mono text-sm"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={saveEditing}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEditing}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      );
    }

    const canEdit = Boolean(inlineTarget && onInlineEdit);

    if (variant === 'bullet') {
      return (
        <div key={row.id} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
          <span className="mt-[0.42rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/55" />
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{row.text}</span>
          {canEdit && inlineTarget && renderInlineEditButton(inlineTarget, row.text)}
        </div>
      );
    }

    if (variant === 'detail') {
      return (
        <div key={row.id} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{row.text}</span>
          {canEdit && inlineTarget && renderInlineEditButton(inlineTarget, row.text)}
        </div>
      );
    }

    if (variant === 'paragraph') {
      return (
        <div key={row.id} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{row.text}</span>
          {canEdit && inlineTarget && renderInlineEditButton(inlineTarget, row.text)}
        </div>
      );
    }

    return (
      <div key={row.id} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
        <span className="min-w-0 flex-1 whitespace-pre-wrap">{row.text}</span>
        {canEdit && inlineTarget && renderInlineEditButton(inlineTarget, row.text)}
      </div>
    );
  };

  const changeLineClass =
    'flex flex-col gap-2 rounded-md border px-3 py-2 font-mono text-[13px] leading-relaxed sm:flex-row sm:items-start sm:gap-3';
  const changeBodyClass = 'flex min-w-0 flex-1 items-center gap-2';
  const renderRemovedRow = (row: Extract<DiffHierarchyChangeRow, { type: 'removed' }>) => {
    const isEditing = isEditingChange(row.changeIndex);
    return (
      <div key={row.id} className="my-1">
        <div className={cn(changeLineClass, 'border-destructive/25 border-l-4 bg-destructive/[0.03]')}>
          <div className={changeBodyClass}>
            {isEditing ? (
              <div className="min-w-0 flex-1">
                <Textarea
                  value={draftText}
                  onChange={event => setDraftText(event.target.value)}
                  className="min-h-[96px] bg-background font-mono text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={saveEditing}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <span className="min-w-0 flex-1 whitespace-pre-wrap text-muted-foreground line-through decoration-destructive/30">{row.text}</span>
                <Button
                  variant="quiet"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 border border-transparent text-muted-foreground opacity-75 transition hover:border-border/70 hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => startChangeEditing(row.changeIndex, row.text)}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAddedRow = (row: Extract<DiffHierarchyChangeRow, { type: 'added' }>) => {
    const isEditing = isEditingChange(row.changeIndex);
    return (
      <div key={row.id} className="my-1">
        <div className={cn(changeLineClass, 'border-primary/25 border-l-4 bg-primary/[0.03]')}>
          <div className={changeBodyClass}>
            {isEditing ? (
              <div className="min-w-0 flex-1">
                <Textarea
                  value={draftText}
                  onChange={event => setDraftText(event.target.value)}
                  className="min-h-[96px] bg-background font-mono text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={saveEditing}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <span className="min-w-0 flex-1 whitespace-pre-wrap font-medium text-foreground/80">{row.text}</span>
                <Button
                  variant="quiet"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 border border-transparent text-muted-foreground opacity-75 transition hover:border-border/70 hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => startChangeEditing(row.changeIndex, row.text)}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderModifiedRow = (row: Extract<DiffHierarchyChangeRow, { type: 'modified' }>) => {
    const isEditing = isEditingChange(row.changeIndex);
    return (
      <div key={row.id} className="my-1">
        <div className="overflow-hidden rounded-md border border-border/70 bg-background/70">
          <div className={cn(changeLineClass, 'rounded-none border-0 border-l-4 border-destructive/45 bg-destructive/[0.03]')}>
            <div className={changeBodyClass}>
              <span className="min-w-0 flex-1 whitespace-pre-wrap text-muted-foreground line-through decoration-destructive/30">{row.original}</span>
            </div>
          </div>
          <div className="border-t border-border/60" />
          <div className={cn(changeLineClass, 'rounded-none border-0 border-l-4 border-primary/45 bg-primary/[0.03]')}>
            <div className={changeBodyClass}>
              {isEditing ? (
                <div className="min-w-0 flex-1">
                  <Textarea
                    value={draftText}
                    onChange={event => setDraftText(event.target.value)}
                    className="min-h-[96px] bg-background font-mono text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={saveEditing}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap font-medium text-foreground/80">{row.improved}</span>
                  <Button
                    variant="quiet"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 border border-transparent text-muted-foreground opacity-75 transition hover:border-border/70 hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => startChangeEditing(row.changeIndex, row.improved)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderChangeRow = (row: DiffHierarchyChangeRow, itemKey?: string) => {
    const content =
      row.type === 'added'
        ? renderAddedRow(row)
        : row.type === 'removed'
          ? renderRemovedRow(row)
          : renderModifiedRow(row);
    return renderSelectableWrapper(row.id, content, itemKey);
  };

  const renderSkillPill = (row: DiffHierarchyContentRow, itemKey?: string) => {
    const label = row.type === 'modified' ? row.improved : row.text;
    const state: CheckState = itemKey ? getItemCheckState(itemKey) : 'checked';
    const isChecked = state === 'checked';
    const isSuggested = row.type === 'added' || row.type === 'modified';
    const isRemoved = row.type === 'removed';
    const inlineTarget = resolveInlineTargetFromItemKey(itemKey);
    const isEditing = isEditingInlineTarget(inlineTarget);

    if (isEditing && inlineTarget) {
      return (
        <div key={row.id} className="w-full">
          <Textarea
            value={draftText}
            onChange={event => setDraftText(event.target.value)}
            className="min-h-[60px] bg-background font-mono text-sm"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={saveEditing}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEditing}>
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    const pillClass = cn(
      'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors',
      isSuggested
        ? 'border-success/35 bg-success/[0.08] text-success'
        : isRemoved
          ? 'border-destructive/35 bg-destructive/[0.06]'
          : 'border-border bg-background text-foreground/85',
      !isChecked && 'opacity-55'
    );

    const labelClass = cn(
      'whitespace-nowrap text-left',
      isRemoved && 'text-muted-foreground line-through decoration-destructive/40',
      isSuggested && 'font-medium',
      inlineTarget ? 'cursor-text' : 'cursor-default'
    );

    return (
      <div key={row.id} className={pillClass}>
        {itemKey ? (
          <TriStateCheckbox
            state={state}
            ariaLabel={`Include ${label} in PDF`}
            onChange={checked => onPdfToggleItem?.(itemKey, checked)}
          />
        ) : null}
        <button
          type="button"
          onClick={() => inlineTarget && startInlineEditing(inlineTarget, label)}
          disabled={!inlineTarget}
          title={inlineTarget ? `Edit ${label}` : label}
          className={labelClass}
        >
          {label}
        </button>
      </div>
    );
  };

  const renderContentRow = (
    row: DiffHierarchyContentRow,
    neutralVariant: 'bullet' | 'detail' | 'plain' | 'paragraph',
    itemKey?: string,
    inlineTargetOverride?: ResumeInlineEditTarget
  ) => {
    const inlineTarget =
      row.type === 'neutral' ? (inlineTargetOverride || resolveInlineTargetFromItemKey(itemKey)) : undefined;
    const content =
      row.type === 'neutral'
        ? renderNeutralRow(row, neutralVariant, inlineTarget)
        : renderChangeRow(row, itemKey);
    if (row.type !== 'neutral') return content;
    return renderSelectableWrapper(row.id, content, itemKey);
  };

  const renderMetaLine = (items: string[]) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
          {index > 0 && <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );

  const renderSummaryGroupRows = (rows: DiffHierarchyContentRow[], summaryItemKey?: string) => {
    const segments: Array<
      | { id: string; type: 'text'; text: string }
      | { id: string; type: 'row'; row: DiffHierarchyChangeRow }
    > = [];

    let bufferedLines: string[] = [];
    let textIndex = 0;

    const flushText = () => {
      const text = bufferedLines.map(line => line.trim()).filter(Boolean).join(' ');
      if (!text) {
        bufferedLines = [];
        return;
      }
      textIndex += 1;
      segments.push({ id: `summary-text-${textIndex}`, type: 'text', text });
      bufferedLines = [];
    };

    rows.forEach(row => {
      if (row.type === 'neutral') {
        bufferedLines.push(row.text);
        return;
      }
      flushText();
      segments.push({ id: row.id, type: 'row', row });
    });

    flushText();

    let hasRenderedSummaryEditor = false;
    return segments.map(segment => {
      if (segment.type === 'text') {
        const summaryTarget = resolveInlineTargetFromItemKey(summaryItemKey);
        const isEditing = isEditingInlineTarget(summaryTarget) && !hasRenderedSummaryEditor;
        if (isEditing) hasRenderedSummaryEditor = true;
        return (
          <div key={segment.id}>
            {isEditing && summaryTarget ? (
              <div className="text-sm leading-relaxed text-foreground">
                <Textarea
                  value={draftText}
                  onChange={event => setDraftText(event.target.value)}
                  className="min-h-[96px] bg-background font-mono text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={saveEditing}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/90">{segment.text}</p>
                {summaryTarget && renderInlineEditButton(summaryTarget, segment.text)}
              </div>
            )}
          </div>
        );
      }
      return renderChangeRow(segment.row);
    });
  };

  const renderCustomSectionRows = (
    section: SectionRenderModel,
    selectionContext: SectionSelectionContext | null
  ) => (
    <div className="space-y-1">
      {section.rows.map((row, index) => {
        if (row.type === 'spacer') {
          return <div key={`${section.id}-space-${index}`} className="h-2" />;
        }
        const itemKey = selectionContext
          ? consumeSequentialItemKey(selectionContext.customLineItemKeys, row)
          : undefined;
        return renderContentRow(row as DiffHierarchyContentRow, 'plain', itemKey);
      })}
    </div>
  );

  const renderSectionBadge = (label: string) => (
    <span className="rounded-[5px] bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-primary">
      {label}
    </span>
  );

  const renderRewritesBadge = (count: number) =>
    count > 0
      ? renderSectionBadge(`${count} ${count === 1 ? 'Rewrite suggestion' : 'Rewrite suggestions'}`)
      : null;

  const renderHeaderPill = (item: HeaderDisplayItem) => {
    const state = getItemCheckState(item.itemKey);
    const included = state === 'checked';
    const inlineTarget = resolveInlineTargetFromItemKey(item.itemKey);
    const isEditing = isEditingInlineTarget(inlineTarget);
    const isTitle = item.kind === 'title';
    const isTitleUpdatedByAi = isTitle && !!targetRole && item.label === targetRole;

    if (isEditing && inlineTarget) {
      return (
        <div key={item.itemKey} className="w-full">
          <Textarea
            value={draftText}
            onChange={event => setDraftText(event.target.value)}
            className="min-h-[72px] bg-background font-mono text-sm"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={saveEditing}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelEditing}>
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.itemKey}
        className={cn(
          'inline-flex max-w-full items-center gap-2 rounded-lg border py-1.5 pl-2 pr-2.5 transition',
          included ? 'border-border/80 bg-background' : 'border-border/40 bg-muted/50 opacity-60'
        )}
      >
        <TriStateCheckbox
          state={state}
          ariaLabel={`Include ${item.label || 'item'} in PDF`}
          onChange={checked => onPdfToggleItem?.(item.itemKey, checked)}
        />
        <button
          type="button"
          onClick={() => inlineTarget && startInlineEditing(inlineTarget, item.label)}
          disabled={!inlineTarget}
          title={item.label}
          className={cn(
            'max-w-[240px] truncate text-left text-[13px] leading-tight',
            isTitleUpdatedByAi ? 'font-medium text-primary' : 'text-foreground/90',
            inlineTarget ? 'cursor-text' : 'cursor-default'
          )}
        >
          {item.label}
        </button>
      </div>
    );
  };

  const renderHierarchyBlock = (
    block: DiffHierarchyBlock,
    selectionContext: SectionSelectionContext | null,
    sectionKind?: string
  ) => {
    if (block.type === 'header') {
      const headerItemKeys = selectionContext?.headerItemKeys || [];
      const orderedHeaderItems = buildOrderedHeaderDisplayItems(headerItemKeys, pdfSelectionModel);
      const hasStructuredHeaderItems = orderedHeaderItems.length > 0;
      const headerMatchQueue = [...headerItemKeys];

      const renderStructuredHeaderItem = (item: HeaderDisplayItem) => {
        const state = getItemCheckState(item.itemKey);
        const inlineTarget = resolveInlineTargetFromItemKey(item.itemKey);
        const isEditing = isEditingInlineTarget(inlineTarget);
        const isName = item.kind === 'name';
        const isTitle = item.kind === 'title';

        const isTitleUpdatedByAi = isTitle && !!targetRole && item.label === targetRole;
        const textClassName = isName
          ? 'text-[1.05rem] font-semibold leading-tight text-foreground sm:text-xl'
          : isTitle
            ? cn(
                'text-sm font-medium leading-relaxed sm:text-base',
                isTitleUpdatedByAi ? 'text-primary' : 'text-foreground/85'
              )
            : 'text-sm leading-relaxed text-foreground break-words';

        return (
          <div
            key={item.itemKey}
            className={cn('flex items-center gap-2 px-1 py-0.5', state === 'unchecked' && 'opacity-55')}
          >
            <TriStateCheckbox
              state={state}
              ariaLabel={`Include ${item.label || 'header item'} in PDF`}
              onChange={checked => onPdfToggleItem?.(item.itemKey, checked)}
            />
            <div className="min-w-0 flex-1">
              {isEditing && inlineTarget ? (
                <div>
                  <Textarea
                    value={draftText}
                    onChange={event => setDraftText(event.target.value)}
                    className="min-h-[96px] bg-background font-mono text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={saveEditing}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className={cn('min-w-0 flex-1 whitespace-pre-wrap', textClassName)}>{item.label}</p>
                  {inlineTarget && renderInlineEditButton(inlineTarget, item.label)}
                </div>
              )}
            </div>
          </div>
        );
      };

      const renderHeaderTextRow = (
        row: DiffHierarchyNeutralRow,
        options: { textClassName: string; wrapperClassName?: string }
      ) => {
        const itemKey = consumeMatchingItemKey(headerMatchQueue, row, pdfSelectionModel);
        const inlineTarget = resolveInlineTargetFromItemKey(itemKey);
        const isEditing = isEditingInlineTarget(inlineTarget);

        if (isEditing && inlineTarget) {
          return (
            <div key={row.id} className={options.wrapperClassName}>
              <Textarea
                value={draftText}
                onChange={event => setDraftText(event.target.value)}
                className="min-h-[96px] bg-background font-mono text-sm"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={saveEditing}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel
                </Button>
              </div>
            </div>
          );
        }

        return (
          <div key={row.id} className={cn('flex items-start gap-2', options.wrapperClassName)}>
            <p className={cn('min-w-0 flex-1 whitespace-pre-wrap', options.textClassName)}>{row.text}</p>
            {inlineTarget && renderInlineEditButton(inlineTarget, row.text)}
          </div>
        );
      };

      if (hasStructuredHeaderItems) {
        const identityItems = orderedHeaderItems.filter(
          item => item.kind === 'name' || item.kind === 'title'
        );
        const contactItems = orderedHeaderItems.filter(
          item => item.kind !== 'name' && item.kind !== 'title'
        );

        return (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {identityItems.length > 0 && (
                <div className="grid grid-cols-1 gap-1.5">
                  {identityItems.map(item => renderStructuredHeaderItem(item))}
                </div>
              )}
              {contactItems.length > 0 && (
                <div className="flex flex-col">
                  {contactItems.map(item => renderStructuredHeaderItem(item))}
                </div>
              )}
            </div>
            {block.changes.length > 0 && (
              <div className="space-y-1">{block.changes.map(row => renderChangeRow(row))}</div>
            )}
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <div className="space-y-1">
            {block.nameRow
              ? renderHeaderTextRow(block.nameRow, {
                  textClassName: 'text-base font-semibold leading-tight text-foreground sm:text-lg',
                })
              : block.name && (
                  <p className="text-base font-semibold leading-tight text-foreground sm:text-lg">{block.name}</p>
                )}
            {block.titleRow
              ? renderHeaderTextRow(block.titleRow, {
                  textClassName: cn(
                    'text-sm font-medium',
                    targetRole && block.titleRow.text === targetRole
                      ? 'text-primary'
                      : 'text-foreground/85'
                  ),
                })
              : block.title && (
                  <p className={cn(
                    'text-sm font-medium',
                    targetRole && block.title === targetRole
                      ? 'text-primary'
                      : 'text-foreground/85'
                  )}>{block.title}</p>
                )}
            {block.detailRows.length > 0 ? (
              <div className="space-y-1">
                {block.detailRows.map(row =>
                  renderHeaderTextRow(row, {
                    textClassName: 'text-sm text-muted-foreground',
                  })
                )}
              </div>
            ) : block.details.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {block.details.map((detail, index) => (
                  <span key={`${detail}-${index}`} className="inline-flex items-center gap-2">
                    {index > 0 && <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />}
                    <span>{detail}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {block.changes.length > 0 && <div className="space-y-1">{block.changes.map(row => renderChangeRow(row))}</div>}
        </div>
      );
    }

    if (block.type === 'entry') {
      const entryQueue =
        block.entryKind === 'work' ||
        block.entryKind === 'projects' ||
        block.entryKind === 'education' ||
        block.entryKind === 'awards'
          ? selectionContext?.entryQueues[block.entryKind]
          : undefined;
      const entryItemKey = entryQueue ? consumeNext(entryQueue) : undefined;
      const entryState = entryItemKey ? getItemCheckState(entryItemKey) : 'checked';
      const highlightQueue =
        entryItemKey && selectionContext ? selectionContext.highlightQueuesByEntry[entryItemKey] || [] : [];
      const headingTarget =
        block.entryKind === 'work' ||
        block.entryKind === 'projects' ||
        block.entryKind === 'education' ||
        block.entryKind === 'awards'
          ? (block.entryKind === 'education'
              ? buildEntrySlotTarget(entryItemKey, 'education', 'institution')
              : block.entryKind === 'work'
                ? buildEntrySlotTarget(entryItemKey, 'work', 'heading')
                : block.entryKind === 'projects'
                  ? buildEntrySlotTarget(entryItemKey, 'projects', 'heading')
                  : buildEntrySlotTarget(entryItemKey, 'awards', 'heading'))
          : undefined;
      const subheadingTarget =
        block.entryKind === 'education'
          ? buildEntrySlotTarget(entryItemKey, 'education', 'degreeArea')
          : block.entryKind === 'awards'
            ? buildEntrySlotTarget(entryItemKey, 'awards', 'summary')
            : undefined;

      const renderEntryHeaderRow = (
        row: DiffHierarchyNeutralRow,
        className: string,
        inlineTarget?: ResumeInlineEditTarget
      ) => {
        const isEditing = isEditingInlineTarget(inlineTarget);
        if (isEditing && inlineTarget) {
          return (
            <div key={row.id} className="space-y-2">
              <Textarea
                value={draftText}
                onChange={event => setDraftText(event.target.value)}
                className="min-h-[96px] bg-background font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEditing}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel
                </Button>
              </div>
            </div>
          );
        }
        return (
          <div key={row.id} className="flex items-start gap-2">
            <p className={cn('min-w-0 flex-1 whitespace-pre-wrap', className)}>{row.text}</p>
            {inlineTarget && renderInlineEditButton(inlineTarget, row.text)}
          </div>
        );
      };

      return (
        <div className={cn(entryItemKey && entryState === 'unchecked' && 'opacity-55')}>
          <div className={cn('space-y-1', entryItemKey && 'flex items-start gap-2 space-y-0')}>
            {entryItemKey && (
              <TriStateCheckbox
                state={entryState}
                ariaLabel="Include entry in PDF"
                onChange={checked => onPdfToggleItem?.(entryItemKey, checked)}
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              {block.headingRow
                ? renderEntryHeaderRow(
                    block.headingRow,
                    'text-sm font-semibold leading-tight text-foreground sm:text-[0.98rem]',
                    headingTarget
                  )
                : block.heading && (
                    <p className="text-sm font-semibold leading-tight text-foreground sm:text-[0.98rem]">
                      {block.heading}
                    </p>
                  )}
              {block.subheadingRow
                ? renderEntryHeaderRow(
                    block.subheadingRow,
                    'text-sm font-medium text-foreground/85',
                    subheadingTarget
                  )
                : block.subheading && <p className="text-sm font-medium text-foreground/85">{block.subheading}</p>}
              {block.metaRows.length > 0 ? (
                <div className="space-y-1">
                  {block.metaRows.map(metaRow => {
                    const inlineTarget = resolveEntryMetaInlineTarget(block.entryKind, metaRow, entryItemKey);
                    return renderEntryHeaderRow(
                      metaRow,
                      'text-xs leading-relaxed text-muted-foreground',
                      inlineTarget
                    );
                  })}
                </div>
              ) : block.meta.length > 0 ? (
                renderMetaLine(block.meta)
              ) : null}
            </div>
          </div>
          {block.rows.length > 0 && (
            <div className="mt-2 pl-2 sm:pl-3">
              <div className="space-y-1">
                {(() => {
                  let educationHonorIndex = 0;
                  let awardsSummaryAssigned = Boolean(block.subheadingRow);
                  return block.rows.map(row => {
                  let rowItemKey: string | undefined;
                  let inlineTargetOverride: ResumeInlineEditTarget | undefined;
                  if (block.entryKind === 'work' || block.entryKind === 'projects') {
                    rowItemKey = consumeMatchingItemKey(highlightQueue, row, pdfSelectionModel);
                  }
                  if (row.type === 'neutral' && !rowItemKey && entryItemKey) {
                    if (block.entryKind === 'education') {
                      inlineTargetOverride = buildEntrySlotTarget(
                        entryItemKey,
                        'education',
                        'honor',
                        educationHonorIndex
                      );
                      educationHonorIndex += 1;
                    } else if (block.entryKind === 'awards' && !awardsSummaryAssigned) {
                      inlineTargetOverride = buildEntrySlotTarget(entryItemKey, 'awards', 'summary');
                      awardsSummaryAssigned = true;
                    }
                  }
                  return renderContentRow(row, 'bullet', rowItemKey, inlineTargetOverride);
                });
                })()}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (block.type === 'skills-category') {
      const categoryTarget =
        onInlineEdit && block.title
          ? ({ kind: 'skills-category', category: block.title } satisfies ResumeInlineEditTarget)
          : undefined;
      const isEditingCategory = isEditingInlineTarget(categoryTarget);
      return (
        <div>
          {isEditingCategory && categoryTarget ? (
            <div className="space-y-2">
              <Textarea
                value={draftText}
                onChange={event => setDraftText(event.target.value)}
                className="min-h-[96px] bg-background font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEditing}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {block.title}
              </p>
              {categoryTarget && renderInlineEditButton(categoryTarget, block.title)}
            </div>
          )}
          <div className="mt-2 pl-2 sm:pl-4">
            <div className="flex flex-wrap gap-1.5">
              {block.rows.map(row =>
                renderSkillPill(
                  row,
                  selectionContext
                    ? consumeSkillItemKey(selectionContext.skillItemKeys, row, pdfSelectionModel)
                    : undefined
                )
              )}
            </div>
          </div>
        </div>
      );
    }

    if (block.type === 'summary-group') {
      const summaryItemKey = selectionContext ? consumeNext(selectionContext.summaryItemKeys) : undefined;
      const summaryState = summaryItemKey ? getItemCheckState(summaryItemKey) : 'checked';
      return (
        <div className={cn('space-y-2', summaryItemKey && summaryState === 'unchecked' && 'opacity-55')}>
          {summaryItemKey && (
            <div className="flex items-center gap-2">
              <TriStateCheckbox
                state={summaryState}
                ariaLabel="Include summary in PDF"
                onChange={checked => onPdfToggleItem?.(summaryItemKey, checked)}
              />
              <span className="text-xs text-muted-foreground">Include summary in PDF</span>
            </div>
          )}
          {renderSummaryGroupRows(block.rows, summaryItemKey)}
        </div>
      );
    }

    if (block.type === 'simple-list') {
      const neutralVariant = block.listStyle === 'bulleted' ? 'bullet' : 'plain';
      const isSkills = sectionKind === 'skills';
      const itemKeyQueue = selectionContext
        ? isSkills
          ? selectionContext.skillItemKeys
          : sectionKind === 'languages'
            ? selectionContext.languageItemKeys
            : selectionContext.customLineItemKeys
        : undefined;

      if (isSkills) {
        return (
          <div className="flex flex-wrap gap-1.5">
            {block.rows.map(row =>
              renderSkillPill(
                row,
                itemKeyQueue?.length
                  ? consumeSkillItemKey(itemKeyQueue, row, pdfSelectionModel)
                  : undefined
              )
            )}
          </div>
        );
      }

      return (
        <div className="space-y-1">
          {block.rows.map(row =>
            renderContentRow(
              row,
              neutralVariant,
              itemKeyQueue?.length
                ? consumeSequentialItemKey(itemKeyQueue, row)
                : undefined
            )
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {/* <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Additional changed lines
        </p> */}
        <div className="space-y-1">{block.rows.map(row => renderChangeRow(row))}</div>
      </div>
    );
  };

  return (
    <div className="p-3">
      {sectionModels.length === 0 ? (
        <Card className="border-border/85 bg-card/92">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Updated Resume Preview</CardTitle>
            <CardDescription>Sectioned full-width view</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap rounded-xl border border-border/80 bg-muted/70 p-4 text-sm font-mono leading-relaxed">
              {hasOriginal
                ? 'No section content is available yet. Run a new analysis or apply rewrites.'
                : 'Resume text unavailable. Run a new analysis to populate this view.'}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-2xl border border-border/85 bg-card/92 px-5 shadow-[0_1px_1px_rgba(15,23,42,0.05)] sm:px-6">
          {sectionModels.map(section => {
            const isExpanded = expandedSections === null ? true : expandedSections.has(section.id);
            const hierarchyBlocks = buildHierarchicalSectionBlocks(section.kind, section.rows);
            const selectionContext = createSectionSelectionContext(section.id, pdfSelectionModel);
            const hasSectionSelection = Boolean(pdfSelectionModel?.sections[section.id]);
            const sectionState = hasSectionSelection ? getSectionCheckState(section.id) : 'checked';

            if (section.kind === 'header') {
              const orderedItems = buildOrderedHeaderDisplayItems(
                selectionContext?.headerItemKeys || [],
                pdfSelectionModel
              );
              const titleItem = orderedItems.find(item => item.kind === 'title');
              const otherItems = orderedItems.filter(item => item.kind !== 'title');

              if (titleItem) {
                const targetTitleId = `${section.id}:target-title`;
                const targetTitleExpanded =
                  expandedSections === null ? true : expandedSections.has(targetTitleId);
                const titleIsAiUpdated = Boolean(targetRole && titleItem.label === targetRole);
                const contactChangeCount = Math.max(
                  0,
                  section.changeCount - (titleIsAiUpdated ? 1 : 0)
                );
                const headerBlock = hierarchyBlocks.find(block => block.type === 'header');
                const headerChanges =
                  headerBlock && headerBlock.type === 'header' ? headerBlock.changes : [];

                const titleState = getItemCheckState(titleItem.itemKey);
                const contactStates = otherItems.map(item => getItemCheckState(item.itemKey));
                const contactAllChecked =
                  contactStates.length > 0 && contactStates.every(s => s === 'checked');
                const contactAllUnchecked =
                  contactStates.length === 0 || contactStates.every(s => s === 'unchecked');
                const contactState: CheckState = contactAllChecked
                  ? 'checked'
                  : contactAllUnchecked
                    ? 'unchecked'
                    : 'indeterminate';
                return (
                  <Fragment key={section.id}>
                    <div className="border-b border-border/60">
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 py-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleSection(section.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <div className={cn('flex min-w-0 items-center gap-2', contactState === 'unchecked' && 'opacity-60')}>
                              <CardTitle className="text-base">Contact Information</CardTitle>
                              {renderRewritesBadge(contactChangeCount)}
                            </div>
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="pb-4">
                          <div
                            className={cn(
                              'space-y-3',
                              contactState === 'unchecked' && 'opacity-65'
                            )}
                          >
                            {otherItems.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                {otherItems.map(item => renderHeaderPill(item))}
                              </div>
                            )}
                            {headerChanges.length > 0 && (
                              <div className="space-y-1">
                                {headerChanges.map(row => renderChangeRow(row))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border-b border-border/60 last:border-b-0">
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 py-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={targetTitleExpanded}
                            onClick={() => toggleSection(targetTitleId)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {targetTitleExpanded ? (
                              <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <div className={cn('flex min-w-0 items-center gap-2', titleState === 'unchecked' && 'opacity-60')}>
                              <CardTitle className="text-base">Target Title</CardTitle>
                              {titleIsAiUpdated && renderSectionBadge('Suggested')}
                            </div>
                          </button>
                        </div>
                      </div>
                      {targetTitleExpanded && (
                        <div className="pb-4">
                          <div
                            className={cn(
                              'flex flex-wrap items-center gap-2',
                              titleState === 'unchecked' && 'opacity-65'
                            )}
                          >
                            {renderHeaderPill(titleItem)}
                          </div>
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              }
            }

            return (
              <div
                key={section.id}
                className="border-b border-border/60 last:border-b-0"
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleSection(section.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className={cn('flex min-w-0 items-center gap-2', sectionState === 'unchecked' && 'opacity-60')}>
                        <CardTitle className="text-base">{section.title}</CardTitle>
                        {section.kind === 'summary'
                          ? section.changeCount > 0 && renderSectionBadge('Suggested')
                          : section.kind === 'skills'
                            ? section.changeCount > 0 &&
                              renderSectionBadge(
                                `${section.changeCount} ${section.changeCount === 1 ? 'Suggestion' : 'Suggestions'}`
                              )
                            : renderRewritesBadge(section.changeCount)}
                      </div>
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="pb-4">
                    <div className={cn('space-y-0', sectionState === 'unchecked' && 'opacity-65')}>
                      {section.kind === 'custom' ? (
                        <div className="py-1">{renderCustomSectionRows(section, selectionContext)}</div>
                      ) : (
                        hierarchyBlocks.map((block, index) => (
                          <div
                            key={`${section.id}-${block.id}`}
                            className={cn('py-2 first:pt-0 last:pb-0', index > 0 && 'border-t border-border/70')}
                          >
                            {renderHierarchyBlock(block, selectionContext, section.kind)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
