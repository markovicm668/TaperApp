'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AnalysisStep } from '@/lib/types';

interface AnalysisProgressProps {
  open: boolean;
  parseDone: boolean;
  onComplete: () => void;
}

const steps: { key: AnalysisStep; label: string; sub: string; duration: number }[] = [
  { key: 'parsing', label: 'Parsing resume', sub: 'Tokenizing sections, normalizing dates', duration: 0 },
  { key: 'extracting', label: 'Extracting requirements', sub: 'Reading the job posting', duration: 2000 },
  { key: 'matching', label: 'Matching keywords', sub: 'Comparing against detected skills', duration: 2500 },
  { key: 'rewriting', label: 'Rewriting bullets', sub: 'Generating tailored alternatives', duration: 2000 },
  { key: 'complete', label: 'Computing score', sub: 'Scoring fit & ATS readiness', duration: 500 },
];

export function AnalysisProgress({ open, parseDone, onComplete }: AnalysisProgressProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStepIndex(0);
    }
  }, [open]);

  // Step 0 (parsing) waits for parseDone signal instead of a timer
  useEffect(() => {
    if (open && parseDone && currentStepIndex === 0) {
      setCurrentStepIndex(1);
    }
  }, [open, parseDone, currentStepIndex]);

  // Steps 1+ advance on timers
  useEffect(() => {
    if (!open || currentStepIndex === 0) return;

    const step = steps[currentStepIndex];
    if (!step) return;

    const timeoutId = setTimeout(() => {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
      } else {
        onComplete();
      }
    }, step.duration);

    return () => clearTimeout(timeoutId);
  }, [open, currentStepIndex, onComplete]);

  return (
    <Dialog open={open}>
      <DialogContent
        className="rounded-[18px] p-7 sm:max-w-[460px]"
        showCloseButton={false}
      >
        <DialogHeader className="space-y-0">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/[0.10] text-primary">
              <Loader2 className="h-[22px] w-[22px] animate-spin" strokeWidth={2.2} />
            </div>
            <div className="text-left">
              <DialogTitle className="font-serif text-[20px] font-semibold leading-tight tracking-[-0.015em]">
                Analyzing your resume
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[12.5px] text-muted-foreground/85">
                Tailoring to the job description — typically under 50 seconds.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-5">
          <div className="flex flex-col gap-1.5">
            {steps.map((step, index) => {
              const isComplete = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isPending = index > currentStepIndex;

              return (
                <div
                  key={step.key}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[9px] border border-transparent px-3 py-2.5 transition-all',
                    isComplete && 'border-success/[0.22] bg-success/[0.07]',
                    isCurrent && 'border-primary/[0.22] bg-primary/[0.07]',
                    isPending && 'opacity-50'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                      isComplete && 'bg-success/[0.20] text-success',
                      isCurrent && 'bg-primary/[0.18] text-primary',
                      isPending && 'bg-secondary/60 text-muted-foreground/70'
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    ) : isCurrent ? (
                      <Loader2 className="h-[13px] w-[13px] animate-spin" strokeWidth={2.2} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div
                      className={cn(
                        'text-[13px] font-semibold tracking-tight',
                        isComplete && 'text-success',
                        isCurrent && 'text-foreground',
                        isPending && 'text-muted-foreground/70'
                      )}
                    >
                      {step.label}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground/85">
                      {step.sub}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-[18px]">
            <div className="h-[5px] overflow-hidden rounded-full bg-secondary/80">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-center text-[11.5px] text-muted-foreground/70">
              Step {Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
