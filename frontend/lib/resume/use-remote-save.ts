'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { updateApplicationParsed } from '@/lib/api';
import { useAuth } from '@/lib/auth/useAuth';
import { selectCanonicalParsePayload } from './selectors';
import { useResumeState } from './store';

// Network saves coalesce an edit burst into few PATCHes; the payload is a
// full document (last-write-wins), so dropped intermediate saves are harmless.
const REMOTE_SAVE_DEBOUNCE_MS = 2000;

// Auto-saves resume edits onto the tracked application so the tracker reopens
// the edited version. No-ops for guests and for workspaces without an
// applicationId (e.g. failed analyses). Mounted once on the results page.
export function useRemoteResumeSave(): void {
  const { user } = useAuth();
  const state = useResumeState();

  const applicationId = state.workspace.analysis.applicationId;
  const editVersion = state.editVersion;

  const stateRef = useRef(state);
  const userRef = useRef(user);
  useEffect(() => {
    stateRef.current = state;
    userRef.current = user;
  }, [state, user]);

  // Initialized to the mount-time version so loading a workspace never saves.
  const lastSavedVersionRef = useRef(editVersion);
  const savingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureToastShownRef = useRef(false);

  const saveNow = useCallback(() => {
    // Read from refs so pagehide/unmount flushes see the latest state, and so
    // the id and payload always come from the same state snapshot.
    const current = stateRef.current;
    const id = current.workspace.analysis.applicationId;
    if (!userRef.current || !id) return;
    if (current.editVersion <= lastSavedVersionRef.current) return;
    if (savingRef.current) return;

    const parsed = selectCanonicalParsePayload(current);
    if (!parsed) return;

    const versionBeingSaved = current.editVersion;
    savingRef.current = true;
    updateApplicationParsed(id, {
      parsed,
      bulletChanges: current.workspace.analysis.bulletChanges,
    })
      .then(() => {
        lastSavedVersionRef.current = Math.max(lastSavedVersionRef.current, versionBeingSaved);
        failureToastShownRef.current = false;
      })
      .catch(error => {
        // Stay dirty so the next edit or flush retries.
        console.error('Failed to save resume edits:', error);
        if (!failureToastShownRef.current) {
          failureToastShownRef.current = true;
          toast.error('Failed to save your edits', {
            description: 'Your changes are kept in this tab and saving will be retried.',
          });
        }
      })
      .finally(() => {
        savingRef.current = false;
        // Edits that arrived while the request was in flight need another save.
        if (stateRef.current.editVersion > lastSavedVersionRef.current) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(saveNow, REMOTE_SAVE_DEBOUNCE_MS);
        }
      });
  }, []);

  // Switching applications (reopen from tracker, new analysis) discards the
  // previous workspace, so pending dirtiness no longer applies. Adopting an id
  // into the same workspace (guest sign-in flush, analyze completion) keeps
  // dirtiness so pre-signin edits get their first save.
  const trackedIdRef = useRef(applicationId);
  useEffect(() => {
    const previousId = trackedIdRef.current;
    if (previousId === applicationId) return;
    trackedIdRef.current = applicationId;
    if (previousId !== null) {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      lastSavedVersionRef.current = stateRef.current.editVersion;
    }
  }, [applicationId]);

  useEffect(() => {
    if (!user || !applicationId) return;
    if (editVersion <= lastSavedVersionRef.current) return;

    const timer = setTimeout(saveNow, REMOTE_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [applicationId, editVersion, saveNow, user]);

  useEffect(() => {
    // Best effort: the request may not complete during teardown, but the
    // short debounce keeps the loss window small.
    const onPageHide = () => saveNow();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      // Flush on unmount so in-app navigation away from the editor saves.
      saveNow();
    };
  }, [saveNow]);
}
