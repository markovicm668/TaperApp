'use client';

import { useDraggable } from '@dnd-kit/core';
import { Sparkles } from 'lucide-react';
import { cardDateLabel } from '@/lib/applications/stages';
import { cn } from '@/lib/utils';
import type { ApplicationSummary } from '@/lib/types';
import { ScoreRing } from '@/components/score-ring';

const CARD_CLASS =
  'flex w-full flex-col gap-3 rounded-2xl border border-border/85 bg-card p-3.5 text-left shadow-[0_1px_1px_rgba(15,23,42,0.05),0_8px_22px_rgba(15,23,42,0.03)] transition-[box-shadow,border-color]';

function CardInner({ application }: { application: ApplicationSummary }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold leading-tight tracking-tight">
            {application.company || 'Untitled company'}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {application.targetRole || 'Untitled role'}
          </div>
        </div>

        <ScoreRing score={application.matchScore} size="xs" className="shrink-0" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground/90">
          {cardDateLabel(application.status, application.createdAt, application.updatedAt)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          <Sparkles className="h-2.5 w-2.5" />
          Tailored
        </span>
      </div>
    </>
  );
}

interface ApplicationCardProps {
  application: ApplicationSummary;
  onOpen: (id: string) => void;
}

/**
 * Minimal tracker card: type-led with no monogram or ring — company / role over
 * a slim match meter and a mono date line. Draggable between stage columns.
 */
export function ApplicationCard({ application, onOpen }: ApplicationCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onOpen(application.id)}
      className={cn(
        CARD_CLASS,
        'cursor-grab hover:border-primary/40 hover:shadow-[0_6px_26px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
      {...attributes}
      {...listeners}
    >
      <CardInner application={application} />
    </button>
  );
}

/**
 * Non-draggable, clickable card for the mobile list (rendered outside any
 * DndContext, so it must not call useDraggable).
 */
export function ApplicationCardButton({ application, onOpen }: ApplicationCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(application.id)}
      className={cn(
        CARD_CLASS,
        'hover:border-primary/40 hover:shadow-[0_6px_26px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'
      )}
    >
      <CardInner application={application} />
    </button>
  );
}

/** Presentational clone rendered inside the dnd-kit DragOverlay while dragging. */
export function ApplicationCardOverlay({ application }: { application: ApplicationSummary }) {
  return (
    <div className={cn(CARD_CLASS, 'cursor-grabbing border-primary/40 shadow-[0_18px_40px_rgba(15,23,42,0.22)]')}>
      <CardInner application={application} />
    </div>
  );
}
