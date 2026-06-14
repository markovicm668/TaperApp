'use client';

import { cn } from '@/lib/utils';
import type { ScoreBreakdown } from '@/lib/types';

interface ScoreBreakdownPanelProps {
  scores?: ScoreBreakdown;
  className?: string;
}

const DIMENSIONS: Array<{ key: keyof ScoreBreakdown; label: string }> = [
  { key: 'roleMatch', label: 'Role match' },
  { key: 'skillsCoverage', label: 'Skills coverage' },
  { key: 'seniorityFit', label: 'Seniority fit' },
  { key: 'keywordAlignment', label: 'Keyword alignment' },
];

function barColorClass(value: number): string {
  if (value >= 80) return 'bg-success';
  if (value >= 60) return 'bg-primary';
  if (value >= 40) return 'bg-warning';
  return 'bg-destructive';
}

export function ScoreBreakdownPanel({ scores, className }: ScoreBreakdownPanelProps) {
  const dimensions = DIMENSIONS.flatMap(({ key, label }) => {
    const score = scores?.[key];
    return score ? [{ key, label, value: score.value, note: score.note }] : [];
  });

  if (!dimensions.length) return null;

  return (
    <section
      aria-label="Score breakdown"
      className={cn(
        'mb-[18px] rounded-2xl border border-border/85 bg-card/90 p-4 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.03)] sm:px-5',
        className
      )}
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {dimensions.map(dimension => (
          <div key={dimension.key} className="min-w-0" title={dimension.note || undefined}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold tracking-tight text-foreground">
                {dimension.label}
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">
                {dimension.value}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/70">
              <div
                className={cn('h-full rounded-full transition-all duration-700 ease-out', barColorClass(dimension.value))}
                style={{ width: `${Math.max(0, Math.min(100, dimension.value))}%` }}
              />
            </div>
            {dimension.note && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">
                {dimension.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
