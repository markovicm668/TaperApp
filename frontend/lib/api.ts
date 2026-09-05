import type {
  AnalysisResult,
  AnalyzeAiResponse,
  ApplicationDetail,
  ApplicationStatus,
  ApplicationSummary,
  BulletChange,
  KeywordGap,
  ResumeInput,
  JobDescription,
  ResumePdfPayload,
  ResumeTemplateId,
  SavedResumeDetail,
  SavedResumeSummary,
  ScoreBreakdown,
} from './types';
import type { AiParsedResumePayloadV2 } from '@resume-scanner/resume-contract';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';
console.log('[api] API_BASE_URL:', API_BASE_URL);

interface GetTokenOptions {
  forceRefresh?: boolean;
}

type TokenResolver = (options?: GetTokenOptions) => Promise<string | null>;
type AuthFailureHandler = () => void | Promise<void>;

let authTokenResolver: TokenResolver | null = null;
let authFailureHandler: AuthFailureHandler | null = null;

export function configureApiAuth(params: {
  tokenResolver: TokenResolver | null;
  onAuthFailure?: AuthFailureHandler | null;
}): void {
  authTokenResolver = params.tokenResolver;
  authFailureHandler = params.onAuthFailure ?? null;
}

async function requireAuthToken(options?: GetTokenOptions): Promise<string> {
  if (!authTokenResolver) {
    throw new Error('Authentication is not initialized. Please sign in again.');
  }

  const token = await authTokenResolver(options);
  if (!token) {
    throw new Error('Authentication required. Please sign in.');
  }

  return token;
}

async function tryGetAuthToken(options?: GetTokenOptions): Promise<string | null> {
  if (!authTokenResolver) return null;
  try {
    return await authTokenResolver(options);
  } catch {
    return null;
  }
}

async function parseApiErrorMessage(res: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = await res.json();
    const base = data?.error?.message || fallbackMessage;
    const detail = data?.error?.details?.geminiError;
    return detail ? `${base} (${detail})` : base;
  } catch {
    return fallbackMessage;
  }
}

interface FetchWithAuthOptions {
  auth?: 'required' | 'optional';
}

async function fetchWithAuth(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const authMode = options.auth ?? 'required';

  const makeRequest = async (forceRefresh = false): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    const token =
      authMode === 'required'
        ? await requireAuthToken({ forceRefresh })
        : await tryGetAuthToken({ forceRefresh });
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    console.log('[api] fetching:', `${API_BASE_URL}${path}`);
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  };

  let res = await makeRequest(false);

  if (res.status === 401 && authMode === 'required') {
    res = await makeRequest(true);
    if (res.status === 401) {
      if (authFailureHandler) {
        await authFailureHandler();
      }
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (res.status === 402) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data?.error?.message || 'Insufficient tokens') as Error & {
      code: string;
      tokensRemaining: number;
    };
    // Preserve the server's error code (e.g. FREE_TRIAL_USED vs
    // INSUFFICIENT_TOKENS) so callers can branch on it.
    err.code = data?.error?.code || 'INSUFFICIENT_TOKENS';
    err.tokensRemaining = data?.error?.tokensRemaining ?? 0;
    throw err;
  }

  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res, fallbackErrorMessage));
  }

  return res;
}

export const sampleJobDescription = `
About the job
We are looking for a Business Development Representative responsible for identifying new sales opportunities for small to medium‑scale customers. This role involves close coordination with sales teams to enhance customer experience, support business growth, and contribute to a strong sales pipeline. You will play a key role in generating and qualifying leads, engaging prospects through digital channels, and ensuring smooth handovers to the sales organization.

About You – Experience, Education, Skills, And Accomplishments

Proficient in English language
2+ years of relevant experience
Bachelor's degree or equivalent work experience 

It would be great if you also have . . . 

Experience working in a digital sales environment
Familiarity with CRM systems (e.g., Salesforce)
Strong communication and active listening skills
Ability to work independently and manage multiple priorities
Previous experience supporting small to medium‑scale customers

What will you be doing in this role?

Collaborating with internal teams to identify new sales opportunities for small to medium‑scale customers by leveraging insights gathered through prospect interactions.
Engaging with prospects via email and outbound calls to create high‑quality sales opportunities for the sales team.
Scheduling follow-up meetings and monitoring progress to help advance prospects through the sales funnel.
Coordinating closely with sales teams to ensure a seamless and positive experience for prospects and customers.
Continuously learning about Clarivate product offerings to improve prospecting effectiveness and deliver tailored messaging.
Maintaining accurate and up‑to‑date information on prospects and customers in CRM systems to support efficient sales processes.

About The Team

You will be joining the Academia & Government segment—an energetic and mission‑driven team dedicated to supporting educational institutions and government organizations. The team thrives on collaboration, continuous learning, and delivering meaningful digital engagement. As part of this segment, you will contribute to expanding our reach, strengthening customer relationships, and ensuring a high‑quality prospect and customer experience.

`;

