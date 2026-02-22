'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { BulletChange } from '@/lib/types';

interface RewriteSuggestionsProps {
  changes: BulletChange[];
  onChangesUpdate?: (changes: BulletChange[]) => void;
}

export function RewriteSuggestions({ changes, onChangesUpdate }: RewriteSuggestionsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [localChanges, setLocalChanges] = useState<BulletChange[]>(changes);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftText, setDraftText] = useState('');
  const hasInitializedExpansion = useRef(false);

  useEffect(() => {
    setLocalChanges(changes);
  }, [changes]);

  const groupedChanges = useMemo(
    () =>
      localChanges.reduce(
        (acc, change, index) => {
          if (!acc[change.section]) {
            acc[change.section] = [];
          }
          acc[change.section].push({ change, index });
          return acc;
        },
        {} as Record<string, { change: BulletChange; index: number }[]>
      ),
    [localChanges]
  );

  useEffect(() => {
    if (hasInitializedExpansion.current) return;
    const sections = Object.keys(groupedChanges);
    if (sections.length === 0) return;
    setExpandedSections(new Set(sections));
    hasInitializedExpansion.current = true;
  }, [groupedChanges]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(Object.keys(groupedChanges)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

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
    const next = localChanges.map((change, index) =>
      index === editingIndex ? { ...change, improved: nextText } : change
    );
    setLocalChanges(next);
    onChangesUpdate?.(next);
    setEditingIndex(null);
    setDraftText('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {localChanges.length} changes across {Object.keys(groupedChanges).length} sections
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            Collapse all
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(groupedChanges).map(([section, sectionChanges]) => {
          const isExpanded = expandedSections.has(section);

          return (
            <div key={section} className="overflow-hidden rounded-2xl border border-border/80 bg-card/85">
              <button
                onClick={() => toggleSection(section)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">{section}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {sectionChanges.length} {sectionChanges.length === 1 ? 'change' : 'changes'}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-border/80">
                  {sectionChanges.map(({ change, index }) => {
                    const isEditing = editingIndex === index;
                    const canEdit = change.type === 'modified' || change.type === 'added';
                    return (
                      <div
                        key={`${section}-${index}`}
                        className={cn(
                          'border-b border-border/80 last:border-b-0',
                          'font-mono text-sm'
                        )}
                      >
                        {change.type === 'modified' && (
                          <>
                            <div className="flex items-start gap-2 border-l-2 border-destructive/55 bg-destructive/5 px-4 py-2.5">
                              <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                              <span className="text-destructive/90">{change.original}</span>
                            </div>
                            <div className="flex items-start gap-2 border-l-2 border-success/55 bg-success/5 px-4 py-2.5">
                              <Plus className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                              {isEditing ? (
                                <div className="flex-1">
                                  <Textarea
                                    value={draftText}
                                    onChange={e => setDraftText(e.target.value)}
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
                                  <span className="flex-1 text-success">{change.improved}</span>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                      onClick={() => startEditing(index, change.improved)}
                                    >
                                      <Edit3 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        )}
                        {change.type === 'added' && (
                          <div className="flex items-start gap-2 border-l-2 border-success/55 bg-success/5 px-4 py-2.5">
                            <Plus className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                            {isEditing ? (
                              <div className="flex-1">
                                <Textarea
                                  value={draftText}
                                  onChange={e => setDraftText(e.target.value)}
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
                                <span className="flex-1 text-success">{change.improved}</span>
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={() => startEditing(index, change.improved)}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {change.type === 'removed' && (
                          <div className="flex items-start gap-2 border-l-2 border-destructive/55 bg-destructive/5 px-4 py-2.5">
                            <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                            <span className="text-destructive/90">{change.original}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border/80 bg-muted/55 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-destructive/45" />
          <span className="text-muted-foreground">Removed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-success/45" />
          <span className="text-muted-foreground">Added</span>
        </div>
        <div className="flex items-center gap-2">
          <Edit3 className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Modified</span>
        </div>
      </div>
    </div>
  );
}
