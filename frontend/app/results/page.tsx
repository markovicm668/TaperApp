'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { RecommendedEdits } from '@/components/results/recommended-edits';
import { KeywordGaps } from '@/components/results/keyword-gaps';
import { DiffView } from '@/components/results/diff-view';
import { ATSChecks } from '@/components/results/ats-checks';
import { Button } from '@/components/ui/button';
import { ScoreRing } from '@/components/score-ring';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { exportResumePdf } from '@/lib/api';
import {
  useBulletChanges,
  useCanonicalParsePayload,
  useExportPayload,
  useIsResumeHydrated,
  useLastAnalysisResult,
  useResumeText,
  useSectionViewModel,
} from '@/lib/resume/selectors';
import { useResumeActions } from '@/lib/resume/store';

export default function ResultsPage() {
  const router = useRouter();
  const isHydrated = useIsResumeHydrated();
  const analysisResult = useLastAnalysisResult();
  const canonicalParsePayload = useCanonicalParsePayload();
  const resumeText = useResumeText();
  const bulletChanges = useBulletChanges();
  const sectionRows = useSectionViewModel();
  const { setBulletChanges, resetWorkspace } = useResumeActions();
  const [isExporting, setIsExporting] = useState(false);
  const [isCopyingJson, setIsCopyingJson] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;
    if (!analysisResult) {
      router.push('/');
    }
  }, [analysisResult, isHydrated, router]);

  const exportResumePayload = useExportPayload();

  const handleReset = () => {
    resetWorkspace();
    router.push('/');
  };

  const handleDownloadPdf = async () => {
    if (!analysisResult) return;

    if (!exportResumePayload) {
      toast.error('PDF export unavailable', {
        description: 'No canonical parse payload is available to export.',
      });
      return;
    }

    try {
      setIsExporting(true);
      const blob = await exportResumePdf(exportResumePayload);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'resume.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      toast.error('PDF export failed', { description: message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyJson = async () => {
    if (!analysisResult) return;

    if (!canonicalParsePayload) {
      toast.error('JSON export unavailable', {
        description: 'No canonical parse payload is available to copy.',
      });
      return;
    }

    const payloadText = JSON.stringify(canonicalParsePayload, null, 2);

    try {
      setIsCopyingJson(true);

      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(payloadText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = payloadText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();

        if (!copied) {
          throw new Error('Clipboard copy was blocked by the browser.');
        }
      }

      toast.success('Canonical parse JSON copied');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      toast.error('Copy failed', { description: message });
    } finally {
      setIsCopyingJson(false);
    }
  };

  if (!analysisResult) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (analysisResult.status === 'failed') {
    return (
      <div className="mx-auto flex h-full min-h-[520px] w-full max-w-[720px] flex-col items-center justify-center rounded-2xl border border-border/85 bg-card/90 p-8 text-center shadow-[0_1px_1px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.04)]">
        <h1 className="font-serif text-3xl font-semibold text-destructive">Analysis Failed</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          An error occurred during the analysis process.
        </p>
        <p className="mt-2 text-sm text-destructive/90">
          Error: {analysisResult.riskFlags[0]?.description || 'Unknown error.'}
        </p>
        <Button onClick={handleReset} className="mt-8">
          <RotateCcw className="mr-2 h-4 w-4" />
          Start New Analysis
        </Button>
      </div>
    );
  }

  const {
    matchScore,
    targetRole,
    company,
    overallFit,
    roleSeniority,
    keywordGaps,
    atsChecks,
    recommendedEdits,
  } = analysisResult;

  const originalText = resumeText;
  const hasResumePayload = Boolean(exportResumePayload);

  return (
    <div className="mx-auto w-full max-w-[1340px] space-y-8">
      <div className="rounded-2xl border border-border/85 bg-card/92 p-5 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_10px_30px_rgba(15,23,42,0.035)] sm:p-6">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-primary/75">Analysis Summary</p>
              <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-[2.15rem]">
                {targetRole} <span className="text-muted-foreground">at</span> {company || 'Target Company'}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Overall fit: <span className="font-medium text-foreground">{overallFit}</span>
                {' · '}
                Role seniority: <span className="font-medium text-foreground">{roleSeniority}</span>
              </p>
            </div>
            <div className="w-fit rounded-xl border border-border/80 bg-muted/65 px-4 py-3 text-center md:self-start">
              <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">Match Score</p>
              <ScoreRing score={matchScore} size="sm" className="inline-block align-middle" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 md:justify-end">
            <Button
              variant="default"
              onClick={handleDownloadPdf}
              disabled={isExporting || !hasResumePayload}
            >
              {isExporting ? 'Preparing...' : 'Download PDF'}
            </Button>
            <Button
              variant="quiet"
              onClick={handleCopyJson}
              disabled={isCopyingJson || !canonicalParsePayload}
            >
              {isCopyingJson ? 'Copying...' : 'Copy JSON'}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              New Analysis
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="diff" className="w-full">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="diff" className="min-w-[110px]">Diff View</TabsTrigger>
          <TabsTrigger value="ats" className="min-w-[110px]">ATS Checks</TabsTrigger>
          <TabsTrigger value="keywords" className="min-w-[110px]">Keywords</TabsTrigger>
          <TabsTrigger value="todos" className="min-w-[110px]">Edits</TabsTrigger>
        </TabsList>

        <TabsContent value="diff" className="mt-5">
          <DiffView
            originalText={originalText}
            changes={bulletChanges}
            sections={sectionRows}
            onChangesUpdate={setBulletChanges}
          />
        </TabsContent>

        <TabsContent value="ats" className="mt-5">
          <ATSChecks checks={atsChecks} />
        </TabsContent>

        <TabsContent value="keywords" className="mt-5">
          <KeywordGaps gaps={keywordGaps} />
        </TabsContent>

        <TabsContent value="todos" className="mt-5">
          <RecommendedEdits edits={recommendedEdits} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
