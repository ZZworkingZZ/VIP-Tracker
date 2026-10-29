import { createContext } from 'react';
import { TrackerRepository } from '../services/TrackerRepository';
import { TrackerSnapshot, MultiviewOutput, Source, FieldChange } from '../domain/models';
import { MultiviewId, SourceId, OutputId, DestinationId, PipId } from '../domain/identifiers';

export interface TrackerRepositoryContextValue {
  repository: TrackerRepository;
  /** Persisted canonical snapshot loaded from storage/seed */
  snapshot: TrackerSnapshot | null;
  /** Active snapshot for display (draftSnapshot when in Edit Mode, else snapshot) */
  activeSnapshot: TrackerSnapshot | null;
  /** Staged snapshot during Edit Mode */
  draftSnapshot: TrackerSnapshot | null;
  /** Whether the user is currently in Edit Mode */
  isEditMode: boolean;
  /** Whether any differences exist between draftSnapshot and snapshot */
  hasUnsavedChanges: boolean;
  /** Structured list of staged differences */
  stagedChanges: FieldChange[];
  isLoading: boolean;
  isSaving: boolean;
  /** General composite error (saveError ?? loadError) for backward compatibility */
  error: string | null;
  /** Fatal repository load error blocking initial application load */
  loadError: string | null;
  /** Recoverable save/mutation error during active operator editing */
  saveError: string | null;
  /** Dismiss/clear active save error banner */
  clearSaveError: () => void;
  /** Whether the underlying repository is read-only */
  isReadOnly: boolean;
  /** Whether a revision conflict occurred on save */
  isConflict: boolean;
  /** Whether a newer shared revision was detected while operator is in edit mode */
  isNewerSharedDataAvailable: boolean;
  /** GitHub blob SHA of the current tracker file when loaded from remote */
  lastLoadedSha: string | null;
  refresh: () => Promise<void>;
  reloadLatestSharedData: () => Promise<void>;
  enterEditMode: () => void;
  exitEditMode: () => void;
  discardChanges: () => void;
  updateDraftOutput: (output: MultiviewOutput) => void;
  assignDraftPipInput: (
    outputId: OutputId,
    pipId: PipId,
    destinationId: DestinationId | null
  ) => void;
  clearDraftPipInput: (outputId: OutputId, pipId: PipId) => void;
  moveDraftPipInput: (outputId: OutputId, fromPipId: PipId, toPipId: PipId) => void;
  updateDraftDestination: (
    multiviewId: MultiviewId,
    destinationNumber: number,
    sourceId: SourceId | null
  ) => void;
  updateDraftDestinationsBatch: (
    updates: { multiviewId: MultiviewId; destinationNumber: number; sourceId: SourceId | null }[]
  ) => void;
  addDraftSource: (source: Source) => void;
  updateDraftSourceUpstream: (sourceId: SourceId, upstreamSourceId: SourceId | null) => void;
  saveSourceAlias: (sourceId: SourceId, alias: string | null) => Promise<void>;
  addDraftOperationalAssignment: (name: string) => void;
  renameDraftOperationalAssignment: (oldName: string, newName: string) => void;
  removeDraftOperationalAssignment: (name: string) => void;
  saveDraftChanges: () => Promise<void>;
  resetToBaseline: () => Promise<void>;
  saveCustomLayout: (
    layout: import('../domain/layoutDefinitions').LayoutDefinition
  ) => Promise<void>;
  deleteCustomLayout: (layoutId: string) => Promise<void>;
  customLayouts: import('../domain/layoutDefinitions').LayoutDefinition[];
  /** Current active operator for trust-based change attribution */
  currentOperator: import('../domain/operator').Operator | null;
  /** List of recent operators on this machine for fast switching */
  recentOperators: import('../domain/operator').Operator[];
  /** Explicitly set or switch the active operator */
  setOperator: (operator: import('../domain/operator').Operator) => void;
  /** Set or switch operator by display name (generates stable ID and persists) */
  setOperatorByName: (displayName: string) => import('../domain/operator').Operator;
  /** Clear active operator */
  clearOperator: () => void;
  /** Whether the operator selection modal is currently open */
  isOperatorModalOpen: boolean;
  openOperatorModal: () => void;
  closeOperatorModal: () => void;
}

export const TrackerRepositoryContext = createContext<TrackerRepositoryContextValue | undefined>(
  undefined
);
