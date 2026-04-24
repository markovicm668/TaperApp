'use client';

import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Lock, ListOrdered } from 'lucide-react';
import type { SectionViewModelRow } from '@/lib/resume/mappers';
import { HEADER_SECTION_ORDER_KEY } from '@/lib/resume/section-order';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SectionOrderDialogProps {
  sections: SectionViewModelRow[];
  onOrderChange: (sectionOrder: string[]) => void;
  onResetOrder: () => void;
}

interface SortableSectionItem {
  key: string;
  title: string;
}

function SortableSectionRow({ item }: { item: SortableSectionItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border/75 bg-background/80 px-3 py-2',
        isDragging && 'z-10 border-primary/60 shadow-lg'
      )}
    >
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        aria-label={`Drag to reorder ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
      </div>
      <span className="text-[11px] text-muted-foreground">Drag</span>
    </li>
  );
}

export function SectionOrderDialog({
  sections,
  onOrderChange,
  onResetOrder,
}: SectionOrderDialogProps) {
  const [open, setOpen] = useState(false);

  const visibleSections = useMemo(
    () => sections.filter(section => section.hasContent),
    [sections]
  );

  const headerSection = useMemo(
    () => visibleSections.find(section => section.key === HEADER_SECTION_ORDER_KEY),
    [visibleSections]
  );

  const sortableItems = useMemo<SortableSectionItem[]>(
    () =>
      visibleSections
        .filter(section => section.key !== HEADER_SECTION_ORDER_KEY)
        .map(section => ({
          key: section.key,
          title: section.title,
        })),
    [visibleSections]
  );

  const sortableIds = useMemo(() => sortableItems.map(item => item.key), [sortableItems]);
  const hasVisibleSections = visibleSections.length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId || !overId || activeId === overId) return;

    const oldIndex = sortableItems.findIndex(item => item.key === activeId);
    const newIndex = sortableItems.findIndex(item => item.key === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextSortable = arrayMove(sortableItems, oldIndex, newIndex);
    const nextOrder = [
      ...(headerSection ? [headerSection.key] : []),
      ...nextSortable.map(item => item.key),
    ];

    onOrderChange(nextOrder);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!hasVisibleSections}
      >
        <ListOrdered className="mr-2 h-4 w-4" />
        Arrange Sections
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Arrange Sections</DialogTitle>
            <DialogDescription>
              Drag sections to change their order. This order also controls PDF export.
            </DialogDescription>
          </DialogHeader>

          {!hasVisibleSections ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
              No renderable sections are available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {headerSection && (
                <div className="rounded-lg border border-border/75 bg-muted/35 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{headerSection.title}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Pinned first</span>
                  </div>
                </div>
              )}

              <div className="max-h-[380px] overflow-auto pr-1">
                {sortableItems.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-2">
                        {sortableItems.map(item => (
                          <SortableSectionRow key={item.key} item={item} />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/25 px-4 py-4 text-sm text-muted-foreground">
                    No additional sections to reorder.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onResetOrder}
              disabled={!hasVisibleSections}
            >
              Reset to Default
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
