'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DiffView } from '@/components/results/diff-view';
import { ResumePreview } from '@/components/results/resume-preview';
import { SectionOrderDialog } from '@/components/results/section-order-dialog';
import { Button } from '@/components/ui/button';
import { exportResumePdf } from '@/lib/api';
import { useResumePreview } from '@/lib/resume/use-resume-preview';
import type { ResumePdfPayload } from '@/lib/types';
import {
  useBulletChanges,
  useCanonicalParsePayload,
  useExportPayload,
  useIsResumeHydrated,
  useLastAnalysisResult,
  useEffectiveSectionViewModel,
} from '@/lib/resume/selectors';
import { useResumeActions } from '@/lib/resume/store';
import { useAuth } from '@/lib/auth/useAuth';
import { track } from '@/lib/analytics';
import {
  buildPdfSelectionModel,
  filterResumePdfPayloadForSelection,
  normalizePdfSelectionOverrides,
  togglePdfSelectionItem,
  type PdfSelectionOverrides,
} from '@/lib/resume/pdf-selection';
import { AdminOnly } from '@/components/admin-only';

const PDF_SELECTION_STORAGE_KEY = 'resumePdfSelection.v1';

export default function ResultsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isHydrated = useIsResumeHydrated();
  const analysisResult = useLastAnalysisResult();
  const canonicalParsePayload = useCanonicalParsePayload();
  const bulletChanges = useBulletChanges();
  const sectionRows = useEffectiveSectionViewModel();
  const { setBulletChanges, setSectionOrder, applyInlineEdit, resetWorkspace } = useResumeActions();
  const [isExporting, setIsExporting] = useState(false);
  const [isCopyingJson, setIsCopyingJson] = useState(false);
  const [pdfSelectionOverrides, setPdfSelectionOverrides] = useState<PdfSelectionOverrides>({});
  const [mobileTab, setMobileTab] = useState<'diff' | 'preview'>('diff');

  useEffect(() => {
    if (!isHydrated) return;
    if (!analysisResult) {
      // Guests don't have access to /analyze — send them back to the landing
      // page where the inline "Try it free" section lives.
      router.push(user ? '/analyze' : '/');
    }
  }, [analysisResult, isHydrated, router, user]);

  const resultsViewedRef = useRef(false);
  useEffect(() => {
    if (!analysisResult || resultsViewedRef.current) return;
    if (analysisResult.status === 'failed') return;
    resultsViewedRef.current = true;
    track('results_viewed', {
      match_score: analysisResult.matchScore,
      target_role: analysisResult.targetRole || null,
    });
  }, [analysisResult]);

  const exportResumePayload = useExportPayload();
  const pdfSelectionModel = useMemo(
    () => (exportResumePayload ? buildPdfSelectionModel(exportResumePayload) : null),
    [exportResumePayload]
  );
  const pdfSelectionFingerprint = useMemo(() => {
    if (analysisResult?.id) return `result:${analysisResult.id}`;
    if (!exportResumePayload) return null;
    const fallbackId = exportResumePayload.id || 'resume';
    const modified = exportResumePayload.metadata?.lastModified || exportResumePayload.metadata?.importedAt || '';
    return `payload:${fallbackId}:${modified}`;
  }, [analysisResult?.id, exportResumePayload]);

  useEffect(() => {
    if (!pdfSelectionFingerprint || !pdfSelectionModel) {
      setPdfSelectionOverrides({});
      return;
    }
    if (typeof window === 'undefined') return;

    let nextOverrides: PdfSelectionOverrides = {};
    try {
      const raw = window.sessionStorage.getItem(PDF_SELECTION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          fingerprint?: string;
          overrides?: PdfSelectionOverrides;
        };
        if (parsed?.fingerprint === pdfSelectionFingerprint) {
          nextOverrides = normalizePdfSelectionOverrides(pdfSelectionModel, parsed.overrides || {});
        }
      }
    } catch {
      nextOverrides = {};
    }

    setPdfSelectionOverrides(prev => {
      const prevNormalized = normalizePdfSelectionOverrides(pdfSelectionModel, prev);
      const prevSerialized = JSON.stringify(prevNormalized);
      const nextSerialized = JSON.stringify(nextOverrides);
      return prevSerialized === nextSerialized ? prev : nextOverrides;
    });
  }, [pdfSelectionFingerprint]);

  useEffect(() => {
    if (!pdfSelectionFingerprint || !pdfSelectionModel) return;
    if (typeof window === 'undefined') return;

    const normalized = normalizePdfSelectionOverrides(pdfSelectionModel, pdfSelectionOverrides);
    try {
      window.sessionStorage.setItem(
        PDF_SELECTION_STORAGE_KEY,
        JSON.stringify({
          fingerprint: pdfSelectionFingerprint,
          overrides: normalized,
        })
      );
    } catch {
      // Ignore session storage write failures and keep in-memory selection state.
    }
  }, [pdfSelectionFingerprint, pdfSelectionModel, pdfSelectionOverrides]);

  const handleTogglePdfItem = (itemKey: string, checked: boolean) => {
    if (!pdfSelectionModel) return;
    setPdfSelectionOverrides(prev =>
      togglePdfSelectionItem(pdfSelectionModel, prev, itemKey, checked)
    );
  };

  const handleReset = () => {
    resetWorkspace();
    router.push('/analyze');
  };

  const handleDownloadPdf = async () => {
    if (!analysisResult) return;

    if (!exportResumePayload) {
      toast.error('PDF export unavailable', {
        description: 'No canonical parse payload is available to export.',
      });
      return;
    }

    if (!user) {
      track('guest_download_blocked');
      toast.info('Sign up to download your PDF', {
        description: 'Free — takes 10 seconds with Google.',
        action: { label: 'Sign up', onClick: () => router.push('/login') },
      });
      return;
    }

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    // Must open the window synchronously (before any await) so Safari doesn't block it as a popup
    const iosWindowRef = isIOS ? window.open('', '_blank') : null;

    try {
      setIsExporting(true);
      const payloadForExport: ResumePdfPayload =
        pdfSelectionModel
          ? filterResumePdfPayloadForSelection(exportResumePayload, pdfSelectionModel, pdfSelectionOverrides)
          : exportResumePayload;
      const blob = await exportResumePdf(payloadForExport);
      const nameSlug = (payloadForExport.basics?.name || 'resume').replace(/\s+/g, '_');
      const titleSlug = (targetRole || '').replace(/\s+/g, '_');
      const fileName = (titleSlug ? `${nameSlug}-${titleSlug}.pdf` : `${nameSlug}.pdf`)
        .replace(/[\/\\:*?"<>|]/g, '_');

      if (isIOS) {
        // iOS Safari ignores the <a download> attribute on blob URLs, so we navigate
        // the pre-opened tab to the blob URL and let Safari's PDF viewer handle saving.
        const url = URL.createObjectURL(blob);
        if (iosWindowRef) {
          iosWindowRef.location.href = url;
        } else {
          window.location.href = url;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
      track('resume_exported', {
        match_score: analysisResult.matchScore,
        target_role: targetRole || null,
      });
      toast.success('PDF downloaded');
    } catch (error) {
      iosWindowRef?.close();
      const message = error instanceof Error ? error.message : 'Unknown error.';
      track('resume_export_failed', { error: message });
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
  } = analysisResult;

  const hasOriginal = sectionRows.some(row => row.hasContent);
  const hasResumePayload = Boolean(exportResumePayload);

  const previewPayload = useMemo<ResumePdfPayload | null>(() => {
    if (!exportResumePayload) return null;
    return pdfSelectionModel
      ? filterResumePdfPayloadForSelection(exportResumePayload, pdfSelectionModel, pdfSelectionOverrides)
      : exportResumePayload;
  }, [exportResumePayload, pdfSelectionModel, pdfSelectionOverrides]);

  const preview = useResumePreview(previewPayload);

  return (
    <div className="mx-auto w-full max-w-[1340px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push('/analyze')}
            aria-label="Back to analyze"
            className="inline-flex size-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-secondary/70"
          >
            <ArrowLeft className="size-[15px]" />
          </button>
          <h1 className="truncate font-serif text-xl font-semibold tracking-tight">
            {targetRole} <span className="font-normal text-muted-foreground/60">at</span> {company || 'Target Company'}
          </h1>
          <span className="inline-flex flex-shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            Match Score&nbsp;&nbsp;{matchScore}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SectionOrderDialog
            sections={sectionRows}
            onOrderChange={setSectionOrder}
            onResetOrder={() => setSectionOrder([])}
          />
          <AdminOnly>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyJson}
              disabled={isCopyingJson || !canonicalParsePayload}
            >
              {isCopyingJson ? 'Copying...' : 'Copy JSON'}
            </Button>
          </AdminOnly>
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isExporting || !hasResumePayload}
          >
            {isExporting ? 'Preparing...' : 'Download PDF'}
          </Button>
        </div>
      </div>

      <section className="w-full" aria-label="Diff View">
        <div className="relative grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
          <div
            className={cn(
              'w-full lg:static lg:z-auto lg:opacity-100 lg:pointer-events-auto',
              mobileTab === 'preview' &&
              'absolute inset-x-0 top-0 -z-10 opacity-0 pointer-events-none'
            )}
            aria-hidden={mobileTab === 'preview' ? true : undefined}
          >
            <DiffView
              hasOriginal={hasOriginal}
              changes={bulletChanges}
              onChangesUpdate={setBulletChanges}
              onInlineEdit={applyInlineEdit}
              pdfSelectionModel={pdfSelectionModel}
              pdfSelectionOverrides={pdfSelectionOverrides}
              onPdfToggleItem={handleTogglePdfItem}
            />
          </div>
          <div
            className={cn(
              'w-full lg:static lg:z-auto lg:opacity-100 lg:pointer-events-auto',
              mobileTab === 'diff' &&
              'absolute inset-x-0 top-0 -z-10 opacity-0 pointer-events-none'
            )}
            aria-hidden={mobileTab === 'diff' ? true : undefined}
          >
            <div className="sticky top-4">
              <ResumePreview
                html={preview.html}
                isLoading={preview.isLoading}
                error={preview.error}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 lg:hidden">
        <div className="flex gap-1 rounded-full border border-border/80 bg-card p-1 shadow-lg">
          <button
            onClick={() => setMobileTab('diff')}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              mobileTab === 'diff'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Edditor
          </button>
          <button
            onClick={() => setMobileTab('preview')}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              mobileTab === 'preview'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}
