import type { ApplicationStatus } from '@/lib/types';

export interface StageDescriptor {
  id: ApplicationStatus;
  label: string;
  /** Accent hex used for column dots, count pills, and the card match meter. */
  accent: string;
}

// Ordered left-to-right as the pipeline columns on the tracker board. The enum
// value stays `interview` (see lib/types.ts) while the label reads "Interviewing".
export const STAGES: StageDescriptor[] = [
  { id: 'saved', label: 'Saved', accent: '#8493bd' },
  { id: 'applied', label: 'Applied', accent: '#49567e' },
  { id: 'interview', label: 'Interviewing', accent: '#3b6ea5' },
  { id: 'offer', label: 'Offer', accent: '#1f7a4a' },
  { id: 'rejected', label: 'Rejected', accent: '#c53f3f' },
];

export const STAGE_MAP: Record<ApplicationStatus, StageDescriptor> = STAGES.reduce(
  (acc, stage) => {
    acc[stage.id] = stage;
    return acc;
  },
  {} as Record<ApplicationStatus, StageDescriptor>
);

/** Tailwind text-color class for a match score, matching ScoreRing thresholds. */
export function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-warning';
  return 'text-destructive';
}

/** CSS color value (theme token) for a match score, for inline meter fills. */
export function scoreColorVar(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--primary)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--destructive)';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Short relative time, e.g. "just now", "3d ago", "2w ago". */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/** The mono date line on a tracker card, e.g. "Applied Jun 10 · 1d ago". */
export function cardDateLabel(status: ApplicationStatus, createdAt: string | null, updatedAt: string | null): string {
  const activity = relativeTime(updatedAt ?? createdAt);
  if (status === 'saved') {
    return activity ? `Saved · ${activity}` : 'Saved';
  }
  const applied = formatDate(createdAt);
  if (applied && activity) return `Applied ${applied} · ${activity}`;
  if (applied) return `Applied ${applied}`;
  return activity;
}
