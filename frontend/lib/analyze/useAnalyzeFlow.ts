'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { analyzeResume, parseResume, parseResumePdf } from '@/lib/api';
import { savePendingApplication } from '@/lib/analyze/pendingApplication';
import { markFreeAnalysisUsed } from '@/lib/freeAnalysis';
import { analysisResultToSnapshot } from '@/lib/resume/mappers';
import { useResumeActions } from '@/lib/resume/store';
import { useTokens } from '@/lib/tokens/TokenContext';
import { useAuth } from '@/lib/auth/useAuth';
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
  showOutOfCredits: boolean;
  setShowOutOfCredits: (show: boolean) => void;
  showSignupPrompt: boolean;
  setShowSignupPrompt: (show: boolean) => void;
}

export function useAnalyzeFlow(options: UseAnalyzeFlowOptions = {}): AnalyzeFlow {
  const router = useRouter();
  const { setSourceInput, setAnalysisSnapshot, setParsedPayload, setApplicationId } = useResumeActions();
  const { tokensRemaining, tokensLoading, setTokensRemaining } = useTokens();
  const { user, ensureAnonymousUser } = useAuth();
  const source: AnalyzeSource = options.source ?? 'analyze_page';

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parseDone, setParseDone] = useState(false);
  const [showOutOfCredits, setShowOutOfCredits] = useState(false);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);

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

      // Safety net for any caller that doesn't pre-check balance itself (the
      // primary guard lives in the click handler, e.g. app/analyze/page.tsx).
      // Gated on tokensLoading so we never false-positive during the brief
      // window before the balance has loaded for a freshly-funded user.
      if (user && !tokensLoading && tokensRemaining <= 0) {
        track('analysis_blocked_out_of_credits', { source });
        setShowOutOfCredits(true);
        return;
      }

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
        // Ensure a Firebase session exists (anonymous for account-less guests)
        // so the request carries a token — the server now rejects token-less
        // requests. No-op for signed-in users.
        await ensureAnonymousUser();

        // Step 1: Parse resume separately so the progress dialog
        // reflects real parse time (free; only the analysis step is billed).
        const parseResult = resumeData.file
          ? await parseResumePdf(resumeData.file)
          : await parseResume({
              resumeText: resumeData.content,
              inputType: resumeData.type,
              fileName: resumeData.fileName,
            });
        setParsedPayload(parseResult);
        setParseDone(true);

        // Step 2: Run full analysis (costs 1 token for authed users).
        // Pass the already-parsed resumeData so the backend skips re-parsing.
        const { tokensRemaining: _parseTokens, ...parsedPayloadForSave } = parseResult;
        const { result, analysis, parsed, applicationId, tokensRemaining } = await analyzeResume(
          {
            type: resumeData.type,
            content: resumeData.file ? '' : resumeData.content,
            fileName: resumeData.fileName,
          },
          { text: jobDescription },
          parseResult.resumeData,
          parsedPayloadForSave
        );

        if (tokensRemaining !== undefined) {
          setTokensRemaining(tokensRemaining);
        }

        if (parsed && parsed.source) {
          setParsedPayload(parsed);
        }

        // Remember which tracked application this workspace belongs to so
        // later edits can be auto-saved onto it (null for guests).
        setApplicationId(applicationId ?? null);

        // Anonymous analyses aren't saved server-side (no applicationId). Stash
        // the result so it can be persisted to history once the user signs in
        // (e.g. via the download gate). See results/page.tsx flush effect.
        if (!applicationId && parsed) {
          savePendingApplication({
            company: result.company ?? '',
            targetRole: result.targetRole ?? '',
            jobDescription,
            matchScore: result.matchScore ?? 0,
            scores: result.scores ?? null,
            analysis,
            parsed,
          });
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
        const errorCode =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code: string }).code
            : undefined;

        if (errorCode === 'FREE_TRIAL_USED') {
          // Anonymous visitor has spent their one free analysis. Prompt signup.
          track('analysis_failed', { source, reason: 'free_trial_used' });
          markFreeAnalysisUsed();
          setParseDone(true);
          setIsAnalyzing(false);
          setShowSignupPrompt(true);
          return;
        }

        if (errorCode === 'INSUFFICIENT_TOKENS') {
          track('analysis_failed', { source, reason: 'insufficient_tokens' });
          const tokensErr = err as { tokensRemaining?: number };
          if (typeof tokensErr.tokensRemaining === 'number') {
            setTokensRemaining(tokensErr.tokensRemaining);
          }
          setParseDone(true);
          setIsAnalyzing(false);
          setShowOutOfCredits(true);
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
    [
      setAnalysisSnapshot,
      setApplicationId,
      setParsedPayload,
      setSourceInput,
      setTokensRemaining,
      source,
      tryNavigateToResults,
      user,
      tokensLoading,
      tokensRemaining,
      ensureAnonymousUser,
    ]
  );

  const handleAnalysisComplete = useCallback(() => {
    progressDoneRef.current = true;
    tryNavigateToResults();
  }, [tryNavigateToResults]);

  return {
    isAnalyzing,
    parseDone,
    handleAnalyze,
    handleAnalysisComplete,
    showOutOfCredits,
    setShowOutOfCredits,
    showSignupPrompt,
    setShowSignupPrompt,
  };
}
