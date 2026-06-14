'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Wand2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResumeInputCard } from '@/components/resume-input-card';
import { JobDescriptionCard } from '@/components/job-description-card';
import { AnalysisProgress } from '@/components/analysis-progress';
import { useAuth } from '@/lib/auth/useAuth';
import { useAnalyzeFlow } from '@/lib/analyze/useAnalyzeFlow';
import { hasUsedFreeAnalysis, markFreeAnalysisUsed } from '@/lib/freeAnalysis';
import { track } from '@/lib/analytics';
import type { ResumeInput } from '@/lib/types';

export function TryItFreeSection() {
  const { user, loading } = useAuth();
  const [resumeData, setResumeData] = useState<ResumeInput | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [usedFree, setUsedFree] = useState(false);

  // Read the localStorage flag on mount (and when auth state flips, in case
  // a user signed in/out in another tab).
  useEffect(() => {
    setUsedFree(hasUsedFreeAnalysis());
  }, [user]);

  // Mirror the signed-in /analyze tracking here so guests (who run the flow on
  // the landing page) also emit resume_uploaded / job_description_added.
  const trackedResumeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resumeData) {
      trackedResumeIdRef.current = null;
      return;
    }
    const id = `${resumeData.type}:${resumeData.fileName || ''}:${resumeData.content.length}`;
    if (trackedResumeIdRef.current === id) return;
    trackedResumeIdRef.current = id;
    track('resume_uploaded', {
      input_type: resumeData.type,
      has_file: Boolean(resumeData.file),
      file_name: resumeData.fileName || null,
      char_count: resumeData.content.length,
    });
  }, [resumeData]);

  const jdTrackedRef = useRef(false);
  useEffect(() => {
    const len = jobDescription.trim().length;
    if (len > 50 && !jdTrackedRef.current) {
      jdTrackedRef.current = true;
      track('job_description_added', { char_count: len });
    } else if (len === 0 && jdTrackedRef.current) {
      jdTrackedRef.current = false;
    }
  }, [jobDescription]);

  const { isAnalyzing, parseDone, handleAnalyze, handleAnalysisComplete } = useAnalyzeFlow({
    source: 'landing',
    onAnalyzed: () => {
      if (!user) markFreeAnalysisUsed();
    },
  });

  const canAnalyze = Boolean(resumeData) && jobDescription.trim().length > 50;
  const isGuest = !loading && !user;
  const blockedAsGuest = isGuest && usedFree;

  const onAnalyzeClick = () => {
    if (!resumeData || !jobDescription) return;
    track('landing_try_analyze_clicked', {
      authed: Boolean(user),
      jd_char_count: jobDescription.trim().length,
    });
    void handleAnalyze(resumeData, jobDescription);
  };

  return (
    <section
      id="try-it-free"
      style={{
        padding: '24px 32px 72px',
        scrollMarginTop: 24,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
              opacity: 0.85,
              marginBottom: 14,
            }}
          >
            Try it free
          </div>
          {/* <h2
            className="font-serif"
            style={{
              fontSize: 'clamp(28px, 3.4vw, 40px)',
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: '-0.025em',
            }}
          >
            Run one analysis on us — <em style={{ fontStyle: 'italic', color: 'var(--primary)' }}>no signup needed</em>.
          </h2>
          <p
            style={{
              marginTop: 14,
              fontSize: 14.5,
              lineHeight: 1.65,
              color: 'rgba(14,21,37,0.62)',
              maxWidth: 540,
              margin: '14px auto 0',
            }}
          >
            Paste your resume and a job description. We&apos;ll show you exactly what&apos;s missing,
            with rewrites you can use.
          </p> */}
        </div>

        {user ? (
          <SignedInPanel />
        ) : blockedAsGuest ? (
          <UsedPanel />
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-2">
              <ResumeInputCard onResumeChange={setResumeData} hideSampleButton />
              <JobDescriptionCard onJobDescriptionChange={setJobDescription} hideSampleButton />
            </div>

            <div className="mt-5 rounded-2xl border border-border/85 bg-card p-5 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.04)] sm:px-6 sm:py-[18px]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    {canAnalyze ? 'Ready to analyze' : 'Add inputs to continue'}
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Free analysis — no signup needed.
                  </p>
                </div>
                <Button
                  size="lg"
                  onClick={onAnalyzeClick}
                  disabled={!canAnalyze || isAnalyzing}
                  className="gap-2"
                >
                  <Wand2 className="h-4 w-4" />
                  Analyze resume
                </Button>
              </div>
            </div>

            <AnalysisProgress
              open={isAnalyzing}
              parseDone={parseDone}
              onComplete={handleAnalysisComplete}
            />
          </>
        )}
      </div>
    </section>
  );
}

function SignedInPanel() {
  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: 540,
        textAlign: 'center',
        padding: '28px 24px',
        background: 'var(--card)',
        border: '1px solid rgba(14,21,37,0.10)',
        borderRadius: 14,
      }}
    >
      <Sparkles size={20} style={{ color: 'var(--primary)', margin: '0 auto 8px' }} />
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        You&apos;re signed in.
      </p>
      <p style={{ fontSize: 13.5, color: 'rgba(14,21,37,0.62)', marginBottom: 16 }}>
        Head to your workspace to run an analysis with your credits.
      </p>
      <Link
        href="/analyze"
        onClick={() => track('landing_signed_in_workspace_clicked')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 42,
          padding: '0 18px',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: 'var(--primary)',
          borderRadius: 10,
        }}
      >
        <Zap size={14} /> Go to workspace
      </Link>
    </div>
  );
}

function UsedPanel() {
  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: 540,
        textAlign: 'center',
        padding: '28px 24px',
        background: 'var(--card)',
        border: '1px solid rgba(14,21,37,0.10)',
        borderRadius: 14,
      }}
    >
      <Sparkles size={20} style={{ color: 'var(--primary)', margin: '0 auto 8px' }} />
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        You&apos;ve used your free analysis.
      </p>
      <p style={{ fontSize: 13.5, color: 'rgba(14,21,37,0.62)', marginBottom: 16 }}>
        Sign up in seconds to keep tailoring — and download your polished PDF.
      </p>
      <Link
        href="/login"
        onClick={() => track('landing_signup_after_used_clicked')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 42,
          padding: '0 18px',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: 'var(--primary)',
          borderRadius: 10,
        }}
      >
        <Zap size={14} /> Sign up — it&apos;s free
      </Link>
    </div>
  );
}
