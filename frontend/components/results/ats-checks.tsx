'use client';

import { Check, AlertTriangle, X, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ATSCheck } from '@/lib/types';

interface ATSChecksProps {
  checks: ATSCheck[];
}

export function ATSChecks({ checks }: ATSChecksProps) {
  const passCount = checks.filter(c => c.status === 'pass').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  const failCount = checks.filter(c => c.status === 'fail').length;

  const getStatusIcon = (status: ATSCheck['status']) => {
    switch (status) {
      case 'pass':
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/20">
            <Check className="h-3.5 w-3.5 text-success" />
          </div>
        );
      case 'warning':
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/20">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          </div>
        );
      case 'fail':
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/20">
            <X className="h-3.5 w-3.5 text-destructive" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1.5">
          <Check className="h-4 w-4 text-success" />
          <span className="text-sm font-medium text-success">{passCount} Passed</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-warning/20 bg-warning/10 px-3 py-1.5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium text-warning">{warningCount} Warnings</span>
        </div>
        {failCount > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1.5">
            <X className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">{failCount} Failed</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {checks.map(check => (
          <Card
            key={check.id}
            className={cn(
              'border-border/80 bg-card/85 transition-colors',
              check.status === 'pass' && 'border-l-4 border-l-success/70',
              check.status === 'warning' && 'border-l-4 border-l-warning/70',
              check.status === 'fail' && 'border-l-4 border-l-destructive/70'
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                {getStatusIcon(check.status)}
                <div className="flex-1 space-y-1">
                  <CardTitle className="text-sm font-medium">{check.name}</CardTitle>
                  <CardDescription className="text-sm">{check.message}</CardDescription>
                </div>
              </div>
            </CardHeader>
            {check.tip && (
              <CardContent className="pt-0">
                <div className="flex items-start gap-2 rounded-xl border border-border/80 bg-muted/60 px-3 py-2.5">
                  <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <p className="text-sm text-muted-foreground">{check.tip}</p>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Card className="border-border/80 bg-muted/45">
        <CardHeader>
          <CardTitle className="text-sm">What is ATS?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Applicant Tracking Systems (ATS) are software used by employers to filter resumes before
            human review. These checks ensure your resume is optimized to pass through ATS filters
            and reach recruiters.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
