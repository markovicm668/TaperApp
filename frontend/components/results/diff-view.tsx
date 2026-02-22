'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit3, Minus, Plus } from 'lucide-react';
import type { BulletChange } from '@/lib/types';
import type { SectionViewModelRow } from '@/lib/resume/mappers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface DiffViewProps {
  originalText: string;
  changes: BulletChange[];
  sections: SectionViewModelRow[];
  onChangesUpdate?: (changes: BulletChange[]) => void;
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
  changed: boolean;
  changeCount: number;
  rows: RenderRow[];
};

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

function sectionKeyForRow(section: SectionViewModelRow): string {
  if (section.kind === 'custom') {
    return `custom:${normalizeSectionLabel(section.title)}`;
  }
  return section.kind;
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
          text: match.change.improved || line,
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
  originalText,
  changes,
  sections,
  onChangesUpdate,
}: DiffViewProps) {
  const [localChanges, setLocalChanges] = useState<BulletChange[]>(changes);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftText, setDraftText] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalChanges(changes);
  }, [changes]);

  const hasOriginal = Boolean(originalText.trim());

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
    const mappedSections = sections
      .map(section => {
        const key = sectionKeyForRow(section);
        consumedKeys.add(key);
        const sectionChanges = changesBySection.get(key) || [];
        const rows = buildSectionRows(section.updatedLines, sectionChanges);
        return {
          id: section.key,
          title: section.title,
          changed: section.changed || sectionChanges.length > 0,
          changeCount: sectionChanges.length,
          rows,
        };
      })
      .filter(section => section.rows.length > 0 || section.changeCount > 0);

    const unmappedSections: SectionRenderModel[] = [];
    for (const [key, sectionChanges] of changesBySection.entries()) {
      if (consumedKeys.has(key)) continue;
      unmappedSections.push({
        id: `unmapped-${key}`,
        title: titleFromSectionKey(key),
        changed: true,
        changeCount: sectionChanges.length,
        rows: buildSectionRows([], sectionChanges),
      });
    }

    return [...mappedSections, ...unmappedSections];
  }, [sections, localChanges]);

  useEffect(() => {
    if (sectionModels.length === 0) return;
    setExpandedSections(prev => {
      const next = new Set(prev);
      const validIds = new Set(sectionModels.map(section => section.id));
      let changed = false;

      for (const id of sectionModels.map(section => section.id)) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }

      for (const id of Array.from(next)) {
        if (!validIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [sectionModels]);

  const startEditing = (index: number, currentText: string) => {
    setEditingIndex(index);
    setDraftText(currentText);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setDraftText('');
  };

  const saveEditing = () => {
    if (editingIndex === null) return;
    const nextText = draftText.trim();
    if (!nextText) {
      cancelEditing();
      return;
    }

    const nextChanges = localChanges.map((change, index) =>
      index === editingIndex ? { ...change, improved: nextText } : change
    );
    setLocalChanges(nextChanges);
    onChangesUpdate?.(nextChanges);
    cancelEditing();
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-5 p-5">
      {sectionModels.length === 0 && (
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
      )}

      {sectionModels.map(section => {
        const isExpanded = expandedSections.has(section.id);
        return (
          <Card key={section.id} className="border-border/85 bg-card/92">
            <CardHeader className="pb-3">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleSection(section.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              >
                <div className="flex items-start gap-2">
                  {isExpanded ? (
                    <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <CardDescription>
                      {section.changeCount > 0
                        ? `${section.changeCount} highlighted change${section.changeCount === 1 ? '' : 's'} in this section.`
                        : 'No highlighted changes in this section.'}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={section.changed ? 'default' : 'secondary'}>
                  {section.changed ? 'Changed' : 'Unchanged'}
                </Badge>
              </button>
            </CardHeader>
            {isExpanded && (
              <CardContent>
                <div className="overflow-hidden rounded-xl border border-border/85 bg-muted/28">
                  {section.rows.map(row => {
                    if (row.type === 'spacer') {
                      return <div key={row.id} className="h-3 border-b border-border/70 last:border-b-0" />;
                    }

                    if (row.type === 'neutral') {
                      return (
                        <div
                          key={row.id}
                          className="whitespace-pre-wrap border-b border-border/70 px-4 py-2.5 text-sm leading-relaxed text-foreground/90 last:border-b-0"
                        >
                          {row.text}
                        </div>
                      );
                    }

                    if (row.type === 'removed') {
                      return (
                        <div key={row.id} className="border-b border-border/70 last:border-b-0">
                          <div className="flex items-start gap-2 border-l-2 border-destructive/45 bg-destructive/[0.06] px-4 py-2.5 font-mono text-[13px] leading-relaxed">
                            <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                            <span className="whitespace-pre-wrap text-destructive/85">{row.text}</span>
                          </div>
                        </div>
                      );
                    }

                    if (row.type === 'added') {
                      const isEditing = editingIndex === row.changeIndex;
                      return (
                        <div key={row.id} className="border-b border-border/70 last:border-b-0">
                          <div className="flex items-start gap-2 border-l-2 border-success/45 bg-success/[0.06] px-4 py-2.5 font-mono text-[13px] leading-relaxed">
                            <Plus className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                            {isEditing ? (
                              <div className="flex-1">
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
                                <span className="flex-1 whitespace-pre-wrap text-success/90">{row.text}</span>
                                <Button
                                  variant="quiet"
                                  size="icon"
                                  className="h-8 w-8 border border-transparent text-muted-foreground opacity-75 transition hover:border-border/70 hover:opacity-100 focus-visible:opacity-100"
                                  onClick={() => startEditing(row.changeIndex, row.text)}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const isEditing = editingIndex === row.changeIndex;
                    return (
                      <div key={row.id} className="border-b border-border/70 last:border-b-0">
                        <div className="flex items-start gap-2 border-l-2 border-destructive/45 bg-destructive/[0.06] px-4 py-2.5 font-mono text-[13px] leading-relaxed">
                          <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                          <span className="whitespace-pre-wrap text-destructive/85">{row.original}</span>
                        </div>
                        <div className="flex items-start gap-2 border-l-2 border-success/45 bg-success/[0.06] px-4 py-2.5 font-mono text-[13px] leading-relaxed">
                          <Plus className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                          {isEditing ? (
                            <div className="flex-1">
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
                              <span className="flex-1 whitespace-pre-wrap text-success/90">{row.improved}</span>
                              <Button
                                variant="quiet"
                                size="icon"
                                className="h-8 w-8 border border-transparent text-muted-foreground opacity-75 transition hover:border-border/70 hover:opacity-100 focus-visible:opacity-100"
                                onClick={() => startEditing(row.changeIndex, row.improved)}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