export const sampleResume = `LAURA MENDES
laura.mendes@email.com | +44 7891 234 567 | linkedin.com/in/lauramendes | London, UK

PROFILE
Results-oriented sales professional with 2.5 years of experience in digital sales environments, combining outbound prospecting with customer success support for SaaS clients. Comfortable managing multi-channel prospect engagement and CRM workflows. Strong communicator with a track record of collaborating across sales teams to advance pipeline and deliver a positive customer experience.

EXPERIENCE
Sales Development Representative
Datapath Analytics — London, UK (Remote) | Mar 2023 – Present

Conduct outbound email sequences and follow-up calls to generate qualified leads for the Account Executive team, averaging 55+ prospect touchpoints per week
Qualify inbound and outbound leads against ICP criteria and hand off high-fit prospects with structured context notes via HubSpot CRM
Collaborate with AEs to schedule discovery calls, helping reduce pipeline stall rate by ~18% over two quarters
Maintain accurate prospect and account records in CRM to support pipeline forecasting
Participate in weekly product enablement sessions to sharpen messaging for different buyer personas

Customer Success & Sales Support Associate
Orbis Digital — Lisbon, Portugal | Sep 2021 – Feb 2023

Managed a portfolio of 30+ SMB clients on a digital marketing SaaS platform, supporting onboarding, adoption, and renewal
Assisted the sales team with prospect research, outreach drafts, and demo scheduling
Responded to inbound inquiries via email and chat, qualifying interest and routing to the appropriate sales contact
Logged all customer interactions in Zoho CRM, flagging upsell opportunities for the sales team


EDUCATION
BA in Business Communication
University of Coimbra, Portugal | Graduated 2021

SKILLS & TOOLS

CRM: HubSpot, Zoho CRM (familiar with Salesforce basics)
Outreach: Email sequencing, cold calling, LinkedIn Sales Navigator
Languages: English (C1), Portuguese (native), Spanish (conversational)`;

const SCORE_DIMENSIONS: Array<keyof ScoreBreakdown> = [
  'roleMatch',
  'skillsCoverage',
  'seniorityFit',
  'keywordAlignment',
];

function sanitizeScores(
  rawScores: NonNullable<AnalyzeAiResponse['meta']>['scores']
): ScoreBreakdown | undefined {
  if (!rawScores || typeof rawScores !== 'object') return undefined;

  const scores: ScoreBreakdown = {};
  for (const dimension of SCORE_DIMENSIONS) {
    const raw = rawScores[dimension];
    if (!raw || typeof raw !== 'object') continue;
    const value = Number(raw.value);
    if (!Number.isFinite(value)) continue;
    scores[dimension] = {
      value: Math.max(0, Math.min(100, Math.round(value))),
      note: typeof raw.note === 'string' ? raw.note : undefined,
    };
  }

  return Object.keys(scores).length ? scores : undefined;
}

function sanitizeKeywordGaps(
  rawGaps: NonNullable<AnalyzeAiResponse['meta']>['keywordGaps']
): KeywordGap[] {
  if (!Array.isArray(rawGaps)) return [];
  return rawGaps
    .filter(
      (gap): gap is { keyword: string; importance?: unknown } =>
        Boolean(gap) && typeof gap.keyword === 'string' && gap.keyword.trim().length > 0
    )
    .map(gap => ({
      keyword: gap.keyword.trim(),
      importance:
        gap.importance === 'high' || gap.importance === 'medium' || gap.importance === 'low'
          ? gap.importance
          : 'medium',
      suggestedPhrases: [],
      category: '',
    }));
}

