'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { analyzeResume, parseResume, parseResumePdf } from '@/lib/api';
import { analysisResultToSnapshot } from '@/lib/resume/mappers';
import { useResumeActions } from '@/lib/resume/store';
import { useTokens } from '@/lib/tokens/TokenContext';
import { incrementPeopleProperty, track } from '@/lib/analytics';
import type { AnalysisResult, ResumeInput } from '@/lib/types';

type AnalyzeSource = 'landing' | 'analyze_page';

interface UseAnalyzeFlowOptions {
  onAnalyzed?: () => void;
  source?: AnalyzeSource;
}

export interface AnalyzeFlow {
  isAnalyzing: boolean;
  parseDone: boolean;
  handleAnalyze: (resumeData: ResumeInput, jobDescription: string) => Promise<void>;
  handleAnalysisComplete: () => void;
}

export function useAnalyzeFlow(options: UseAnalyzeFlowOptions = {}): AnalyzeFlow {
  const router = useRouter();
  const { setSourceInput, setAnalysisSnapshot, setParsedPayload } = useResumeActions();
  const { setTokensRemaining } = useTokens();
  const source: AnalyzeSource = options.source ?? 'analyze_page';

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parseDone, setParseDone] = useState(false);

  // Both flags must be true before we navigate to results.
  // Using refs so the check always reads latest values without stale closures.
  const apiDoneRef = useRef(false);
  const progressDoneRef = useRef(false);
  const apiErrorRef = useRef(false);

  const onAnalyzedRef = useRef(options.onAnalyzed);
  onAnalyzedRef.current = options.onAnalyzed;

  const tryNavigateToResults = useCallback(() => {
    if (apiDoneRef.current && progressDoneRef.current) {
      setIsAnalyzing(false);
      if (!apiErrorRef.current) {
        router.push('/results');
      }
    }
  }, [router]);

  const handleAnalyze = useCallback(
    async (resumeData: ResumeInput, jobDescription: string) => {
      if (!resumeData || !jobDescription) return;

      setParseDone(false);
      apiDoneRef.current = false;
      progressDoneRef.current = false;
      apiErrorRef.current = false;
      setIsAnalyzing(true);
      const analysisStartedAt = Date.now();
      track('analysis_started', {
        source,
        input_type: resumeData.type,
        has_file: Boolean(resumeData.file),
        jd_char_count: jobDescription.trim().length,
      });

      setSourceInput({
        inputType: resumeData.type,
        rawText: resumeData.file ? '' : resumeData.content,
        fileName: resumeData.fileName,
        clearAnalysis: true,
      });

      try {
        // Step 1: Parse resume separately so the progress dialog
        // reflects real parse time (costs 1 token for authed users).
        const parseResult = resumeData.file
          ? await parseResumePdf(resumeData.file)
          : await parseResume({
              resumeText: resumeData.content,
              inputType: resumeData.type,
              fileName: resumeData.fileName,
            });
        setParsedPayload(parseResult);
        setParseDone(true);

        // Step 2: Run full analysis (costs 3 tokens for authed users).
        // Pass the already-parsed resumeData so the backend skips re-parsing.
        const { result, parsed, tokensRemaining } = await analyzeResume(
          {
            type: resumeData.type,
            content: resumeData.file ? '' : resumeData.content,
            fileName: resumeData.fileName,
          },
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
        track('analysis_completed', {
          source,
          match_score: result.matchScore,
          duration_ms: Date.now() - analysisStartedAt,
          target_role: result.targetRole || null,
          suggestions_count: result.rewriteSuggestions?.length ?? 0,
        });
        incrementPeopleProperty('analyses_completed');
        onAnalyzedRef.current?.();
        apiDoneRef.current = true;
        tryNavigateToResults();
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'INSUFFICIENT_TOKENS'
        ) {
          track('analysis_failed', { source, reason: 'insufficient_tokens' });
          toast.error('Insufficient tokens', {
            description: (err as unknown as Error).message,
          });
          setParseDone(true);
          setIsAnalyzing(false);
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Unknown API error occurred.';
        track('analysis_failed', { source, reason: 'api_error', error: errorMessage });
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
          riskFlags: [
            { id: 'err', title: 'API Failure', description: errorMessage, severity: 'high' },
          ],
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
    },
    [setAnalysisSnapshot, setParsedPayload, setSourceInput, setTokensRemaining, source, tryNavigateToResults]
  );

  const handleAnalysisComplete = useCallback(() => {
    progressDoneRef.current = true;
    tryNavigateToResults();
  }, [tryNavigateToResults]);

  return { isAnalyzing, parseDone, handleAnalyze, handleAnalysisComplete };
}
