'use client';

import Link from 'next/link';
import {
  ArrowRight,
  FileSearch,
  Target,
  Sparkles,
  ShieldCheck,
  Zap,
  Upload,
  ScanSearch,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/useAuth';
import { InAppBrowserGate } from '@/components/auth/InAppBrowserGate';

export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const ctaHref = user ? '/analyze' : '/login';
  const ctaLabel = user ? 'Go to Analyzer' : 'Get Started';

  return (
    <InAppBrowserGate>
    <div className="bg-[linear-gradient(180deg,var(--secondary)_0%,var(--background)_35%,var(--background)_65%,var(--secondary)_80%)] text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-24 text-center sm:pt-32 sm:pb-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-Powered Resume Optimization
          </div>
          <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Land your dream job with a{' '}
            <span className="text-primary">perfectly tailored</span> resume
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Upload or paste resume and a job description. Our AI analyzes keyword gaps, ATS
            compatibility, and generates tailored rewrite suggestions.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href={ctaHref}>
              <Button size="lg" className="gap-2 px-8 text-base">
                <Zap className="h-4 w-4" />
                {user ? 'Go to Analyzer' : 'Start Analyzing Free'}
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="gap-2 px-8 text-base">
                See How It Works
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/70">
            Free credits on sign-up. No credit card required.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary/75">
              Features
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need to stand out
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              From keyword matching to ATS compliance, we cover every angle so your resume
              gets past the filters and into human hands.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: FileSearch,
                title: 'Smart Parsing',
                desc: 'Upload PDF or paste text. We extract and structure your resume automatically.',
              },
              {
                icon: Target,
                title: 'Keyword Gap Analysis',
                desc: 'See exactly which skills and keywords the job requires that your resume is missing.',
              },
              {
                icon: ShieldCheck,
                title: 'ATS Compatibility',
                desc: 'Get a compliance checklist to ensure your resume passes automated tracking systems.',
              },
              {
                icon: Sparkles,
                title: 'AI Rewrite Suggestions',
                desc: 'Receive tailored bullet-point rewrites that incorporate missing keywords naturally.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/60 bg-card/80 p-6 transition-shadow hover:shadow-[0_4px_24px_rgba(15,23,42,0.06)]"
              >
                <div className="mb-4 inline-flex rounded-xl bg-secondary/80 p-3">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary/75">
              How It Works
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Three steps to a better resume
            </h2>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: '01',
                icon: Upload,
                title: 'Upload Your Resume',
                desc: 'Paste text or upload a PDF. We handle any format.',
              },
              {
                step: '02',
                icon: ScanSearch,
                title: 'Add the Job Description',
                desc: 'Paste the job listing you want to apply for. Our AI cross-references every requirement.',
              },
              {
                step: '03',
                icon: Download,
                title: 'Get Your Tailored Resume',
                desc: 'Review suggestions, accept rewrites, reorder sections, and export a polished PDF.',
              },
            ].map((s) => (
              <div key={s.step} className="relative text-center">
                <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/80">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/60">
                  Step {s.step}
                </p>
                <h3 className="mt-1.5 text-base font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-2">
            {[
              { value: '95%', label: 'ATS Pass Rate' },
              { value: '< 50s', label: 'Analysis Time' },
              // { value: '12+', label: 'Resume Formats' },
              // { value: '5', label: 'Free Credits' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-serif text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div>
          <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
            <h2 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to tailor your resume?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Sign up in seconds, get free credits, and start optimizing your resume
              for your next application.
            </p>
            <div className="mt-8">
              <Link href={ctaHref}>
                <Button size="lg" className="gap-2 px-8 text-base">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
          <span className="font-serif text-sm font-medium text-muted-foreground">
            Tailor
          </span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="text-xs text-muted-foreground/60 hover:text-muted-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-xs text-muted-foreground/60 hover:text-muted-foreground">
              Privacy Policy
            </Link>
            <p className="text-xs text-muted-foreground/60">
              &copy; {new Date().getFullYear()} Tailor. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
    </InAppBrowserGate>
  );
}
