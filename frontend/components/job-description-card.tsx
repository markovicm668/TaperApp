'use client';

import { useState, useCallback } from 'react';
import { Briefcase, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sampleJobDescription } from '@/lib/api';
import { AdminOnly } from '@/components/admin-only';

interface JobDescriptionCardProps {
  onJobDescriptionChange: (text: string) => void;
}

export function JobDescriptionCard({ onJobDescriptionChange }: JobDescriptionCardProps) {
  const [jobDescription, setJobDescription] = useState('');

  const handleChange = useCallback(
    (text: string) => {
      setJobDescription(text);
      onJobDescriptionChange(text);
    },
    [onJobDescriptionChange]
  );

  const insertSampleJd = useCallback(() => {
    handleChange(sampleJobDescription);
  }, [handleChange]);

  return (
    <Card className="flex h-full flex-col border-border/85 bg-card/92 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.035)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <Briefcase className="h-4 w-4" />
              </span>
              Job Description
            </CardTitle>
            <CardDescription className="max-w-md leading-relaxed text-muted-foreground/95">
              Paste the job posting you want to tailor your resume for.
            </CardDescription>
          </div>
          <AdminOnly>
            <Button
              variant="quiet"
              size="sm"
              onClick={insertSampleJd}
              className="gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Use Sample JD
            </Button>
          </AdminOnly>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col space-y-2">
          <Label htmlFor="job-description" className="text-sm font-semibold text-foreground/90">
            Job Description Content
          </Label>
          <Textarea
            id="job-description"
            placeholder="Paste the complete job description here. Include responsibilities, qualifications, and any other relevant details to get the best analysis."
            className="min-h-[300px] flex-1 resize-none text-sm leading-relaxed"
            value={jobDescription}
            onChange={e => handleChange(e.target.value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground/95">
            <span>Paste the full job posting for best results</span>
            <span>{jobDescription.length.toLocaleString()} characters</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
