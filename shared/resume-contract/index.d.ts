export interface RuntimeSchema<T> {
  parse: (input: unknown) => T;
  safeParse: (input: unknown) =>
    | {
        success: true;
        data: T;
      }
    | {
        success: false;
        error: unknown;
      };
}

export type ResumeInputType = 'file' | 'text' | 'linkedin';

export interface ResumeLocationV2 {
  address?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}

export interface ResumeMetadataV2 {
  importedAt?: string;
  lastModified?: string;
  lastAnalyzed?: string;
  templateUsed?: string;
  atsScore?: number;
}

export interface ResumeProfileV2 {
  id?: string;
  network?: string;
  username?: string;
  url?: string;
}

export interface ResumeBasicsV2 {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  location?: ResumeLocationV2;
  profiles?: ResumeProfileV2[];
}

export interface ResumeHighlightV2 {
  id?: string;
  text: string;
  originalText?: string;
  source?: string;
  locked?: boolean;
  aiTags?: string[];
  keywordMatches?: string[];
}

export interface ResumeTechnologyV2 {
  skillRefId?: string;
  name: string;
}

export interface ResumeEducationItemV2 {
  id?: string;
  institution?: string;
  degree?: string;
  area?: string;
  studyType?: string;
  startDate?: string;
  endDate?: string;
  location?: ResumeLocationV2;
  gpa?: string;
  honors?: string[];
}

export interface ResumeWorkItemV2 {
  id?: string;
  company?: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  location?: ResumeLocationV2;
  highlights: ResumeHighlightV2[];
}

export interface ResumeProjectItemV2 {
  id?: string;
  name?: string;
  role?: string;
  description?: string;
  technologies: ResumeTechnologyV2[];
  startDate?: string;
  endDate?: string;
  repository?: string;
  url?: string;
  highlights: ResumeHighlightV2[];
}

export interface ResumeAwardItemV2 {
  id?: string;
  title?: string;
  issuer?: string;
  date?: string;
  summary?: string;
}

export interface ResumeLanguageItemV2 {
  id?: string;
  language?: string;
  fluency?: string;
}

export interface ResumeSkillItemV2 {
  id?: string;
  name: string;
  category?: string;
}

export interface ResumeCustomSectionItemV2 {
  id?: string;
  text: string;
}

export interface ResumeCustomSectionV2 {
  id?: string;
  title: string;
  items: ResumeCustomSectionItemV2[];
}

export interface ResumeVersionSnapshotV2 {
  work: ResumeWorkItemV2[];
  projects: ResumeProjectItemV2[];
  education: ResumeEducationItemV2[];
  skills: ResumeSkillItemV2[];
}

export interface ResumeVersionEntryV2 {
  id?: string;
  timestamp?: string;
  reason?: string;
  snapshot: ResumeVersionSnapshotV2;
}

export interface ResumeDataV2 {
  id?: string;
  metadata?: ResumeMetadataV2;
  basics?: ResumeBasicsV2;
  summary?: string;
  education: ResumeEducationItemV2[];
  work: ResumeWorkItemV2[];
  projects: ResumeProjectItemV2[];
  awards: ResumeAwardItemV2[];
  skills: ResumeSkillItemV2[];
  languages: ResumeLanguageItemV2[];
  customSections: ResumeCustomSectionV2[];
  sectionOrder: string[];
  versions: ResumeVersionEntryV2[];
}

export interface ResumeSourceMetaV2 {
  inputType: ResumeInputType;
  rawText: string;
  fileName?: string;
  importedAt: string;
  parsedAt?: string;
  parser?: string;
}

export type ResumeSectionKindV2 =
  | 'header'
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages'
  | 'custom';

export type ResumeSectionCanonicalTargetV2 =
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages'
  | 'none';

export interface ResumeSectionBlockV2 {
  id: string;
  title: string;
  kind: ResumeSectionKindV2;
  lines: string[];
  canonicalTarget?: ResumeSectionCanonicalTargetV2;
}

