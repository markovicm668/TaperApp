'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ResumeInputCard } from '@/components/resume-input-card';
import { JobDescriptionCard } from '@/components/job-description-card';
import { AnalysisProgress } from '@/components/analysis-progress';
import { analyzeResume, parseResume } from '@/lib/api';
import { analysisResultToSnapshot } from '@/lib/resume/mappers';
import { useResumeActions } from '@/lib/resume/store';
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

  const [resumeData, setResumeData] = useState<ResumeInput | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const progressCompleteRef = useRef(false);

  const canAnalyze = resumeData && jobDescription.trim().length > 50;

  const handleAnalyze = useCallback(async () => {
    if (!resumeData || !jobDescription) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    progressCompleteRef.current = false;

    setSourceInput({
      inputType: resumeData.type,
      rawText: resumeData.content,
      fileName: resumeData.fileName,
      clearAnalysis: true,
    });

    try {
      const [analysisResultResponse, parseResultResponse] = await Promise.all([
        analyzeResume(
          { type: resumeData.type, content: resumeData.content, fileName: resumeData.fileName },
          { text: jobDescription }
        ),
        parseResume({
          resumeText: resumeData.content,
          inputType: resumeData.type,
          fileName: resumeData.fileName,
        }),
      ]);

      setParsedPayload(parseResultResponse);
      const result = analysisResultResponse;

      const resultWithSource: AnalysisResult = {
        ...result,
        id: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'completed',
      };

      setAnalysisSnapshot(analysisResultToSnapshot(resultWithSource));
      setAnalysisResult(resultWithSource);

      if (progressCompleteRef.current) {
        router.push('/results');
      }
    } catch (err: unknown) {
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
      };

      setAnalysisSnapshot(analysisResultToSnapshot(errorResult));
      setAnalysisResult(errorResult);
      setParsedPayload(null);

      toast.error('Analysis failed', {
        description: errorMessage || 'Please check the console for details.',
      });
      setIsAnalyzing(false);
    }
  }, [
    jobDescription,
    resumeData,
    router,
    setAnalysisSnapshot,
    setParsedPayload,
    setSourceInput,
  ]);

  const handleAnalysisComplete = useCallback(() => {
    progressCompleteRef.current = true;

    if (analysisResult) {
      setIsAnalyzing(false);
      router.push('/results');
    }
  }, [router, analysisResult]);

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
            <Button variant="outline" onClick={handleReset} disabled={isAnalyzing}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={!canAnalyze || isAnalyzing}
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
              ? 'Job description must be at least 50 characters'
              : null}
        </p>
      )}

      <AnalysisProgress open={isAnalyzing} onComplete={handleAnalysisComplete} />
    </div>
  );
}
