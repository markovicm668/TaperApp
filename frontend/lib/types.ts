import type {
  AnalysisSnapshotV1,
  ResumeDataV2,
  ResumeWorkspaceV2,
} from '@resume-scanner/resume-contract';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  creditsRemaining: number;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface ResumeInput {
  type: 'file' | 'text' | 'linkedin';
  content: string;
  fileName?: string;
}

export interface JobDescription {
  text: string;
  role?: string;
  company?: string;
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

export interface AnalysisResult {
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

export interface AnalysisHistoryItem {
  id: string;
  createdAt: string;
  targetRole: string;
  company?: string;
  matchScore: number;
  status: 'completed' | 'processing' | 'failed';
}

export interface UserPreferences {
  targetRoles: string[];
  tone: 'neutral' | 'confident' | 'bold';
  region: 'us' | 'uk' | 'eu';
  industry: string;
  strictAtsMode: boolean;
}

export type AnalysisStep =
  | 'parsing'
  | 'extracting'
  | 'matching'
  | 'rewriting'
  | 'complete';

export type ResumeSectionKind =
  | 'header'
  | 'summary'
  | 'work'
  | 'projects'
  | 'skills'
  | 'education'
  | 'awards'
  | 'languages'
  | 'custom';

export interface ResumeExportSection {
  id: string;
  title: string;
  kind: ResumeSectionKind;
  lines: string[];
  renderMode?: 'canonical' | 'lines';
}

export interface ResumePdfPayload extends ResumeDataV2 {
  summary?: string;
  sections?: ResumeExportSection[];
  sectionOrder: string[];
}

export type CanonicalResumeData = ResumeDataV2;
export type CanonicalResumeWorkspace = ResumeWorkspaceV2;
export type CanonicalAnalysisSnapshot = AnalysisSnapshotV1;
