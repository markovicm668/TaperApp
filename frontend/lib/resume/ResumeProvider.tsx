'use client';

import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type {
  AiParsedResumePayloadV2,
  AnalysisSnapshotV1,
  BulletChange,
  ResumeInputType,
} from '@resume-scanner/resume-contract';
import { initialResumeStoreState, resumeReducer } from './reducer';
import { loadWorkspaceFromSession, writeWorkspaceToSession } from './storage';
import { ResumeActionsContext, ResumeStateContext, type ResumeActions } from './store';

interface ResumeProviderProps {
  children: ReactNode;
}

export function ResumeProvider({ children }: ResumeProviderProps) {
  const [state, dispatch] = useReducer(resumeReducer, initialResumeStoreState);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestWorkspaceRef = useRef(state.workspace);
  const hydratedRef = useRef(state.hydrated);

  useEffect(() => {
    const workspace = loadWorkspaceFromSession();
    dispatch({ type: 'hydrate', payload: { workspace } });
  }, []);

  useEffect(() => {
    latestWorkspaceRef.current = state.workspace;
    hydratedRef.current = state.hydrated;
  }, [state.hydrated, state.workspace]);

  useEffect(() => {
    if (!state.hydrated) return;

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      writeWorkspaceToSession(state.workspace);
      persistTimerRef.current = null;
    }, 200);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [state.hydrated, state.workspace]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }

      if (hydratedRef.current) {
        writeWorkspaceToSession(latestWorkspaceRef.current);
      }
    };
  }, []);

  const actions = useMemo<ResumeActions>(
    () => ({
      setSourceInput(payload: {
        inputType: ResumeInputType;
        rawText: string;
        fileName?: string;
        clearAnalysis?: boolean;
      }) {
        dispatch({ type: 'setSourceInput', payload });
      },
      setAnalysisSnapshot(snapshot: AnalysisSnapshotV1 | null) {
        dispatch({ type: 'setAnalysisSnapshot', payload: { snapshot } });
      },
      setParsedPayload(parsed: AiParsedResumePayloadV2 | null) {
        dispatch({ type: 'setParsedPayload', payload: { parsed } });
      },
      setBulletChanges(changes: BulletChange[]) {
        dispatch({ type: 'setBulletChanges', payload: { changes } });
      },
      resetWorkspace() {
        dispatch({ type: 'resetWorkspace' });
      },
    }),
    []
  );

  return (
    <ResumeStateContext.Provider value={state}>
      <ResumeActionsContext.Provider value={actions}>{children}</ResumeActionsContext.Provider>
    </ResumeStateContext.Provider>
  );
}
