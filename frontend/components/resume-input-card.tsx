'use client';

import { useState, useCallback } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sampleResume } from '@/lib/api';

interface ResumeInputCardProps {
  onResumeChange: (data: { type: 'file' | 'text' | 'linkedin'; content: string; fileName?: string } | null) => void;
}

export function ResumeInputCard({ onResumeChange }: ResumeInputCardProps) {
  const [pastedText, setPastedText] = useState('');

  const handlePastedTextChange = useCallback(
    (text: string) => {
      setPastedText(text);
      if (text.trim()) {
        onResumeChange({ type: 'text', content: text });
      } else {
        onResumeChange(null);
      }
    },
    [onResumeChange]
  );

  const insertSampleResume = useCallback(() => {
    handlePastedTextChange(sampleResume);
  }, [handlePastedTextChange]);

  return (
    <Card className="flex h-full flex-col border-border/85 bg-card/92 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.035)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              Resume
            </CardTitle>
            <CardDescription className="max-w-md leading-relaxed text-muted-foreground/95">
              Paste the resume content directly.
            </CardDescription>
          </div>
          <Button
            variant="quiet"
            size="sm"
            onClick={insertSampleResume}
            className="gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Use Sample Resume
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col space-y-2">
          <Label htmlFor="resume-text" className="text-sm font-semibold text-foreground/90">
            Resume Content
          </Label>
          <Textarea
            id="resume-text"
            placeholder="Paste your resume text here."
            className="min-h-[300px] flex-1 resize-none text-sm leading-relaxed"
            value={pastedText}
            onChange={e => handlePastedTextChange(e.target.value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground/95">
            <span>Paste your full resume text</span>
            <span>{pastedText.length.toLocaleString()} characters</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
