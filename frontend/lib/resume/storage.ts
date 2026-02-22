import {
  createEmptyWorkspace,
  safeParseResumeWorkspace,
  type ResumeWorkspaceV2,
} from '@resume-scanner/resume-contract';

export const RESUME_WORKSPACE_STORAGE_KEY = 'resumeWorkspace.v2';

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function validateWorkspaceCandidate(candidate: unknown): ResumeWorkspaceV2 | null {
  const validated = safeParseResumeWorkspace(candidate);
  return validated.success ? validated.data : null;
}

export function readWorkspaceFromSession(): ResumeWorkspaceV2 | null {
  if (!canUseSessionStorage()) return null;

  const raw = window.sessionStorage.getItem(RESUME_WORKSPACE_STORAGE_KEY);
  if (raw) {
    const parsed = parseJson<unknown>(raw);
    if (!parsed) {
      window.sessionStorage.removeItem(RESUME_WORKSPACE_STORAGE_KEY);
      return null;
    }

    const validated = validateWorkspaceCandidate(parsed);
    if (!validated) {
      window.sessionStorage.removeItem(RESUME_WORKSPACE_STORAGE_KEY);
      return null;
    }

    return validated;
  }
  return null;
}

export function writeWorkspaceToSession(workspace: ResumeWorkspaceV2): void {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(RESUME_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function clearWorkspaceSession(): void {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.removeItem(RESUME_WORKSPACE_STORAGE_KEY);
}

export function loadWorkspaceFromSession(): ResumeWorkspaceV2 {
  return readWorkspaceFromSession() || createEmptyWorkspace();
}
