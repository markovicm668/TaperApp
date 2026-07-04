import {
  type AiParsedResumePayloadV2,
  type AiParsedMetaV2,
  createEmptyResumeData,
  createEmptyWorkspace,
  type AnalysisSnapshotV1,
  type BulletChange,
  type ResumeInputType,
  type ResumeWorkspaceV2,
} from '@resume-scanner/resume-contract';
import { applyBulletChangesToResumeData } from './effective';
import {
  applyInlineEditToParsedMeta,
  applyInlineEditToResumeData,
  type ResumeInlineEditTarget,
} from './inline-edits';

export interface ResumeStoreState {
  workspace: ResumeWorkspaceV2;
  hydrated: boolean;
  // Bumped only by user edit actions (never by hydrate/rehydrate), so the
  // remote auto-save can tell real edits apart from workspace loads. Kept
  // outside `workspace` so it is never persisted to sessionStorage.
  editVersion: number;
}

export type ResumeStoreAction =
  | { type: 'hydrate'; payload: { workspace: ResumeWorkspaceV2 } }
  | {
      type: 'setSourceInput';
      payload: {
        inputType: ResumeInputType;
        rawText: string;
        fileName?: string;
        clearAnalysis?: boolean;
      };
    }
  | {
      type: 'setAnalysisSnapshot';
      payload: { snapshot: AnalysisSnapshotV1 | null; applyChanges?: boolean };
    }
  | { type: 'setParsedPayload'; payload: { parsed: AiParsedResumePayloadV2 | null } }
  | { type: 'setApplicationId'; payload: { applicationId: string | null } }
  | { type: 'setBulletChanges'; payload: { changes: BulletChange[] } }
  | { type: 'setSectionOrder'; payload: { sectionOrder: string[] } }
  | { type: 'applyInlineEdit'; payload: { target: ResumeInlineEditTarget; text: string } }
  | { type: 'resetWorkspace' };

export const initialResumeStoreState: ResumeStoreState = {
  workspace: createEmptyWorkspace(),
  hydrated: false,
  editVersion: 0,
};

function toParsedMeta(parsed: AiParsedResumePayloadV2): AiParsedMetaV2 {
  return {
    version: '2',
    parser: parsed.source.parser,
    parsedAt: parsed.source.parsedAt,
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    sections: parsed.sections,
    sectionPresence: parsed.sectionPresence,
    customSections: parsed.customSections,
  };
}