// Maps the raw /analyze AI output into the client AnalysisResult. Also used
// to rehydrate saved applications from the tracker (see getApplication).
export function mapAnalyzeAiResult(
  ai: AnalyzeAiResponse,
  parsedResumeData?: AiParsedResumePayloadV2['resumeData']
): AnalysisResult {
  const meta = ai.meta ?? {};

  const workHighlightById = new Map<string, string>();
  const projectHighlightById = new Map<string, string>();
  const skillById = new Map<string, { name: string; category?: string }>();
  if (parsedResumeData) {
    (parsedResumeData.work ?? []).forEach(w =>
      (w.highlights ?? []).forEach(h => {
        if (h.id) workHighlightById.set(h.id, h.text);
      })
    );
    (parsedResumeData.projects ?? []).forEach(p =>
      (p.highlights ?? []).forEach(h => {
        if (h.id) projectHighlightById.set(h.id, h.text);
      })
    );
    (parsedResumeData.skills ?? []).forEach(s => {
      if (s.id) skillById.set(s.id, { name: s.name, category: s.category });
    });
  }

  const stripBracketPrefix = (s: string) => s.replace(/^\s*\[[^\]]+\]\s*/, '');
  const unwrapBracketedId = (s: string) => s.replace(/^\s*\[([^\]]+)\]\s*$/, '$1').trim();
  const SUMMARY_ID = 'summary-0';

  const highlightBulletChanges: BulletChange[] = [];
  const summaryBulletChanges: BulletChange[] = [];

  for (const h of ai.highlights?.update ?? []) {
    const id = unwrapBracketedId(h.id ?? '');
    const workText = workHighlightById.get(id);
    const projectText = projectHighlightById.get(id);

    if (workText !== undefined) {
      highlightBulletChanges.push({
        id,
        section: 'Experience',
        original: workText,
        improved: h.text,
        type: 'modified',
      });
    } else if (projectText !== undefined) {
      highlightBulletChanges.push({
        id,
        section: 'Projects',
        original: projectText,
        improved: h.text,
        type: 'modified',
      });
    } else if (id === SUMMARY_ID) {
      summaryBulletChanges.push({
        id,
        section: 'Summary',
        original: parsedResumeData?.summary ?? '',
        improved: h.text,
        type: 'modified',
      });
    } else {
      console.warn('[analyzeResume] Dropping highlight update with unknown id:', h.id);
    }
  }

  const skillBulletChanges: BulletChange[] = [
    ...(ai.skills?.add ?? []).map(s => {
      const cleanName = stripBracketPrefix(s.name);
      return {
        section: 'Skills',
        original: '',
        improved: s.category ? `[${s.category}] ${cleanName}` : cleanName,
        type: 'added' as const,
      };
    }),
    ...(ai.skills?.remove ?? []).map(s => {
      const cleanId = s.id.replace(/^\[|\]$/g, '');
      return {
        id: cleanId,
        section: 'Skills',
        original: skillById.get(cleanId)?.name ?? '',
        improved: '',
        type: 'removed' as const,
      };
    }),
  ];

  const result: AnalysisResult = {
    id: `analysis-${Date.now()}`,
    createdAt: new Date().toISOString(),

    matchScore: meta.matchScore ?? 0,
    roleSeniority: meta.roleSeniority ?? 'mid',
    overallFit: meta.overallFit ?? 'good',

    targetRole: meta.targetRole || 'Unknown Role',
    company: meta.company || 'Unknown Company',
    status: 'completed',

    scores: sanitizeScores(meta.scores),

    keywordGaps: sanitizeKeywordGaps(meta.keywordGaps),

    bulletChanges: [...highlightBulletChanges, ...summaryBulletChanges, ...skillBulletChanges],

    skillCategoryRenames: (ai.categories?.rename ?? [])
      .filter((r): r is { from: string; to: string } => Boolean(r.from && r.to))
      .map(r => ({ from: r.from!, to: r.to! })),

    rewriteSuggestions: [],

    atsChecks: [],

    riskFlags: [],

    recommendedEdits: [],
  };

  return result;
}

