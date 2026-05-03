import type {
  AnalysisResult,
  BulletChange,
  ResumeInput,
  JobDescription,
  ResumePdfPayload,
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
    err.code = 'INSUFFICIENT_TOKENS';
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

// API Functions
export async function analyzeResume(
  resume: ResumeInput,
  jobDescription: JobDescription,
  parsedResumeData?: AiParsedResumePayloadV2['resumeData']
): Promise<{ result: AnalysisResult; parsed: AiParsedResumePayloadV2; tokensRemaining?: number }> {
  const res = await fetchWithAuth('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText: resume.content,
      jobDescription: jobDescription.text,
      inputType: resume.type,
      fileName: resume.fileName,
      ...(parsedResumeData ? { parsedResumeData } : {}),
    }),
  }, 'Analyze failed', { auth: 'optional' });

  const json = await res.json();

  if (!json || !json.data) {
    throw new Error("Invalid API response format: missing 'data' field.");
  }

  const ai = json.data as {
    meta?: {
      matchScore?: number;
      roleSeniority?: AnalysisResult['roleSeniority'];
      overallFit?: AnalysisResult['overallFit'];
      targetRole?: string;
      company?: string;
    };
    highlights?: {
      update?: Array<{ id: string; text: string }>;
    };
    skills?: {
      add?: Array<{ name: string; category: string }>;
      remove?: Array<{ id: string }>;
    };
    categories?: {
      rename?: Array<{ from?: string; to?: string }>;
    };
  };

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

  const highlightBulletChanges: BulletChange[] = [];
  const summaryBulletChanges: BulletChange[] = [];

  for (const h of ai.highlights?.update ?? []) {
    const workText = workHighlightById.get(h.id);
    const projectText = projectHighlightById.get(h.id);

    if (workText !== undefined) {
      highlightBulletChanges.push({
        id: h.id,
        section: 'Experience',
        original: workText,
        improved: h.text,
        type: 'modified',
      });
    } else if (projectText !== undefined) {
      highlightBulletChanges.push({
        id: h.id,
        section: 'Projects',
        original: projectText,
        improved: h.text,
        type: 'modified',
      });
    } else {
      summaryBulletChanges.push({
        id: h.id,
        section: 'Summary',
        original: parsedResumeData?.summary ?? '',
        improved: h.text,
        type: 'modified',
      });
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

    keywordGaps: [],

    bulletChanges: [...highlightBulletChanges, ...summaryBulletChanges, ...skillBulletChanges],

    skillCategoryRenames: (ai.categories?.rename ?? [])
      .filter((r): r is { from: string; to: string } => Boolean(r.from && r.to))
      .map(r => ({ from: r.from!, to: r.to! })),

    rewriteSuggestions: [],

    atsChecks: [],

    riskFlags: [],

    recommendedEdits: [],
  };

  return { result, parsed: json.parsed as AiParsedResumePayloadV2, tokensRemaining: json.tokensRemaining };
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

export async function fetchUserProfile(
  referralCode?: string
): Promise<{ tokensRemaining: number; referralCode: string }> {
  const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : '';
  const res = await fetchWithAuth(`/user/me${query}`, { method: 'GET' }, 'Failed to fetch user profile');
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

export async function fetchResumePreviewHtml(resume: ResumePdfPayload): Promise<string> {
  const res = await fetchWithAuth('/export/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume }),
  }, 'Preview generation failed', { auth: 'optional' });

  const json = await res.json();
  return json.html as string;
}

export async function exportResumePdf(resume: ResumePdfPayload): Promise<Blob> {
  const res = await fetchWithAuth('/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume }),
  }, 'PDF export failed');

  return res.blob();
}
