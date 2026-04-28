'use client';

import { Briefcase, CornerDownRight, FileText, Zap } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

const ACCENT = '#c98a3f';
const ACCENT_TINT = 'rgba(201,138,63,0.18)';
const FG_2 = 'rgba(14,21,37,0.62)';
const FG_3 = 'rgba(14,21,37,0.38)';
const BORDER = 'rgba(14,21,37,0.10)';
const BORDER_SOFT = 'rgba(14,21,37,0.06)';

interface WindowChromeProps {
  children: ReactNode;
  label?: string;
}

export function WindowChrome({ children, label = 'trytailor.cv/analyze' }: WindowChromeProps) {
  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--card)',
        border: `1px solid ${BORDER}`,
        boxShadow:
          '0 1px 1px rgba(15,23,42,0.05), 0 30px 80px rgba(15,23,42,0.12), 0 8px 24px rgba(15,23,42,0.06)',
      }}
    >
      <div
        style={{
          height: 32,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: `1px solid ${BORDER_SOFT}`,
          background: 'var(--muted)',
        }}
      >
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ width: 9, height: 9, borderRadius: '50%', background: 'rgba(14,21,37,0.18)' }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 280,
            margin: '0 auto',
            height: 18,
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: FG_2,
            background: 'rgba(255,255,255,0.6)',
            border: `1px solid ${BORDER_SOFT}`,
            borderRadius: 5,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
          <span>{label}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

interface MockProps {
  height?: number;
}

