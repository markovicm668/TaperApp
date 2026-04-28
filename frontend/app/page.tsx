'use client';

import { useState, type CSSProperties, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Download,
  FileSearch,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { GateScreen, useInAppBrowser } from '@/components/auth/InAppBrowserGate';
import { track } from '@/lib/analytics';
import { AnalyzeMock, ScoreCallout } from '@/components/landing/product-mocks';

const ACCENT = '#c98a3f';
const FG_2 = 'rgba(14,21,37,0.62)';
const FG_3 = 'rgba(14,21,37,0.38)';
const BORDER = 'rgba(14,21,37,0.10)';
const BORDER_SOFT = 'rgba(14,21,37,0.06)';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const detection = useInAppBrowser();
  const [gateOpen, setGateOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (gateOpen && detection?.isInAppBrowser) {
    return <GateScreen detection={detection} />;
  }

  const ctaHref = user ? '/analyze' : '/login';

  const handleCtaClick = (event: MouseEvent<HTMLAnchorElement>) => {
    track('landing_cta_clicked', { authed: Boolean(user), destination: ctaHref });
    if (detection?.isInAppBrowser) {
      event.preventDefault();
      setGateOpen(true);
    }
  };

  return (
    <div>
      <HeroA ctaHref={ctaHref} onCtaClick={handleCtaClick} authed={Boolean(user)} />
      <PainSection />

      <FeaturesSection />
      <HowItWorksSection />

      {/* CTA */}
      <section>
        <div>
          <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
            <h2 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to tailor your resume?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Sign up in seconds, get free credits, and start optimizing your resume for your next
              application.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href={ctaHref}
                onClick={handleCtaClick}
                style={{
                  height: 48,
                  padding: '0 22px',
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'var(--primary)',
                  borderRadius: 10,
                  boxShadow:
                    '0 1px 1px rgba(15,21,37,0.12), 0 8px 20px rgba(73,86,126,0.22)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Zap size={15} /> {user ? 'Go to Analyzer' : 'Tailor my resume for free'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

interface CtaProps {
  ctaHref: string;
  onCtaClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

function HeroA({
  ctaHref,
  onCtaClick,
  authed,
}: CtaProps & { authed: boolean }) {
  return (
    <section style={{ padding: '72px 32px 96px', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          maxWidth: 880,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <h1
          className="font-serif"
          style={{
            fontSize: 'clamp(44px, 6.4vw, 64px)',
            fontWeight: 400,
            lineHeight: 0.96,
            letterSpacing: '-0.045em',
            marginBottom: 24,
            textWrap: 'balance',
          }}
        >
          Stop sending the{' '}
          <em style={{ fontStyle: 'italic', fontWeight: 500 }}>same resume</em> to{' '}
          <span style={{ position: 'relative', display: 'inline-block' }}>
            wildly different
            <svg
              width="100%"
              height="14"
              viewBox="0 0 400 14"
              preserveAspectRatio="none"
              aria-hidden
              style={{ position: 'absolute', left: 0, bottom: '-6px', color: ACCENT }}
            >
              <path
                d="M2 8 Q 100 2, 200 7 T 398 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </span>{' '}
          jobs.
        </h1>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.65,
            color: FG_2,
            marginBottom: 56,
            maxWidth: 560,
          }}
        >
          Tailor reads your resume the way recruting software does, finds the keywords you&apos;re
          missing, and rewrites it in your voice, helping you pass every ATS scan.
        </p>

        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 720,
            marginBottom: 64,
          }}
        >
          <div style={{ transform: 'rotate(-1deg)' }}>
            <AnalyzeMock height={380} />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: -26,
              left: -22,
              zIndex: 2,
              transform: 'rotate(-3deg)',
            }}
          >
            <ScoreCallout />
          </div>
          <div
            style={{
              position: 'absolute',
              top: -22,
              right: -10,
              zIndex: 2,
              padding: '8px 12px',
              background: 'var(--card)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              fontSize: 11.5,
              fontWeight: 500,
              color: FG_2,
              transform: 'rotate(3deg)',
              boxShadow: '0 1px 1px rgba(15,21,37,0.05), 0 12px 28px rgba(15,23,42,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sparkles size={12} style={{ color: ACCENT }} /> 12 rewrite suggestions
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Link
            href={ctaHref}
            onClick={onCtaClick}
            style={{
              height: 48,
              padding: '0 22px',
              fontSize: 14.5,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--primary)',
              borderRadius: 10,
              boxShadow: '0 1px 1px rgba(15,21,37,0.12), 0 8px 20px rgba(73,86,126,0.22)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Zap size={15} /> {authed ? 'Go to Analyzer' : 'Tailor my resume for free'}
          </Link>
          <a
            href="#how-it-works"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById('how-it-works')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            style={{
              height: 48,
              padding: '0 18px',
              fontSize: 14.5,
              fontWeight: 500,
              color: 'var(--foreground)',
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            See how it works <ArrowRight size={14} />
          </a>
        </div>
        <div
          style={{
            marginTop: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            fontSize: 12.5,
            color: FG_3,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Check size={12} style={{ color: 'var(--success)' }} /> No credit card required
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Check size={12} style={{ color: 'var(--success)' }} /> Free credits on sign up
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Check size={12} style={{ color: 'var(--success)' }} /> 0 data collected
          </span>
        </div>
      </div>
    </section>
  );
}

function PainSection() {
  const beats = [
    { stat: '250+', label: 'avg. applicants per posting' },
    { stat: '>50%', label: 'of resumes filtered out by ATS before a human reads them' },
    { stat: '7s', label: 'average time a recruiter spends on each resume' },
  ];
  return (
    <section style={{ padding: '72px 32px', borderTop: `0px solid ${BORDER_SOFT}` }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div
          className="pain-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.1fr',
            gap: 80,
            alignItems: 'end',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--primary)',
                opacity: 0.85,
                marginBottom: 16,
              }}
            >
              You are not the problem
            </div>
            <h2
              className="font-serif"
              style={{
                fontSize: 'clamp(28px, 3.4vw, 42px)',
                fontWeight: 500,
                lineHeight: 1.12,
                letterSpacing: '-0.025em',
              }}
            >
              Job hunting is a{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 500, color: 'var(--primary)' }}>
                numbers game
              </em>{', '}
              rigged before a human ever sees your resume.
            </h2>
          </div>
          {/* <div> */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 1,
                background: BORDER_SOFT,
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {beats.map((b) => (
                <div key={b.stat} style={{ padding: '20px 16px', background: 'var(--card)' }}>
                  <div
                    className="font-serif"
                    style={{
                      fontSize: 32,
                      fontWeight: 600,
                      letterSpacing: '-0.03em',
                      color: 'var(--primary)',
                    }}
                  >
                    {b.stat}
                  </div>
                  <div style={{ fontSize: 12, color: FG_2, marginTop: 4, lineHeight: 1.45 }}>
                    {b.label}
                  </div>
                </div>
              ))}
            </div>
          {/* </div> */}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          .pain-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </section>
  );
}

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--primary)',
  opacity: 0.85,
};

function FeaturesSection() {
  const features = [
    {
      icon: FileSearch,
      title: 'It reads your resume the way ATS does',
      desc: 'We parse your PDF or pasted text the same way recruiter software does — surfacing what the bots actually see, not what you think they see.',
    },
    {
      icon: Target,
      title: 'It finds the gaps, not just the misses',
      desc: 'Keyword analysis grouped by priority: hard requirements, nice-to-haves, soft skills. You see what would actually move the needle.',
    },
    {
      icon: ShieldCheck,
      title: 'It catches the small stuff that gets you screened out',
      desc: 'Inconsistent dates, unparseable tables, missing contact info, stuffing detection — the boring checklist that quietly kills applications.',
    },
    {
      icon: Sparkles,
      title: 'It rewrites bullets in your voice',
      desc: 'Drop-in suggestions that incorporate the missing keywords without sounding like a robot. Accept, edit, or skip — you stay in charge.',
    },
  ];
  return (
    <section style={{ padding: '80px 32px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 40,
            marginBottom: 40,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <div style={{ ...eyebrowStyle, marginBottom: 14 }}>How Tailor helps</div>
            <h2
              className="font-serif"
              style={{
                fontSize: 'clamp(28px, 3.6vw, 42px)',
                fontWeight: 500,
                lineHeight: 1.12,
                letterSpacing: '-0.025em',
              }}
            >
              Four small things that change everything.
            </h2>
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: FG_2, maxWidth: 380 }}>
            No &quot;AI magic&quot; — just the unglamorous, specific work of matching your story to
            what each posting actually asks for.
          </p>
        </div>
        <div
          className="features-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: 'var(--card)',
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                padding: '24px 24px 22px',
                display: 'flex',
                gap: 16,
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: 'var(--secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                }}
              >
                <f.icon size={18} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 15.5,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    marginBottom: 6,
                    lineHeight: 1.3,
                  }}
                >
                  {f.title}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: FG_2 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 720px) {
          .features-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      n: '01',
      title: 'Paste your resume',
      desc: 'Or drop a PDF. We extract sections, dates, and bullets automatically — even when formatting is weird.',
      icon: Upload,
    },
    {
      n: '02',
      title: 'Add the job you want',
      desc: 'Paste the job posting. The AI cross-references every requirement, not just the headline keywords.',
      icon: ScanSearch,
    },
    {
      n: '03',
      title: 'Get a tailored draft',
      desc: 'Review suggestions, accept or edit each one, then export a clean PDF ready to send.',
      icon: Download,
    },
  ];
  return (
    <section
      id="how-it-works"
      style={{
        padding: '72px 32px',
        background: 'var(--card)',
        borderTop: `1px solid ${BORDER_SOFT}`,
        borderBottom: `1px solid ${BORDER_SOFT}`,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ ...eyebrowStyle, marginBottom: 14 }}>Three steps</div>
          <h2
            className="font-serif"
            style={{
              fontSize: 'clamp(28px, 3.4vw, 40px)',
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: '-0.025em',
            }}
          >
            From rough resume to ready-to-send in under a minute.
          </h2>
        </div>
        <div
          className="steps-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 0,
            position: 'relative',
            borderTop: `1px solid ${BORDER_SOFT}`,
            borderBottom: `1px solid ${BORDER_SOFT}`,
          }}
        >
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="step-cell"
              style={{
                padding: '32px 28px',
                borderRight: i < steps.length - 1 ? `1px solid ${BORDER_SOFT}` : 'none',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 18,
                }}
              >
                <span
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: ACCENT,
                    letterSpacing: '0.08em',
                  }}
                >
                  {s.n}
                </span>
                <span style={{ color: FG_3, display: 'inline-flex' }}>
                  <s.icon size={18} />
                </span>
              </div>
              <div
                className="font-serif"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  marginBottom: 8,
                  lineHeight: 1.2,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: FG_2 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 720px) {
          .steps-grid {
            grid-template-columns: 1fr !important;
          }
          .steps-grid :global(.step-cell) {
            border-right: none !important;
            border-bottom: 1px solid ${BORDER_SOFT};
          }
          .steps-grid :global(.step-cell:last-child) {
            border-bottom: none;
          }
        }
      `}</style>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
        <span className="font-serif text-sm font-medium text-muted-foreground">Tailor</span>
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
  );
}