export interface ResumeSectionPresenceV2 {
  summary: boolean;
  work: boolean;
  projects: boolean;
  skills: boolean;
  education: boolean;
  awards: boolean;
  languages: boolean;
}

export interface KeywordGap {
  keyword: string;
  importance: 'high' | 'medium' | 'low';
  suggestedPhrases: string[];
  category: string;
}

export interface BulletChange {
  section: string;
  original: string;
  improved: string;
  type: 'added' | 'removed' | 'modified';
}

export interface RewriteSuggestion {
  id: string;
  section: 'experience' | 'projects' | 'skills' | 'summary';
  originalText: string;
  improvedText: string;
  rationale: string;
  atsNotes: string;
}

export interface ATSCheck {
  id: string;
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  tip?: string;
}

export interface RiskFlag {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface RecommendedEdit {
  id: string;
  text: string;
  completed: boolean;
}

export interface AnalysisSnapshotV1 {
  id: string;
  createdAt: string;
  matchScore: number;
  roleSeniority: 'junior' | 'mid' | 'senior' | 'lead' | 'executive';
  overallFit: 'poor' | 'fair' | 'good' | 'great';
  targetRole: string;
  company?: string;
  status: 'completed' | 'processing' | 'failed';
  keywordGaps: KeywordGap[];
  bulletChanges: BulletChange[];
  rewriteSuggestions: RewriteSuggestion[];
  atsChecks: ATSCheck[];
  riskFlags: RiskFlag[];
  recommendedEdits: RecommendedEdit[];
}

export interface AiParsedResumePayloadV2 {
  version: '2';
  resumeData: ResumeDataV2;
  source: ResumeSourceMetaV2;
  notes: string[];
  sections?: ResumeSectionBlockV2[];
  sectionPresence?: ResumeSectionPresenceV2;
  customSections?: ResumeSectionBlockV2[];
}

export interface AiParsedMetaV2 {
  version: '2';
  parser?: string;
  parsedAt?: string;
  notes: string[];
  sections?: ResumeSectionBlockV2[];
  sectionPresence?: ResumeSectionPresenceV2;
  customSections?: ResumeSectionBlockV2[];
}

export interface AiReasoningPayloadV1 {
  version: '1';
  summary?: string;
  highlights: string[];
  warnings: string[];
}

export interface ResumeWorkspaceV2 {
  version: '2';
  source: ResumeSourceMetaV2;
  resumeData: ResumeDataV2;
  analysis: {
    resultId: string | null;
    lastAnalysisResult: AnalysisSnapshotV1 | null;
    bulletChanges: BulletChange[];
    ai: {
      parsed: AiParsedMetaV2 | null;
      reasoning: AiReasoningPayloadV1 | null;
    };
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
}

export declare const resumeDataSchema: RuntimeSchema<ResumeDataV2>;
export declare const resumeWorkspaceSchema: RuntimeSchema<ResumeWorkspaceV2>;
export declare const analysisSnapshotSchema: RuntimeSchema<AnalysisSnapshotV1>;
export declare const aiParsedResumePayloadSchema: RuntimeSchema<AiParsedResumePayloadV2>;
export declare const aiReasoningPayloadSchema: RuntimeSchema<AiReasoningPayloadV1>;

export declare function safeParseResumeWorkspace(input: unknown):
  | {
      success: true;
      data: ResumeWorkspaceV2;
    }
  | {
      success: false;
      error: unknown;
    };

export declare function createEmptyResumeData(overrides?: Partial<ResumeDataV2>): ResumeDataV2;

export declare function createEmptySourceMeta(
  overrides?: Partial<ResumeSourceMetaV2>
): ResumeSourceMetaV2;

export declare function createEmptyWorkspace(
  overrides?: Partial<ResumeWorkspaceV2>
): ResumeWorkspaceV2;
