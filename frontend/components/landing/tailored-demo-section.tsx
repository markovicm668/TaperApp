'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const FG_2 = 'rgba(14,21,37,0.62)';
const FG_3 = 'rgba(14,21,37,0.38)';
const BORDER = 'rgba(14,21,37,0.10)';
const BORDER_SOFT = 'rgba(14,21,37,0.06)';
const MONO = 'var(--font-mono)';

// "Tailored" reads as a match (green); the "before" state reads as a low score (clay).
const MATCH = 'var(--success)';
const MATCH_BG = 'rgba(31,122,74,0.12)';
const MATCH_LINE = 'rgba(31,122,74,0.40)';
const CLAY = '#b0694f';

const KEYWORDS = ['React', 'Cross-functional', 'Design system', 'Performance'];

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--primary)',
  opacity: 0.85,
};

const bulletStyle: CSSProperties = {
  fontSize: 16.5,
  lineHeight: 1.62,
  color: 'var(--foreground)',
  margin: 0,
};

export function TailoredDemoSection() {
  // Default to "Your version" — it flips to "Tailored" on scroll (below) or on click.
  const [tailored, setTailored] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Respect reduced motion: if it flips to "Tailored", skip the stagger/animation.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReducedMotion(true);
    }
  }, []);

  // Drive the toggle from scroll position, reversibly: "Tailored" while the demo sits in
  // the upper part of the viewport, back to "Your version" when scrolled down so it's
  // entering from the lower-middle. The negative bottom rootMargin sets the crossover
  // line; the observer is never disconnected, so scrolling back up flips it back.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => setTailored(entry.isIntersecting));
      },
      { rootMargin: '0px 0px -55% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const score = tailored ? 89 : 34;
  const scoreColor = tailored ? MATCH : CLAY;
  const stagger = (i: number) => (!reducedMotion && tailored ? `${i * 80}ms` : '0ms');

  return (
    <section style={{ padding: '80px 32px', borderTop: `1px solid ${BORDER_SOFT}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          className="landing-reveal"
          style={{ maxWidth: 680, margin: '0 auto 40px', textAlign: 'center' }}
        >
          <div style={{ ...eyebrowStyle, marginBottom: 16 }}>Watch one line get tailored</div>
          <h2
            className="font-serif"
            style={{
              fontSize: 'clamp(28px, 3.6vw, 42px)',
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: '-0.025em',
            }}
          >
            It doesn&apos;t invent a new you.
            <br />
            It rewrites what&apos;s already true.
          </h2>
          {/* <p
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: FG_2,
              maxWidth: 560,
              margin: '18px auto 0',
            }}
          >
            Same experience, matched to the words this job is scanning for &mdash; and still in your
            voice. Flip the switch.
          </p> */}
        </div>

        <div
          ref={stageRef}
          className="landing-reveal"
          style={{
            maxWidth: 880,
            margin: '0 auto',
            background: 'var(--card)',
            border: `1px solid ${BORDER}`,
            borderRadius: 18,
            boxShadow: '0 1px 1px rgba(15,23,42,0.05), 0 30px 70px rgba(15,23,42,0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Toggle bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '16px 22px',
              borderBottom: `1px solid ${BORDER_SOFT}`,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: FG_3,
              }}
            >
              Bullet &middot; Work experience
            </span>
            <div
              role="tablist"
              aria-label="Compare resume versions"
              style={{
                display: 'flex',
                gap: 4,
                padding: 4,
                background: 'var(--muted)',
                border: `1px solid ${BORDER}`,
                borderRadius: 11,
              }}
            >
              <ToggleButton on={!tailored} onClick={() => setTailored(false)}>
                Your version
              </ToggleButton>
              <ToggleButton on={tailored} onClick={() => setTailored(true)}>
                Tailored
              </ToggleButton>
            </div>
          </div>

          {/* Body */}
          <div
            className="demo-body"
            style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr' }}
          >
            <div
              className="demo-resume"
              style={{ padding: '30px 32px', borderRight: `1px solid ${BORDER_SOFT}` }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: FG_3,
                  marginBottom: 18,
                }}
              >
                Frontend Developer &middot; 2022&ndash;2024
              </div>
              {tailored ? (
                <p style={bulletStyle}>
                  <Kw index={0} reduced={reducedMotion}>
                    Shipped
                  </Kw>{' '}
                  <Kw index={1} reduced={reducedMotion}>
                    React
                  </Kw>{' '}
                  features across a{' '}
                  <Kw index={2} reduced={reducedMotion}>
                    cross-functional
                  </Kw>{' '}
                  team and built reusable{' '}
                  <Kw index={3} reduced={reducedMotion}>
                    design-system
                  </Kw>{' '}
                  components that improved page{' '}
                  <Kw index={4} reduced={reducedMotion}>
                    performance
                  </Kw>{' '}
                  on the checkout flow.
                </p>
              ) : (
                <p style={bulletStyle}>
                  Was responsible for working on the front-end team and helping build out different
                  parts of the web app over time.
                </p>
              )}
            </div>

            <div
              style={{
                padding: 30,
                background: 'linear-gradient(180deg, rgba(201,138,63,0.04), transparent 60%)',
              }}
            >
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Match score</span>
                  <span
                    className="font-serif"
                    style={{
                      fontSize: 34,
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                      color: scoreColor,
                      fontVariantNumeric: 'tabular-nums',
                      transition: 'color 0.4s ease',
                    }}
                  >
                    {score}
                  </span>
                </div>
                <div
                  style={{
                    height: 9,
                    borderRadius: 99,
                    background: 'var(--secondary)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: tailored ? '89%' : '34%',
                      borderRadius: 99,
                      background: scoreColor,
                      transition:
                        'width 0.7s cubic-bezier(0.5,0,0.2,1), background 0.7s ease',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: FG_3,
                  margin: '20px 0 12px',
                }}
              >
                Keywords from the posting
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {KEYWORDS.map((k, i) => (
                  <span
                    key={k}
                    style={{
                      fontFamily: MONO,
                      fontSize: 12.5,
                      padding: '6px 11px',
                      borderRadius: 8,
                      border: `1px solid ${tailored ? MATCH_LINE : BORDER}`,
                      color: tailored ? MATCH : FG_2,
                      background: tailored ? MATCH_BG : 'var(--card)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      transition: 'color 0.3s ease, background 0.3s ease, border-color 0.3s ease',
                      transitionDelay: stagger(i),
                    }}
                  >
                    {k}
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: tailored ? MATCH : CLAY,
                        transition: 'background 0.3s ease',
                        transitionDelay: stagger(i),
                      }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 860px) {
          .demo-body {
            grid-template-columns: 1fr !important;
          }
          .demo-resume {
            border-right: none !important;
            border-bottom: 1px solid ${BORDER_SOFT};
          }
        }
      `}</style>
    </section>
  );
}

function ToggleButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      style={{
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        padding: '8px 18px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--primary)' : 'transparent',
        color: on ? '#fff' : FG_2,
        transition: 'background 0.18s ease, color 0.18s ease',
      }}
    >
      {children}
    </button>
  );
}

function Kw({
  index,
  reduced,
  children,
}: {
  index: number;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <span
      style={{
        background: MATCH_BG,
        color: MATCH,
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: 5,
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        animation: reduced ? undefined : `landing-kw 0.5s ${index * 80}ms both`,
      }}
    >
      {children}
    </span>
  );
}
