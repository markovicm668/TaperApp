'use client';

import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScoreRing } from '@/components/score-ring';
import { STAGES, formatDate, relativeTime } from '@/lib/applications/stages';
import type { ApplicationStatus, ApplicationSummary } from '@/lib/types';

interface ApplicationDetailDialogProps {
  application: ApplicationSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  opening: boolean;
  deleting: boolean;
}

export function ApplicationDetailDialog({
  application,
  open,
  onOpenChange,
  onStatusChange,
  onView,
  onDelete,
  opening,
  deleting,
}: ApplicationDetailDialogProps) {
  if (!application) return null;

  const appliedDate = formatDate(application.createdAt);
  const activity = relativeTime(application.updatedAt ?? application.createdAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <ScoreRing score={application.matchScore} size="sm" />
            <div className="min-w-0">
              <DialogTitle className="truncate font-serif text-xl font-semibold tracking-tight">
                {application.company || 'Untitled company'}
              </DialogTitle>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {application.targetRole || 'Untitled role'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Stage
            </span>
            <Select
              value={application.status}
              onValueChange={value => onStatusChange(application.id, value as ApplicationStatus)}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(stage => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {application.status === 'saved' ? 'Added' : 'Applied'}
            </span>
            <div className="flex h-10 items-center rounded-lg border border-input/95 bg-muted px-3.5 font-mono text-sm text-foreground">
              {appliedDate || activity || '—'}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            className="order-last w-full border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive sm:order-first sm:w-auto"
            onClick={() => onDelete(application.id)}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Delete
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              className="order-2 w-full sm:order-1 sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="order-1 w-full sm:order-2 sm:w-auto"
              onClick={() => onView(application.id)}
              disabled={opening}
            >
              {opening ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              )}
              View tailored resume
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
