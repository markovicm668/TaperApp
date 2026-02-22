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
  onComplete: () => void;
}

const steps: { key: AnalysisStep; label: string; duration: number }[] = [
  { key: 'parsing', label: 'Parsing resume', duration: 1500 },
  { key: 'extracting', label: 'Extracting requirements', duration: 2000 },
  { key: 'matching', label: 'Matching keywords', duration: 2500 },
  { key: 'rewriting', label: 'Rewriting bullets', duration: 2000 },
  { key: 'complete', label: 'Analysis complete', duration: 500 },
];

export function AnalysisProgress({ open, onComplete }: AnalysisProgressProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setCurrentStepIndex(0);
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const advanceStep = (index: number) => {
      if (index < steps.length - 1) {
        timeoutId = setTimeout(() => {
          setCurrentStepIndex(index + 1);
          advanceStep(index + 1);
        }, steps[index].duration);
      } else {
        timeoutId = setTimeout(() => {
          onComplete();
        }, steps[index].duration);
      }
    };

    advanceStep(0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [open, onComplete]);

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-center font-serif text-2xl font-semibold">Analyzing Your Resume</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground/95">
            Our AI is tailoring your resume to the job description
          </DialogDescription>
        </DialogHeader>
        <div className="py-6">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const isComplete = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isPending = index > currentStepIndex;

              return (
                <div
                  key={step.key}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-4 py-3 transition-all',
                    isComplete && 'border-success/20 bg-success/[0.08]',
                    isCurrent && 'border-primary/30 bg-primary/[0.08]',
                    isPending && 'border-border/70 bg-background/55 opacity-60'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
                      isComplete && 'border-success/30 bg-success/[0.15] text-success',
                      isCurrent && 'border-primary/35 bg-primary/[0.15] text-primary',
                      isPending && 'border-border/70 bg-secondary/60 text-muted-foreground'
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="text-sm">{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'font-medium tracking-tight',
                      isComplete && 'text-success',
                      isCurrent && 'text-foreground',
                      isPending && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary/80">
              <div
                className="h-full bg-primary/90 transition-all duration-500 ease-out"
                style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-center text-sm text-muted-foreground/95">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
