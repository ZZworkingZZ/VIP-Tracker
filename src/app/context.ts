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
  error: string | null;
  refresh: () => Promise<void>;
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
  saveDraftChanges: () => Promise<void>;
  resetToBaseline: () => Promise<void>;
  saveCustomLayout: (
    layout: import('../domain/layoutDefinitions').LayoutDefinition
  ) => Promise<void>;
  deleteCustomLayout: (layoutId: string) => Promise<void>;
  customLayouts: import('../domain/layoutDefinitions').LayoutDefinition[];
}

export const TrackerRepositoryContext = createContext<TrackerRepositoryContextValue | undefined>(
  undefined
);