// API Functions
export async function analyzeResume(
  resume: ResumeInput,
  jobDescription: JobDescription,
  parsedResumeData?: AiParsedResumePayloadV2['resumeData'],
  parsedResumePayload?: AiParsedResumePayloadV2
): Promise<{
  result: AnalysisResult;
  // Raw Gemini output, retained so an anonymous analysis can be persisted
  // verbatim as an application after the user signs in (re-opening from
  // history re-maps this raw shape — see mapAnalyzeAiResult).
  analysis: AnalyzeAiResponse;
  parsed: AiParsedResumePayloadV2;
  applicationId?: string | null;
  tokensRemaining?: number;
}> {
  const res = await fetchWithAuth('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText: resume.content,
      jobDescription: jobDescription.text,
      inputType: resume.type,
      fileName: resume.fileName,
      ...(parsedResumeData ? { parsedResumeData } : {}),
      // Full parse payload (source/sections) lets the backend persist the
      // application with enough fidelity to re-open it from history.
      ...(parsedResumePayload ? { parsedResumePayload } : {}),
    }),
  }, 'Analyze failed', { auth: 'optional' });

  const json = await res.json();

  if (!json || !json.data) {
    throw new Error("Invalid API response format: missing 'data' field.");
  }

  const analysis = json.data as AnalyzeAiResponse;
  const result = mapAnalyzeAiResult(analysis, parsedResumeData);

  return {
    result,
    analysis,
    parsed: json.parsed as AiParsedResumePayloadV2,
    applicationId: json.applicationId ?? null,
    tokensRemaining: json.tokensRemaining,
  };
}

export async function parseResume(request: {
  resumeText: string;
  inputType?: 'file' | 'text' | 'linkedin';
  fileName?: string;
}): Promise<AiParsedResumePayloadV2 & { tokensRemaining?: number }> {
  const res = await fetchWithAuth('/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText: request.resumeText,
      inputType: request.inputType || 'text',
      fileName: request.fileName,
    }),
  }, 'Parse failed', { auth: 'optional' });

  const json = await res.json();
  if (!json?.data) {
    throw new Error("Invalid parse API response: missing 'data' field.");
  }

  console.log('[api.ts parseResume] response data:', JSON.stringify(json.data, null, 2));

  const parsed = json.data as AiParsedResumePayloadV2 & { tokensRemaining?: number };
  parsed.tokensRemaining = json.tokensRemaining;
  return parsed;
}

export type PlanId = 'weekly' | 'monthly' | 'lifetime';

export interface UserProfile {
  tokensRemaining: number;
  referralCode: string | null;
  plan: PlanId | null;
  entitled: boolean;
  planExpiresAt: string | null;
  subscriptionStatus: string | null;
  hasSubscription: boolean;
}

export async function fetchUserProfile(referralCode?: string): Promise<UserProfile> {
  const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : '';
  const res = await fetchWithAuth(`/user/me${query}`, { method: 'GET' }, 'Failed to fetch user profile');
  return res.json();
}

// Asks the backend to create a Lemon Squeezy checkout for a plan. The backend
// owns the plan -> variant mapping; the returned URL is opened in the lemon.js
// overlay (see lib/lemonsqueezy.ts). Entitlement is granted by the payment
// webhooks, never by this call.
export async function createCheckout(planId: PlanId): Promise<{ url: string }> {
  const res = await fetchWithAuth('/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId }),
  }, 'Failed to start checkout');
  return res.json();
}

// Fetches a fresh Lemon Squeezy customer-portal URL for the signed-in user's
// subscription (they expire, so one is fetched per click).
export async function fetchPortalUrl(): Promise<{ url: string }> {
  const res = await fetchWithAuth('/billing/portal', { method: 'GET' }, 'Failed to open billing portal');
  return res.json();
}

export async function addCredits(): Promise<{ tokensRemaining: number }> {
  const res = await fetchWithAuth('/user/me/add-credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, 'Failed to add credits');
  return res.json();
}

export async function parseResumePdf(
  file: File
): Promise<AiParsedResumePayloadV2 & { tokensRemaining?: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetchWithAuth('/parse-pdf', {
    method: 'POST',
    body: formData,
  }, 'PDF parse failed', { auth: 'optional' });

  const json = await res.json();
  if (!json?.data) {
    throw new Error("Invalid parse API response: missing 'data' field.");
  }

  const parsed = json.data as AiParsedResumePayloadV2 & { tokensRemaining?: number };
  parsed.tokensRemaining = json.tokensRemaining;
  return parsed;
}

export async function fetchResumePreviewHtml(
  resume: ResumePdfPayload,
  template?: ResumeTemplateId
): Promise<string> {
  const res = await fetchWithAuth('/export/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, ...(template ? { template } : {}) }),
  }, 'Preview generation failed', { auth: 'optional' });

  const json = await res.json();
  return json.html as string;
}

