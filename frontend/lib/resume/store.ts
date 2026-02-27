'use client';

import { createContext, useContext } from 'react';
import type {
  AiParsedResumePayloadV2,
  AnalysisSnapshotV1,
  BulletChange,
  ResumeInputType,
} from '@resume-scanner/resume-contract';
import type { ResumeInlineEditTarget } from './inline-edits';
import type { ResumeStoreState } from './reducer';

export interface ResumeActions {
  setSourceInput: (payload: {
    inputType: ResumeInputType;
    rawText: string;
    fileName?: string;
    clearAnalysis?: boolean;
  }) => void;
  setAnalysisSnapshot: (snapshot: AnalysisSnapshotV1 | null) => void;
  setParsedPayload: (payload: AiParsedResumePayloadV2 | null) => void;
  setBulletChanges: (changes: BulletChange[]) => void;
  setSectionOrder: (sectionOrder: string[]) => void;
  applyInlineEdit: (target: ResumeInlineEditTarget, text: string) => void;
  resetWorkspace: () => void;
}

export const ResumeStateContext = createContext<ResumeStoreState | undefined>(undefined);
export const ResumeActionsContext = createContext<ResumeActions | undefined>(undefined);

export function useResumeState(): ResumeStoreState {
  const context = useContext(ResumeStateContext);
  if (!context) {
    throw new Error('useResumeState must be used within ResumeProvider');
  }
  return context;
}

export function useResumeActions(): ResumeActions {
  const context = useContext(ResumeActionsContext);
  if (!context) {
    throw new Error('useResumeActions must be used within ResumeProvider');
  }
  return context;
}

export function useResumeSelector<T>(selector: (state: ResumeStoreState) => T): T {
  const state = useResumeState();
  return selector(state);
}

export type { ResumeStoreState } from './reducer';
