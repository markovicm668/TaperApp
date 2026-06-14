'use client';

import type { CreateApplicationPayload } from '@/lib/api';

// An analysis an anonymous user produced before signing in. Held in
// sessionStorage so it survives the popup/redirect sign-in flow (same storage
// the resume workspace relies on), then flushed to /applications once Firebase
// reports a signed-in user. See results/page.tsx and useAnalyzeFlow.ts.
export type PendingApplication = CreateApplicationPayload;

const PENDING_APPLICATION_STORAGE_KEY = 'pendingApplication.v1';

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function savePendingApplication(application: PendingApplication): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(
      PENDING_APPLICATION_STORAGE_KEY,
      JSON.stringify(application)
    );
  } catch {
    // Ignore quota/serialization failures — a missed save just means the
    // anonymous analysis won't be persisted, which is non-fatal.
  }
}

export function readPendingApplication(): PendingApplication | null {
  if (!canUseSessionStorage()) return null;
  const raw = window.sessionStorage.getItem(PENDING_APPLICATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingApplication;
  } catch {
    window.sessionStorage.removeItem(PENDING_APPLICATION_STORAGE_KEY);
    return null;
  }
}

export function clearPendingApplication(): void {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.removeItem(PENDING_APPLICATION_STORAGE_KEY);
}
