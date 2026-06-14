'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  deleteApplication,
  getApplication,
  listApplications,
  mapAnalyzeAiResult,
  updateApplicationStatus,
} from '@/lib/api';
import { createEmptySourceMeta } from '@resume-scanner/resume-contract';
import { analysisResultToSnapshot } from '@/lib/resume/mappers';
import { useResumeActions } from '@/lib/resume/store';
import { useAuth } from '@/lib/auth/useAuth';
import { STAGES, STAGE_MAP, type StageDescriptor } from '@/lib/applications/stages';
import { cn } from '@/lib/utils';
import type { ApplicationStatus, ApplicationSummary } from '@/lib/types';
import {
  ApplicationCard,
  ApplicationCardButton,
  ApplicationCardOverlay,
} from '@/components/history/application-card';
import { ApplicationDetailDialog } from '@/components/history/application-detail-dialog';

function BoardColumn({
  stage,
  items,
  isOver,
  onOpen,
}: {
  stage: StageDescriptor;
  items: ApplicationSummary[];
  isOver: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.accent }} />
          <span className="text-[13.5px] font-semibold">{stage.label}</span>
        </div>
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold tabular-nums text-primary">
          {items.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[140px] flex-col gap-2.5 rounded-2xl border-[1.5px] border-dashed border-transparent p-1.5 transition-colors',
          isOver && 'border-primary/45 bg-primary/[0.06]'
        )}
      >
        {items.map(app => (
          <ApplicationCard key={app.id} application={app} onOpen={onOpen} />
        ))}

        {items.length === 0 && (
          <div className="flex min-h-[90px] items-center justify-center px-3 text-center text-xs text-muted-foreground/70">
            Drag a role here
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { setAnalysisSnapshot, setParsedPayload, resetWorkspace } = useResumeActions();

  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ApplicationStatus | null>(null);
  const [mobileStage, setMobileStage] = useState<ApplicationStatus>('saved');
  const mobileStageInitialized = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    listApplications()
      .then(items => {
        if (!cancelled) setApplications(items);
      })
      .catch(err => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load applications.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const handleStatusChange = useCallback((id: string, status: ApplicationStatus) => {
    setApplications(prev =>
      prev.map(app =>
        app.id === id ? { ...app, status, updatedAt: new Date().toISOString() } : app
      )
    );
    updateApplicationStatus(id, status).catch(err => {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
      // Re-sync with the server since the optimistic update may be wrong now.
      listApplications().then(setApplications).catch(() => {});
    });
  }, []);

  const handleView = useCallback(
    async (id: string) => {
      setOpeningId(id);
      try {
        const detail = await getApplication(id);
        if (!detail.analysis || !detail.parsed) {
          throw new Error('This application has no saved analysis to re-open.');
        }

        const result = mapAnalyzeAiResult(detail.analysis, detail.parsed.resumeData);
        // Applications saved from a bare resumeData payload have no source
        // meta; synthesize one so the workspace contract stays valid.
        const parsed = {
          ...detail.parsed,
          version: '2' as const,
          notes: detail.parsed.notes ?? [],
          source: detail.parsed.source ?? createEmptySourceMeta({ parser: 'application-rehydrate' }),
        };
        // Clear any in-progress workspace so the saved application loads
        // without inheriting a stale section order or bullet edits.
        resetWorkspace();
        setParsedPayload(parsed);
        setAnalysisSnapshot(
          analysisResultToSnapshot({
            ...result,
            id: detail.id,
            createdAt: detail.createdAt || result.createdAt,
          })
        );
        router.push('/results');
      } catch (err) {
        toast.error('Failed to open application', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
        setOpeningId(null);
      }
    },
    [resetWorkspace, router, setAnalysisSnapshot, setParsedPayload]
  );

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteApplication(id);
      setApplications(prev => prev.filter(app => app.id !== id));
      setSelectedId(current => (current === id ? null : current));
      toast.success('Application deleted');
    } catch (err) {
      toast.error('Failed to delete application', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setDeletingId(null);
    }
  }, []);

  const goToAnalyze = useCallback(() => router.push('/analyze'), [router]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id;
    setDragOverStage(overId ? (String(overId) as ApplicationStatus) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setDragOverStage(null);
      const { active, over } = event;
      if (!over) return;
      const id = String(active.id);
      const targetStage = String(over.id) as ApplicationStatus;
      const current = applications.find(app => app.id === id);
      if (current && current.status !== targetStage) {
        handleStatusChange(id, targetStage);
      }
    },
    [applications, handleStatusChange]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter(
      app =>
        app.company.toLowerCase().includes(q) || app.targetRole.toLowerCase().includes(q)
    );
  }, [applications, query]);

  const columns = useMemo(
    () =>
      STAGES.map(stage => ({
        stage,
        items: visible.filter(app => app.status === stage.id),
      })),
    [visible]
  );

  // Default the mobile stage filter to the first stage that has applications,
  // once, after the initial load — so the default tab isn't empty.
  useEffect(() => {
    if (mobileStageInitialized.current) return;
    const firstNonEmpty = columns.find(col => col.items.length > 0);
    if (firstNonEmpty) {
      setMobileStage(firstNonEmpty.stage.id);
      mobileStageInitialized.current = true;
    }
  }, [columns]);

  const mobileItems = useMemo(
    () => columns.find(col => col.stage.id === mobileStage)?.items ?? [],
    [columns, mobileStage]
  );

  const selectedApp = useMemo(
    () => applications.find(app => app.id === selectedId) ?? null,
    [applications, selectedId]
  );
  const activeApp = useMemo(
    () => applications.find(app => app.id === activeId) ?? null,
    [applications, activeId]
  );

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary/75">
            Your pipeline
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            Application Tracker
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {applications.length} {applications.length === 1 ? 'role' : 'roles'} across five stages
            <span className="hidden lg:inline"> · drag a card to move it through your search</span>.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 lg:w-auto">
          <div className="relative flex w-full items-center sm:w-auto">
            <Search className="pointer-events-none absolute left-3 h-[15px] w-[15px] text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search company or role"
              className="h-10 w-full pl-9 sm:w-[230px]"
            />
          </div>
          <Button onClick={goToAnalyze} className="h-10 w-full sm:w-auto">
            <Plus className="mr-1.5 h-[15px] w-[15px]" />
            Tailor for new role
          </Button>
        </div>
      </div>

      {authLoading || isLoading ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !user ? (
        <p className="mt-10 text-center text-muted-foreground">
          Sign in to see your saved applications.
        </p>
      ) : loadError ? (
        <p className="mt-10 text-center text-destructive">{loadError}</p>
      ) : applications.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">
          No applications yet — run an analysis and it will show up here.
        </p>
      ) : (
        <>
          {/* Desktop: drag-and-drop Kanban board */}
          <div className="hidden lg:block">
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setActiveId(null);
                setDragOverStage(null);
              }}
            >
              <div className="flex items-start gap-4 overflow-x-auto pb-6">
                {columns.map(({ stage, items }) => (
                  <BoardColumn
                    key={stage.id}
                    stage={stage}
                    items={items}
                    isOver={dragOverStage === stage.id}
                    onOpen={setSelectedId}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeApp ? <ApplicationCardOverlay application={activeApp} /> : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Mobile: stage chips filter + single vertical list */}
          <div className="lg:hidden">
            <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {columns.map(({ stage, items }) => {
                const active = stage.id === mobileStage;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setMobileStage(stage.id)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'border-primary/50 bg-card text-foreground shadow-sm'
                        : 'border-border/70 bg-card/50 text-muted-foreground'
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.accent }} />
                    {stage.label}
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums text-primary">
                      {items.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2.5">
              {mobileItems.length > 0 ? (
                mobileItems.map(app => (
                  <ApplicationCardButton key={app.id} application={app} onOpen={setSelectedId} />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground/70">
                  No roles in {STAGE_MAP[mobileStage].label}.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <ApplicationDetailDialog
        application={selectedApp}
        open={selectedId !== null}
        onOpenChange={open => {
          if (!open) setSelectedId(null);
        }}
        onStatusChange={handleStatusChange}
        onView={handleView}
        onDelete={handleDelete}
        opening={openingId === selectedId}
        deleting={deletingId === selectedId}
      />
    </div>
  );
}