function withUpdatedTimestamp(workspace: ResumeWorkspaceV2): ResumeWorkspaceV2 {
  return {
    ...workspace,
    timestamps: {
      ...workspace.timestamps,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function resumeReducer(
  state: ResumeStoreState,
  action: ResumeStoreAction
): ResumeStoreState {
  switch (action.type) {
    case 'hydrate': {
      return {
        ...state,
        workspace: action.payload.workspace,
        hydrated: true,
      };
    }

    case 'setSourceInput': {
      const now = new Date().toISOString();
      const nextResumeData = createEmptyResumeData();

      const nextWorkspace: ResumeWorkspaceV2 = {
        ...state.workspace,
        source: {
          inputType: action.payload.inputType,
          rawText: action.payload.rawText,
          fileName: action.payload.fileName,
          importedAt: now,
          parsedAt: undefined,
          parser: undefined,
        },
        resumeData: nextResumeData,
        analysis:
          action.payload.clearAnalysis === false
            ? state.workspace.analysis
            : {
                ...state.workspace.analysis,
                resultId: null,
                // A fresh analysis creates a new application; edits must not
                // be saved onto the previous one.
                applicationId: null,
                lastAnalysisResult: null,
                bulletChanges: [],
                ai: {
                  parsed: null,
                  reasoning: null,
                },
              },
      };

      return {
        ...state,
        workspace: withUpdatedTimestamp(nextWorkspace),
      };
    }

    case 'setAnalysisSnapshot': {
      const snapshot = action.payload.snapshot;
      const nextBulletChanges = snapshot ? snapshot.bulletChanges : [];
      // `applyChanges: false` is used when rehydrating an edited application:
      // the saved resumeData already has the changes (and the user's edits on
      // top) baked in, so re-applying would clobber those edits.
      const applyChanges = action.payload.applyChanges !== false;

      const appliedResumeData =
        snapshot && applyChanges
          ? applyBulletChangesToResumeData(state.workspace.resumeData, nextBulletChanges, 'ai', snapshot.skillCategoryRenames)
          : state.workspace.resumeData;

      // Replace the resume title with the analysis target role
      const targetRole = snapshot?.targetRole;
      const updatedResumeData =
        applyChanges && targetRole && snapshot?.status !== 'failed'
          ? {
              ...appliedResumeData,
              basics: {
                ...appliedResumeData.basics,
                title: targetRole,
              },
            }
          : appliedResumeData;

      // Strip [Category] bracket prefix from skill additions so diff-view shows clean text
      const cleanedBulletChanges = nextBulletChanges.map(bc =>
        bc.section?.toLowerCase() === 'skills' && bc.type === 'added' && /^\[[^\]]+\]\s+/.test(bc.improved)
          ? { ...bc, improved: bc.improved.replace(/^\[[^\]]+\]\s+/, '') }
          : bc,
      );

      return {
        ...state,
        workspace: withUpdatedTimestamp({
          ...state.workspace,
          resumeData: updatedResumeData,
          analysis: {
            ...state.workspace.analysis,
            resultId: snapshot?.id || null,
            lastAnalysisResult: snapshot,
            bulletChanges: cleanedBulletChanges,
          },
        }),
      };
    }

    case 'setParsedPayload': {
      const existingSectionOrder = Array.isArray(state.workspace.resumeData.sectionOrder)
        ? state.workspace.resumeData.sectionOrder
        : [];
      const parsedSectionOrder = Array.isArray(action.payload.parsed?.resumeData?.sectionOrder)
        ? action.payload.parsed.resumeData.sectionOrder
        : [];
      const nextSectionOrder = existingSectionOrder.length
        ? [...existingSectionOrder]
        : [...parsedSectionOrder];

      const nextWorkspace: ResumeWorkspaceV2 = {
        ...state.workspace,
        ...(action.payload.parsed
          ? {
              source: action.payload.parsed.source,
              resumeData: {
                ...action.payload.parsed.resumeData,
                sectionOrder: nextSectionOrder,
              },
            }
          : {}),
        analysis: {
          ...state.workspace.analysis,
          ai: {
            ...state.workspace.analysis.ai,
            parsed: action.payload.parsed ? toParsedMeta(action.payload.parsed) : null,
          },
        },
      };

      return {
        ...state,
        workspace: withUpdatedTimestamp(nextWorkspace),
      };
    }

    case 'setApplicationId': {
      if (state.workspace.analysis.applicationId === action.payload.applicationId) {
        return state;
      }
      return {
        ...state,
        workspace: withUpdatedTimestamp({
          ...state.workspace,
          analysis: {
            ...state.workspace.analysis,
            applicationId: action.payload.applicationId,
          },
        }),
      };
    }

    case 'setBulletChanges': {
      return {
        ...state,
        editVersion: state.editVersion + 1,
        workspace: withUpdatedTimestamp({
          ...state.workspace,
          resumeData: applyBulletChangesToResumeData(
            state.workspace.resumeData,
            action.payload.changes,
            'user'
          ),
          analysis: {
            ...state.workspace.analysis,
            bulletChanges: action.payload.changes,
          },
        }),
      };
    }

    case 'setSectionOrder': {
      return {
        ...state,
        editVersion: state.editVersion + 1,
        workspace: withUpdatedTimestamp({
          ...state.workspace,
          resumeData: {
            ...state.workspace.resumeData,
            sectionOrder: Array.isArray(action.payload.sectionOrder)
              ? [...action.payload.sectionOrder]
              : [],
          },
        }),
      };
    }

    case 'applyInlineEdit': {
      const nextResumeData = applyInlineEditToResumeData(
        state.workspace.resumeData,
        action.payload.target,
        action.payload.text
      );
      const nextParsedMeta = applyInlineEditToParsedMeta(
        state.workspace.analysis.ai.parsed,
        action.payload.target,
        action.payload.text
      );

      if (
        nextResumeData === state.workspace.resumeData &&
        nextParsedMeta === state.workspace.analysis.ai.parsed
      ) {
        return state;
      }

      return {
        ...state,
        editVersion: state.editVersion + 1,
        workspace: withUpdatedTimestamp({
          ...state.workspace,
          resumeData: nextResumeData,
          analysis: {
            ...state.workspace.analysis,
            ai: {
              ...state.workspace.analysis.ai,
              parsed: nextParsedMeta,
            },
          },
        }),
      };
    }

    case 'resetWorkspace': {
      return {
        ...state,
        workspace: createEmptyWorkspace(),
      };
    }

    default:
      return state;
  }
}