export function AnalyzeMock({ height = 360 }: MockProps) {
  return (
    <WindowChrome label="tailor.app/analyze">
      <div
        style={{
          padding: '14px 16px 16px',
          background: 'var(--background)',
          height,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: FG_3,
                marginBottom: 3,
              }}
            >
              Analyzer
            </div>
            <div
              className="font-serif"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}
            >
              Tailor your resume
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div
              style={{
                height: 24,
                padding: '0 9px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10.5,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                background: 'var(--card)',
                color: FG_2,
              }}
            >
              5 <span style={{ fontWeight: 400, opacity: 0.7 }}>credits</span>
            </div>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--secondary)',
                border: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                color: FG_2,
              }}
            >
              MK
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1, minHeight: 0 }}>
          <div
            style={{
              background: 'var(--card)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  display: 'inline-flex',
                  width: 20,
                  height: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 5,
                  background: 'var(--secondary)',
                  color: 'var(--primary)',
                }}
              >
                <FileText size={11} />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>Resume</span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 2,
                background: 'var(--muted)',
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 6,
                padding: 2,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: 3,
                  fontSize: 9.5,
                  textAlign: 'center',
                  fontWeight: 600,
                  borderRadius: 4,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                Paste Text
              </div>
              <div style={{ flex: 1, padding: 3, fontSize: 9.5, textAlign: 'center', color: FG_3 }}>
                Upload PDF
              </div>
            </div>
            <div
              style={{
                flex: 1,
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 6,
                padding: 8,
                background: 'var(--muted)',
                fontSize: 9,
                lineHeight: 1.6,
                color: FG_2,
                fontFamily: 'var(--font-mono)',
                overflow: 'hidden',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>MARLEY KOWALSKI</div>
              <div style={{ color: FG_3 }}>Senior Frontend Engineer · NYC</div>
              <div style={{ height: 1, background: BORDER_SOFT, margin: '4px 0' }} />
              <div style={{ fontWeight: 600, color: 'var(--foreground)', marginTop: 4 }}>EXPERIENCE</div>
              <div>Acme Corp — Engineer (2022–present)</div>
              <div>· Built features for the web app using React.</div>
              <div>· Worked with backend team on APIs.</div>
              <div>· Helped junior devs with code reviews.</div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--card)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  display: 'inline-flex',
                  width: 20,
                  height: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 5,
                  background: 'var(--secondary)',
                  color: 'var(--primary)',
                }}
              >
                <Briefcase size={11} />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>Job Description</span>
            </div>
            <div
              style={{
                flex: 1,
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 6,
                padding: 8,
                background: 'var(--muted)',
                fontSize: 9,
                lineHeight: 1.6,
                color: FG_2,
                overflow: 'hidden',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>Senior Frontend Engineer</div>
              <div style={{ color: FG_3 }}>Stripe · Remote (US)</div>
              <div style={{ height: 1, background: BORDER_SOFT, margin: '4px 0' }} />
              <div>
                You&apos;ll architect features in{' '}
                <Highlight>TypeScript</Highlight>, ship{' '}
                <Highlight>GraphQL</Highlight> APIs, and lead{' '}
                <Highlight>system design</Highlight> reviews. You&apos;ll mentor juniors and own{' '}
                <Highlight>CI/CD</Highlight> for the team.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
          <div
            style={{
              height: 26,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              fontWeight: 500,
              color: FG_2,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              background: 'var(--card)',
            }}
          >
            Clear
          </div>
          <div
            style={{
              height: 26,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: 'var(--primary)',
              borderRadius: 6,
            }}
          >
            <Zap size={11} /> Analyze Resume
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function Highlight({ children }: { children: ReactNode }) {
  return (
    <span style={{ background: ACCENT_TINT, padding: '0 2px', borderRadius: 2 }}>{children}</span>
  );
}

const GAPS: Array<{ kw: string; pri: string; color: string }> = [
  { kw: 'TypeScript', pri: 'High', color: 'var(--destructive)' },
  { kw: 'GraphQL', pri: 'High', color: 'var(--destructive)' },
  { kw: 'System Design', pri: 'Med', color: 'var(--warning)' },
  { kw: 'Mentorship', pri: 'Med', color: 'var(--warning)' },
];

export function ResultsMock({ height = 360 }: MockProps) {
  return (
    <WindowChrome label="tailor.app/results">
      <div
        style={{
          padding: '14px 16px 16px',
          background: 'var(--background)',
          height,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            background: 'var(--card)',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: FG_3,
                marginBottom: 2,
              }}
            >
              Analysis Summary
            </div>
            <div
              className="font-serif"
              style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}
            >
              Senior Frontend Engineer{' '}
              <span style={{ color: FG_2, fontWeight: 400 }}>at</span> Stripe
            </div>
            <div style={{ fontSize: 10.5, color: FG_2, marginTop: 2 }}>
              Strong match · key gaps in infra · seniority aligned
            </div>
          </div>
          <MiniScoreRing score={72} size={56} stroke={5} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, flex: 1, minHeight: 0 }}>
          <div
            style={{
              background: 'var(--card)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 2,
                background: 'var(--muted)',
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 6,
                padding: 2,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: 3,
                  fontSize: 9.5,
                  textAlign: 'center',
                  fontWeight: 600,
                  borderRadius: 4,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                Keyword Gaps
              </div>
              <div style={{ flex: 1, padding: 3, fontSize: 9.5, textAlign: 'center', color: FG_3 }}>
                ATS Checks
              </div>
              <div style={{ flex: 1, padding: 3, fontSize: 9.5, textAlign: 'center', color: FG_3 }}>
                Rewrites
              </div>
            </div>
            {GAPS.map((g) => (
              <div
                key={g.kw}
                style={{
                  border: `1px solid ${BORDER_SOFT}`,
                  borderRadius: 7,
                  padding: '6px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.color }} />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{g.kw}</span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 99,
                    border: `1px solid ${BORDER}`,
                    color: g.color,
                  }}
                >
                  {g.pri}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--card)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: FG_3,
              }}
            >
              Suggested rewrite
            </div>
            <div style={{ fontSize: 10, color: FG_3, textDecoration: 'line-through', lineHeight: 1.45 }}>
              Built features for the web app using React.
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <CornerDownRight size={11} style={{ color: 'var(--success)', marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--foreground)', fontWeight: 500 }}>
                Architected 12+ React features in{' '}
                <span
                  style={{
                    background: ACCENT_TINT,
                    padding: '0 2px',
                    borderRadius: 2,
                    fontWeight: 600,
                  }}
                >
                  TypeScript
                </span>
                , reducing bug rate by 40%.
              </div>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 5 }}>
              <div
                style={{
                  flex: 1,
                  height: 22,
                  fontSize: 10,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 5,
                  color: FG_2,
                }}
              >
                Skip
              </div>
              <div
                style={{
                  flex: 1,
                  height: 22,
                  fontSize: 10,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: 5,
                }}
              >
                Accept
              </div>
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

interface MiniScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
}

function MiniScoreRing({ score, size = 44, stroke = 4 }: MiniScoreRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? 'var(--success)'
      : score >= 60
        ? 'var(--primary)'
        : score >= 40
          ? 'var(--warning)'
          : 'var(--destructive)';
  const ringStyle: CSSProperties = { transform: 'rotate(-90deg)' };
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} style={ringStyle}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(14,21,37,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.32,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {score}
      </div>
    </div>
  );
}

export function ScoreCallout() {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 1px 1px rgba(15,23,42,0.05), 0 14px 36px rgba(15,23,42,0.10)',
      }}
    >
      <MiniScoreRing score={84} size={44} stroke={4} />
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: FG_3,
          }}
        >
          Match score
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>
          +12 in <span style={{ color: 'var(--success)' }}>43 seconds</span>
        </div>
      </div>
    </div>
  );
}

export const LANDING_ACCENT = ACCENT;