export async function exportResumePdf(
  resume: ResumePdfPayload,
  template: ResumeTemplateId | undefined,
  // The server only renders PDFs for an application the caller owns — the
  // paid deliverable must tie back to a billed (or first-save-free) analysis.
  applicationId: string
): Promise<Blob> {
  const res = await fetchWithAuth('/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, applicationId, ...(template ? { template } : {}) }),
  }, 'PDF export failed');

  return res.blob();
}

// Job tracker (saved applications)

// Persists a pre-computed analysis as a tracked application. Used to save the
// work an anonymous user tailored before they signed in (authenticated
// analyses are saved server-side by /analyze).
export interface CreateApplicationPayload {
  company: string;
  targetRole: string;
  jobDescription: string;
  matchScore: number;
  scores: ScoreBreakdown | null;
  analysis: AnalyzeAiResponse;
  parsed: AiParsedResumePayloadV2;
}

export async function createApplication(
  payload: CreateApplicationPayload
): Promise<{ id: string; tokensRemaining?: number }> {
  const res = await fetchWithAuth(
    '/applications',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Failed to save application'
  );
  const json = await res.json();
  return {
    ...(json.application as { id: string }),
    ...(typeof json.tokensRemaining === 'number' ? { tokensRemaining: json.tokensRemaining } : {}),
  };
}

export async function listApplications(): Promise<ApplicationSummary[]> {
  const res = await fetchWithAuth('/applications', { method: 'GET' }, 'Failed to load applications');
  const json = await res.json();
  return (json.applications ?? []) as ApplicationSummary[];
}

export async function getApplication(id: string): Promise<ApplicationDetail> {
  const res = await fetchWithAuth(
    `/applications/${encodeURIComponent(id)}`,
    { method: 'GET' },
    'Failed to load application'
  );
  const json = await res.json();
  if (!json?.application) {
    throw new Error('Invalid API response format: missing application.');
  }
  return json.application as ApplicationDetail;
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus
): Promise<ApplicationSummary> {
  const res = await fetchWithAuth(
    `/applications/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
    'Failed to update application status'
  );
  const json = await res.json();
  return json.application as ApplicationSummary;
}

// Saves the user's edited resume back onto the tracked application so the
// tracker reopens the edited version instead of the original analysis output.
export async function updateApplicationParsed(
  id: string,
  payload: { parsed: AiParsedResumePayloadV2; bulletChanges: BulletChange[] }
): Promise<void> {
  await fetchWithAuth(
    `/applications/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Failed to save resume edits'
  );
}

export async function deleteApplication(id: string): Promise<void> {
  await fetchWithAuth(
    `/applications/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'Failed to delete application'
  );
}

// --- Saved resumes -------------------------------------------------------
// Free to create and reuse. Reusing one skips the /parse round-trip entirely
// (its payload goes straight to /analyze), so a repeat analysis costs one
// fewer AI call and still charges exactly as a fresh upload does.

export async function createSavedResume(payload: {
  parsed: AiParsedResumePayloadV2;
  label?: string;
}): Promise<{ id: string; label: string }> {
  const res = await fetchWithAuth(
    '/saved-resumes',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Failed to save resume'
  );
  const json = await res.json();
  return json.savedResume as { id: string; label: string };
}

export async function listSavedResumes(): Promise<SavedResumeSummary[]> {
  const res = await fetchWithAuth(
    '/saved-resumes',
    { method: 'GET' },
    'Failed to load saved resumes'
  );
  const json = await res.json();
  return (json.savedResumes ?? []) as SavedResumeSummary[];
}

export async function getSavedResume(id: string): Promise<SavedResumeDetail> {
  const res = await fetchWithAuth(
    `/saved-resumes/${encodeURIComponent(id)}`,
    { method: 'GET' },
    'Failed to load saved resume'
  );
  const json = await res.json();
  if (!json?.savedResume) {
    throw new Error('Invalid API response format: missing savedResume.');
  }
  return json.savedResume as SavedResumeDetail;
}

export async function renameSavedResume(
  id: string,
  label: string
): Promise<SavedResumeSummary> {
  const res = await fetchWithAuth(
    `/saved-resumes/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    },
    'Failed to rename saved resume'
  );
  const json = await res.json();
  return json.savedResume as SavedResumeSummary;
}

export async function deleteSavedResume(id: string): Promise<void> {
  await fetchWithAuth(
    `/saved-resumes/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'Failed to delete saved resume'
  );
}
