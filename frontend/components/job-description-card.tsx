'use client';

import { useState, useCallback, useRef } from 'react';
import { Briefcase, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { sampleJobDescription } from '@/lib/api';
import { track } from '@/lib/analytics';
import { AdminOnly } from '@/components/admin-only';

interface JobDescriptionCardProps {
  onJobDescriptionChange: (text: string) => void;
  hideSampleButton?: boolean;
}

export function JobDescriptionCard({ onJobDescriptionChange, hideSampleButton = false }: JobDescriptionCardProps) {
  const [jobDescription, setJobDescription] = useState('');

  // Fire job_description_added once the JD is substantive, from this single
  // funnel so both the /analyze page and the guest landing page emit it.
  const jdTrackedRef = useRef(false);
  const handleChange = useCallback(
    (text: string) => {
      setJobDescription(text);
      onJobDescriptionChange(text);
      const len = text.trim().length;
      if (len > 50 && !jdTrackedRef.current) {
        jdTrackedRef.current = true;
        track('job_description_added', { char_count: len });
      } else if (len === 0 && jdTrackedRef.current) {
        jdTrackedRef.current = false;
      }
    },
    [onJobDescriptionChange]
  );

  const insertSampleJd = useCallback(() => {
    handleChange(sampleJobDescription);
  }, [handleChange]);

  const wordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0;

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-[18px] border-border/85 bg-card py-0 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.04)]">
      <CardHeader className="px-5 pb-4 pt-5 sm:px-[22px] sm:pt-[22px]">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-primary/20 bg-gradient-to-b from-primary/10 to-primary/5 text-primary">
              <Briefcase className="h-[15px] w-[15px]" />
            </span>
            <div className="leading-tight">
              <div className="text-[17px] font-semibold tracking-[-0.015em] text-foreground">
                Job description
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                The role you&apos;re tailoring for.
              </div>
            </div>
          </div>
          {!hideSampleButton && (
            <AdminOnly>
              <Button
                variant="quiet"
                size="sm"
                onClick={insertSampleJd}
                className="h-7 gap-1.5 whitespace-nowrap rounded-[7px] border border-primary/15 bg-primary/[0.08] px-2.5 text-[12px] font-medium text-primary hover:bg-primary/[0.15]"
              >
                <Sparkles className="h-3 w-3" />
                Use sample
              </Button>
            </AdminOnly>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-5 pb-5 sm:px-[22px] sm:pb-[22px]">
        <div className="flex flex-1 flex-col">
          <textarea
            id="job-description"
            placeholder="Senior Frontend Engineer — Stripe&#10;&#10;About the role&#10;We're hiring a senior frontend engineer to…&#10;&#10;What you'll do&#10;• Architect and ship features in TypeScript&#10;• Design and integrate GraphQL APIs"
            className="min-h-[300px] w-full flex-1 resize-none rounded-xl border border-border/70 bg-muted/55 px-4 py-3.5 text-[13.5px] leading-[1.65] text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-[3px] focus:ring-primary/15"
            value={jobDescription}
            onChange={e => handleChange(e.target.value)}
          />
          <div className="mt-2.5 flex items-center justify-between px-1 text-[11.5px] text-muted-foreground/80">
            <span>Include responsibilities, qualifications, and any &ldquo;nice to haves&rdquo;.</span>
            <span className="font-medium tabular-nums">
              {jobDescription.length.toLocaleString()} chars · {wordCount} words
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
