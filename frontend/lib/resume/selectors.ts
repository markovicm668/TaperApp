import { useMemo } from 'react';
import type {
  AiParsedMetaV2,
  AiParsedResumePayloadV2,
  AnalysisSnapshotV1,
  ResumeDataV2,
  ResumeSectionBlockV2,
  ResumeWorkspaceV2,
} from '@resume-scanner/resume-contract';
import type { AnalysisResult, ResumePdfPayload } from '../types';
import {
  buildCanonicalExportPayload,
  type SectionViewModelRow,
  snapshotToAnalysisResult,
} from './mappers';
import { materializeEffectiveSections } from './effective';
import { dedupeSections } from './normalize';
import { type ResumeStoreState, useResumeSelector } from './store';

export const selectWorkspace = (state: ResumeStoreState): ResumeWorkspaceV2 => state.workspace;

export const selectResumeData = (state: ResumeStoreState): ResumeDataV2 =>
  state.workspace.resumeData;

export const selectBulletChanges = (state: ResumeStoreState) => state.workspace.analysis.bulletChanges;

export const selectCurrentResultId = (state: ResumeStoreState): string | null =>
  state.workspace.analysis.resultId || state.workspace.analysis.lastAnalysisResult?.id || null;

export const selectLastAnalysisSnapshot = (
  state: ResumeStoreState
): AnalysisSnapshotV1 | null => state.workspace.analysis.lastAnalysisResult;

export const selectParsedMeta = (
  state: ResumeStoreState
): AiParsedMetaV2 | null => state.workspace.analysis.ai.parsed;

export const selectCanonicalParsePayload = (
  state: ResumeStoreState
): AiParsedResumePayloadV2 | null => {
  const parsedMeta = selectParsedMeta(state);
  if (!parsedMeta) return null;

  return {
    version: '2',
    resumeData: state.workspace.resumeData,
    source: state.workspace.source,
    notes: parsedMeta.notes,
    sections: parsedMeta.sections,
    sectionPresence: parsedMeta.sectionPresence,
    customSections: parsedMeta.customSections,
  };
};

export const selectCanonicalExportPayload = (state: ResumeStoreState): ResumePdfPayload | null =>
  buildCanonicalExportPayload(selectCanonicalParsePayload(state), {
    resumeDataOverride: selectResumeData(state),
  });

export const selectHasResults = (state: ResumeStoreState): boolean => {
  const resultId = selectCurrentResultId(state);
  const status = state.workspace.analysis.lastAnalysisResult?.status;
  return Boolean(resultId && status !== 'failed');
};

export const selectIsHydrated = (state: ResumeStoreState): boolean => state.hydrated;

export const selectParsedResumeSections = (
  state: ResumeStoreState
): ResumeSectionBlockV2[] | null => {
  const parsedMeta = selectParsedMeta(state);
  if (!parsedMeta) return null;

  const merged = [
    ...(Array.isArray(parsedMeta.sections) ? parsedMeta.sections : []),
    ...(Array.isArray(parsedMeta.customSections) ? parsedMeta.customSections : []),
  ];

  if (!merged.length) return null;

  const deduped = dedupeSections(merged);

  return deduped.length ? deduped : null;
};

export function useResumeWorkspace(): ResumeWorkspaceV2 {
  return useResumeSelector(selectWorkspace);
}

export function useResumeData(): ResumeDataV2 {
  return useResumeSelector(selectResumeData);
}

export function useBulletChanges() {
  return useResumeSelector(selectBulletChanges);
}

export function useCurrentResultId(): string | null {
  return useResumeSelector(selectCurrentResultId);
}

export function useHasResults(): boolean {
  return useResumeSelector(selectHasResults);
}

export function useLastAnalysisSnapshot(): AnalysisSnapshotV1 | null {
  return useResumeSelector(selectLastAnalysisSnapshot);
}

export function useCanonicalParsePayload(): AiParsedResumePayloadV2 | null {
  return useResumeSelector(selectCanonicalParsePayload);
}

export function useLastAnalysisResult(): AnalysisResult | null {
  const snapshot = useLastAnalysisSnapshot();
  return useMemo(() => {
    if (!snapshot) return null;
    return snapshotToAnalysisResult(snapshot);
  }, [snapshot]);
}

export function useIsResumeHydrated(): boolean {
  return useResumeSelector(selectIsHydrated);
}

export function useParsedResumeSections(): ResumeSectionBlockV2[] | null {
  return useResumeSelector(selectParsedResumeSections);
}

export function useEffectiveSectionViewModel(): SectionViewModelRow[] {
  const parsedSections = useParsedResumeSections();
  const resumeData = useResumeData();

  return useMemo(
    () => materializeEffectiveSections(parsedSections, resumeData),
    [parsedSections, resumeData]
  );
}

export function useExportPayload(): ResumePdfPayload | null {
  return useResumeSelector(selectCanonicalExportPayload);
}
