import type {
  AnalysisResult,
  ResumeInput,
  JobDescription,
  ResumePdfPayload,
} from './types';
import type { AiParsedResumePayloadV2 } from '@resume-scanner/resume-contract';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

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

async function parseApiErrorMessage(res: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function fetchWithAuth(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string
): Promise<Response> {
  const makeRequest = async (forceRefresh = false): Promise<Response> => {
    const token = await requireAuthToken({ forceRefresh });
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  };

  let res = await makeRequest(false);

  if (res.status === 401) {
    res = await makeRequest(true);
    if (res.status === 401) {
      if (authFailureHandler) {
        await authFailureHandler();
      }
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (!res.ok) {
    throw new Error(await parseApiErrorMessage(res, fallbackErrorMessage));
  }

  return res;
}

const normalizeRewriteSection = (
  section: string | undefined
): AnalysisResult['rewriteSuggestions'][number]['section'] => {
  if (section === 'experience' || section === 'projects' || section === 'skills' || section === 'summary') {
    return section;
  }
  return 'experience';
};

const normalizeBulletSection = (section: string | undefined): string => {
  const normalized = String(section || '').trim().toLowerCase();
  if (
    normalized === 'experience' ||
    normalized === 'work' ||
    normalized === 'professional experience'
  ) {
    return 'Experience';
  }
  if (normalized === 'projects' || normalized === 'project') return 'Projects';
  if (normalized === 'skills' || normalized === 'skill') return 'Skills';
  if (normalized === 'summary') return 'Summary';
  return 'Experience';
};

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

export const sampleResume = `
Marko Markovic
markovicm668@gmail.com | +381654071575 | Belgrade, Serbia |
linkedin.com/in/markomarkovic6 | github.com/markovicm668
Education
Faculty of Organizational Sciences, University of Belgrade 2021 – 2025
Information Systems and Technologies Serbia
Valjevska Gimnazija
Science and Mathematics
Professional Experience
Project Coordinator, FD Organization 09/2023 – 05/2024
Belgrade, Serbia
– Led 2 cross-functional teams to deliver internal web platform used by 100+ students
– Owned product vision and roadmap, converting 50+ user stories into deliverables with engineering and design
– Ensured weekly delivery by removing blockers and aligning engineering, design, and stakeholder expectations
– Prioritized product backlog in ClickUp, balancing stakeholder goals and development velocity
Working Student in Office and Travel Management, Netconomy 09/2023 – Present
Belgrade, Serbia
– Negotiated corporate hotel rates, saving $2000 annually
– Processed 30+ expense reports monthly with 100% accuracy
– Managed travel requests and approvals using ServiceNow, working daily with request workflows and fulfiller/agent
interfaces
– Implemented wellness initiatives boosting staff well-being
Personal Projects
Loyalty Stamp Card App | React Native, Node.js, MongoDB 05/2025 – 08/2025
– Conducted 10+ customer interviews to validate product-market fit and adjusted MVP scope
– Designed digital loyalty system for local cafes to issue and track stamps
– Built QR-code scanning flow for in-app reward redemption
Coffee-to-Go Ordering App | React Native, Node.js, MongoDB 11/2024 – 04/2025
– Built cross-platform mobile app to pre-order coffee and skip queues
– Defined and shipped real-time notifications feature, improving order visibility and reducing wait-time uncertainty
for testers
– Handled 100+ test orders during testing with custom backend services
Instagram Theme Pages Business – Grew two niche pages to 10K+ followers each in 2 years
– Collaborated with 15+ influencers to boost engagement by 25%
– Generated $1500 through sponsorships and product sales
05/2016 – 02/2021
Achievements
1st place, Unija Case Challenge (international) — Cryptocurrency taxation strategy
3rd place, Renovation Case Challenge (SC Usce) — Loyalty system implementation concept
Skills
Technical: Node.js, Express.js, MongoDB, React Native, Git
Product management: User-story writing, Backlog grooming, Wireframing (Figma)
Soft: Cross-functional coordination, Agile ceremonies, Stakeholder communication
PM Tools: ServiceNow, JIRA, Confluence, ClickUp, Notion
Analytics: Google Analytics, Excel, SQL, R (programming language)
Languages
Serbian (native), English (fluent), German (basic)
`;

// API Functions
export async function analyzeResume(
  resume: ResumeInput,
  jobDescription: JobDescription
): Promise<AnalysisResult> {
  const res = await fetchWithAuth('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText: resume.content,
      jobDescription: jobDescription.text,
    }),
  }, 'Analyze failed');

  const json = await res.json();

  if (!json || !json.data) {
    throw new Error("Invalid API response format: missing 'data' field.");
  }

  const ai = json.data as {
    matchScore?: number;
    roleSeniority?: AnalysisResult['roleSeniority'];
    overallFit?: AnalysisResult['overallFit'];
    targetRole?: string;
    company?: string;
    missingKeywords?: string[];
    rewrittenBullets?: Array<{ section?: string; original?: string; improved?: string }>;
    rewrittenLines?: Array<{ section?: string; original?: string; improved?: string }>;
    rewriteSuggestions?: Array<{
      section?: string;
      originalText?: string;
      improvedText?: string;
      rationale?: string;
    }>;
    atsWarnings?: string[];
    suggestions?: string[];
  };

  return {
    id: `analysis-${Date.now()}`,
    createdAt: new Date().toISOString(),

    matchScore: ai.matchScore ?? 0,
    roleSeniority: ai.roleSeniority ?? 'mid',
    overallFit: ai.overallFit ?? 'good',

    targetRole: ai.targetRole || 'Unknown Role',
    company: ai.company || 'Unknown Company',
    status: 'completed',

    keywordGaps: (ai.missingKeywords || []).map((kw: string) => ({
      keyword: kw,
      importance: 'medium',
      suggestedPhrases: [],
      category: 'Missing keyword',
    })),

    bulletChanges: (ai.rewrittenLines || ai.rewrittenBullets || []).map(b => ({
      section: normalizeBulletSection(b.section),
      original: b.original ?? '',
      improved: b.improved ?? '',
      type: 'modified' as const,
    })),

    rewriteSuggestions: (ai.rewriteSuggestions || []).map((s, i: number) => ({
      id: `rw-${i}`,
      section: normalizeRewriteSection(s.section),
      originalText: s.originalText ?? '',
      improvedText: s.improvedText ?? '',
      rationale: s.rationale ?? '',
      atsNotes: '',
    })),

    atsChecks: (ai.atsWarnings || []).map((w: string, i: number) => ({
      id: `ats-${i}`,
      name: 'ATS Warning',
      status: 'warning',
      message: w,
      tip: 'Consider revising this section',
    })),

    riskFlags: [],

    recommendedEdits: (ai.suggestions || []).map((s: string, i: number) => ({
      id: `re-${i}`,
      text: s,
      completed: false,
    })),
  };
}

export async function parseResume(request: {
  resumeText: string;
  inputType?: 'file' | 'text' | 'linkedin';
  fileName?: string;
}): Promise<AiParsedResumePayloadV2> {
  const res = await fetchWithAuth('/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeText: request.resumeText,
      inputType: request.inputType || 'text',
      fileName: request.fileName,
    }),
  }, 'Parse failed');

  const json = await res.json();
  if (!json?.data) {
    throw new Error("Invalid parse API response: missing 'data' field.");
  }

  return json.data as AiParsedResumePayloadV2;
}

export async function exportResumePdf(resume: ResumePdfPayload): Promise<Blob> {
  const res = await fetchWithAuth('/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume }),
  }, 'PDF export failed');

  return res.blob();
}
