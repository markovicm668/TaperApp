'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminOnly } from '@/components/admin-only';
import { Button } from '@/components/ui/button';
import { ResumeInputCard } from '@/components/resume-input-card';
import { JobDescriptionCard } from '@/components/job-description-card';
import { AnalysisProgress } from '@/components/analysis-progress';
import { UpgradePlansDialog } from '@/components/upgrade-plans-dialog';
import { parseResume, parseResumePdf } from '@/lib/api';
import { useAnalyzeFlow } from '@/lib/analyze/useAnalyzeFlow';
import { analysisResultToSnapshot } from '@/lib/resume/mappers';
import { useResumeActions } from '@/lib/resume/store';
import { useAdmin } from '@/lib/auth/useAdmin';
import { useTokens } from '@/lib/tokens/TokenContext';
import { track } from '@/lib/analytics';
import type { AnalysisResult, ResumeInput } from '@/lib/types';

interface StatusPillProps {
  n: number;
  label: string;
  hint: string;
  ready?: boolean;
  pending?: boolean;
}

function StatusPill({ n, label, hint, ready, pending }: StatusPillProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
          ready
            ? 'border-primary bg-primary text-primary-foreground'
            : pending
              ? 'border-border bg-secondary/60 text-muted-foreground/70'
              : 'border-border bg-secondary/60 text-muted-foreground'
        }`}
      >
        {ready ? <Check className="h-3 w-3" strokeWidth={2.5} /> : n}
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[12px] font-semibold tracking-tight text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground/80">{hint}</span>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const router = useRouter();
  const {
    setSourceInput,
    setAnalysisSnapshot,
    setParsedPayload,
    resetWorkspace,
  } = useResumeActions();
  const { tokensRemaining, tokensLoading, entitled, setTokensRemaining } = useTokens();
  const { isAdmin } = useAdmin();

  const [resumeData, setResumeData] = useState<ResumeInput | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isParsingOnly, setIsParsingOnly] = useState(false);

  const {
    isAnalyzing,
    parseDone,
    handleAnalyze,
    handleAnalysisComplete,
    showOutOfCredits,
    setShowOutOfCredits,
  } = useAnalyzeFlow({
    source: 'analyze_page',
  });

  const canAnalyze = resumeData && jobDescription.trim().length > 50;
  const canParseOnly = Boolean(resumeData);
  const isBusy = isAnalyzing || isParsingOnly;

  // resume_uploaded / job_description_added are emitted from the shared
  // ResumeInputCard / JobDescriptionCard components.

  const handleAnalyzeClick = useCallback(() => {
    if (!resumeData || !jobDescription) return;
    if (!tokensLoading && !entitled && tokensRemaining <= 0) {
      track('analysis_blocked_out_of_credits', { source: 'analyze_page' });
      setShowOutOfCredits(true);
      return;
    }
    void handleAnalyze(resumeData, jobDescription);
  }, [handleAnalyze, jobDescription, resumeData, tokensLoading, entitled, tokensRemaining, setShowOutOfCredits]);

  const handleParseOnly = useCallback(async () => {
    if (!resumeData) return;

    setIsParsingOnly(true);

    setSourceInput({
      inputType: resumeData.type,
      rawText: resumeData.file ? '' : resumeData.content,
      fileName: resumeData.fileName,
      clearAnalysis: true,
    });

    try {
      const parseResultResponse = resumeData.file
        ? await parseResumePdf(resumeData.file)
        : await parseResume({
            resumeText: resumeData.content,
            inputType: resumeData.type,
            fileName: resumeData.fileName,
          });

      if (parseResultResponse.tokensRemaining !== undefined) {
        setTokensRemaining(parseResultResponse.tokensRemaining);
      }

      setParsedPayload(parseResultResponse);

      const parseOnlyResult: AnalysisResult = {
        id: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'completed',
        matchScore: 0,
        targetRole: 'Parsed Resume',
        company: 'Parse-only mode',
        overallFit: 'fair',
        roleSeniority: 'mid',
        keywordGaps: [],
        bulletChanges: [],
        rewriteSuggestions: [],
        atsChecks: [],
        riskFlags: [],
        recommendedEdits: [],
        skillCategoryRenames: [],
      };

      setAnalysisSnapshot(analysisResultToSnapshot(parseOnlyResult));
      router.push('/results');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'INSUFFICIENT_TOKENS') {
        toast.error('Insufficient tokens', {
          description: (err as unknown as Error).message,
        });
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown parse error occurred.';
      console.error('Parse API Error:', errorMessage, err);
      toast.error('Parse failed', {
        description: errorMessage || 'Please check the console for details.',
      });
    } finally {
      setIsParsingOnly(false);
    }
  }, [resumeData, router, setAnalysisSnapshot, setParsedPayload, setSourceInput, setTokensRemaining]);

  const handleReset = useCallback(() => {
    setResumeData(null);
    setJobDescription('');
    resetWorkspace();
  }, [resetWorkspace]);

  const resumeWordCount = resumeData?.content.trim()
    ? resumeData.content.trim().split(/\s+/).length
    : 0;
  const jdWordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0;
  const resumeReady = Boolean(resumeData);
  const jdReady = jobDescription.trim().length >= 50;
  const ready = resumeReady && jdReady;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-7">
      <div>
        <h1 className="mt-4 max-w-[720px] font-serif text-[2.35rem] font-semibold leading-[1.05] tracking-[-0.025em] text-balance sm:text-[2.65rem] xl:text-[3rem]">
          Tailor your resume to a{' '}
          <em className="font-normal italic text-primary">specific</em> role.
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-[1.6] text-muted-foreground">
          Paste a resume and a job description. Our system finds missing keywords, ATS issues, and suggests rewrites - all in under 50 seconds.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-[14px] border border-border/85 bg-card px-4 py-2.5 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.03)]">
        <StatusPill
          n={1}
          label="Resume"
          ready={resumeReady}
          hint={
            resumeReady
              ? resumeData?.file
                ? resumeData.fileName ?? 'PDF attached'
                : `${resumeWordCount.toLocaleString()} words`
              : 'Awaiting input'
          }
        />
        <div className="mx-1 h-px flex-1 bg-border" />
        <StatusPill
          n={2}
          label="Job description"
          ready={jdReady}
          hint={
            jdReady
              ? `${jdWordCount.toLocaleString()} words`
              : jobDescription.trim().length > 0
                ? 'Min 50 characters'
                : 'Awaiting input'
          }
        />
        <div className="mx-1 h-px flex-1 bg-border" />
        <StatusPill
          n={3}
          label="Analyze"
          pending={!ready}
          hint={ready ? 'Ready' : 'Locked'}
        />
      </div>

      <div className="grid flex-1 gap-5 xl:grid-cols-2">
        <ResumeInputCard onResumeChange={setResumeData} />
        <JobDescriptionCard onJobDescriptionChange={setJobDescription} />
      </div>

      <div className="rounded-2xl border border-border/85 bg-card p-5 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.04)] sm:px-6 sm:py-[18px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {ready
                ? 'Ready to analyze'
                : !resumeData
                  ? 'Add inputs to continue'
                  : jobDescription.length < 50
                    ? 'Add inputs to continue'
                    : 'Ready to analyze'}
            </p>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {ready ? (
                <>
                  This run will use <strong className="font-semibold text-foreground">1 credit</strong>.{' '}
                  You have <strong className="font-semibold text-foreground">{tokensRemaining}</strong>{' '}
                  remaining.
                </>
              ) : !resumeData ? (
                <>Paste your resume above to get started.</>
              ) : jobDescription.length < 50 ? (
                <>
                  Job description must be at least 50 characters
                  {isAdmin ? ' (not required for Parse Resume Only).' : '.'}
                </>
              ) : (
                <>Both fields look good — tap Analyze when you&apos;re ready.</>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <AdminOnly>
              <Button variant="ghost" onClick={handleReset} disabled={isBusy}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reset
              </Button>
              <Button
                variant="outline"
                onClick={handleParseOnly}
                disabled={!canParseOnly || isBusy}
              >
                Parse only
              </Button>
            </AdminOnly>
            <Button
              size="lg"
              onClick={handleAnalyzeClick}
              disabled={!canAnalyze || isBusy}
              className="gap-2"
            >
              <Wand2 className="h-4 w-4" />
              Analyze resume
              <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">⏎</span>
            </Button>
          </div>
        </div>
      </div>

      <AnalysisProgress open={isAnalyzing} parseDone={parseDone} onComplete={handleAnalysisComplete} />
      <UpgradePlansDialog
        open={showOutOfCredits}
        onOpenChange={setShowOutOfCredits}
        source="out_of_credits"
        showInvitePanel
        title="You're out of credits"
        description="Upgrade for unlimited analyses, or invite a friend for free credits."
      />
    </div>
  );
}
