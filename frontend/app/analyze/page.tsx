'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ResumeInputCard } from '@/components/resume-input-card';
import { JobDescriptionCard } from '@/components/job-description-card';
import { AnalysisProgress } from '@/components/analysis-progress';
import { analyzeResume, parseResume, parseResumePdf, analyzeResumePdf } from '@/lib/api';
import { analysisResultToSnapshot } from '@/lib/resume/mappers';
import { useResumeActions } from '@/lib/resume/store';
import { useTokens } from '@/lib/tokens/TokenContext';
import type { AnalysisResult, ResumeInput } from '@/lib/types';

export default function AnalyzePage() {
  const router = useRouter();
  const {
    setSourceInput,
    setAnalysisSnapshot,
    setParsedPayload,
    resetWorkspace,
  } =
    useResumeActions();
  const { setTokensRemaining } = useTokens();

  const [resumeData, setResumeData] = useState<ResumeInput | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isParsingOnly, setIsParsingOnly] = useState(false);

  const [parseDone, setParseDone] = useState(false);

  // Both flags must be true before we navigate to results.
  // Using refs so the check always reads latest values without stale closures.
  const apiDoneRef = useRef(false);
  const progressDoneRef = useRef(false);
  const apiErrorRef = useRef(false);

  const canAnalyze = resumeData && jobDescription.trim().length > 50;
  const canParseOnly = Boolean(resumeData);
  const isBusy = isAnalyzing || isParsingOnly;

  const tryNavigateToResults = useCallback(() => {
    if (apiDoneRef.current && progressDoneRef.current) {
      setIsAnalyzing(false);
      if (!apiErrorRef.current) {
        router.push('/results');
      }
    }
  }, [router]);

  const handleAnalyze = useCallback(async () => {
    if (!resumeData || !jobDescription) return;

    setParseDone(false);
    progressDoneRef.current = false;
    apiErrorRef.current = false;
    setIsAnalyzing(true);

    setSourceInput({
      inputType: resumeData.type,
      rawText: resumeData.file ? '' : resumeData.content,
      fileName: resumeData.fileName,
      clearAnalysis: true,
    });

    try {
      // Step 1: Parse resume separately so the progress dialog
      // reflects real parse time (costs 1 token).
      const parseResult = resumeData.file
        ? await parseResumePdf(resumeData.file)
        : await parseResume({
            resumeText: resumeData.content,
            inputType: resumeData.type,
            fileName: resumeData.fileName,
          });
      setParsedPayload(parseResult);
      setParseDone(true);

      // Step 2: Run full analysis (costs 3 tokens).
      // Pass the already-parsed resumeData so the backend skips re-parsing.
      const { result, parsed, tokensRemaining } = resumeData.file
        ? await analyzeResumePdf(resumeData.file, jobDescription, parseResult.resumeData)
        : await analyzeResume(
            { type: resumeData.type, content: resumeData.content, fileName: resumeData.fileName },
            { text: jobDescription },
            parseResult.resumeData
          );

      if (tokensRemaining !== undefined) {
        setTokensRemaining(tokensRemaining);
      }

      if (parsed && parsed.source) {
        setParsedPayload(parsed);
      }

      const resultWithSource: AnalysisResult = {
        ...result,
        id: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'completed',
      };

      setAnalysisSnapshot(analysisResultToSnapshot(resultWithSource));
      apiDoneRef.current = true;
      tryNavigateToResults();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'INSUFFICIENT_TOKENS') {
        toast.error('Insufficient tokens', {
          description: (err as unknown as Error).message,
        });
        setParseDone(true);
        setIsAnalyzing(false);
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown API error occurred.';
      console.error('Analysis API Error:', errorMessage, err);

      const errorResult: AnalysisResult = {
        id: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'failed',
        matchScore: 0,
        targetRole: 'Analysis Failed',
        company: 'API Error',
        overallFit: 'poor',
        roleSeniority: 'mid',
        keywordGaps: [],
        bulletChanges: [],
        rewriteSuggestions: [],
        atsChecks: [],
        riskFlags: [{ id: 'err', title: 'API Failure', description: errorMessage, severity: 'high' }],
        recommendedEdits: [],
        skillCategoryRenames: [],
      };

      setAnalysisSnapshot(analysisResultToSnapshot(errorResult));
      setParsedPayload(null);

      toast.error('Analysis failed', {
        description: errorMessage || 'Please check the console for details.',
      });

      setParseDone(true);
      apiDoneRef.current = true;
      apiErrorRef.current = true;
      tryNavigateToResults();
    }
  }, [
    jobDescription,
    resumeData,
    setAnalysisSnapshot,
    setParsedPayload,
    setSourceInput,
    setTokensRemaining,
    tryNavigateToResults,
  ]);


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

  const handleAnalysisComplete = useCallback(() => {
    progressDoneRef.current = true;
    tryNavigateToResults();
  }, [tryNavigateToResults]);

  const handleReset = useCallback(() => {
    setResumeData(null);
    setJobDescription('');
    resetWorkspace();
  }, [resetWorkspace]);

  return (
    <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-8">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-primary/75">
          Resume Workspace
        </p>
        <h1 className="mt-2 font-serif text-[2.15rem] font-semibold leading-tight tracking-tight text-balance sm:text-[2.35rem]">
          Analyze Resume
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Paste your resume and a job description to get tailored rewrite suggestions.
        </p>
      </div>

      <div className="grid flex-1 gap-6 xl:grid-cols-2">
        <ResumeInputCard onResumeChange={setResumeData} />
        <JobDescriptionCard onJobDescriptionChange={setJobDescription} />
      </div>

      <div className="rounded-2xl border border-border/85 bg-card/90 p-4 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_8px_24px_rgba(15,23,42,0.03)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Ready to run analysis</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ensure your resume and job description are complete for better scoring quality.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="outline" onClick={handleReset} disabled={isBusy}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button
              variant="secondary"
              onClick={handleParseOnly}
              disabled={!canParseOnly || isBusy}
            >
              Parse Resume Only
            </Button>
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={!canAnalyze || isBusy}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Analyze Resume
            </Button>
          </div>
        </div>
      </div>

      {!canAnalyze && (resumeData || jobDescription) && (
        <p className="text-sm text-muted-foreground/95">
          {!resumeData
            ? 'Please paste your resume'
            : jobDescription.length < 50
              ? 'Job description must be at least 50 characters (not required for Parse Resume Only)'
              : null}
        </p>
      )}

      <AnalysisProgress open={isAnalyzing} parseDone={parseDone} onComplete={handleAnalysisComplete} />
    </div>
  );
}
