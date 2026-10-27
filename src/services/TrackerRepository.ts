import {
  Multiview,
  MultiviewOutput,
  Destination,
  Source,
  OperationalAssignment,
  ChangeRecord,
  ValidationFinding,
  TrackerSnapshot,
} from '../domain/models';

/**
 * Asynchronous repository interface for VIP Tracker data access.
 * Decouples the UI layer from local seed data or future REST/GraphQL APIs.
 */
export interface TrackerRepository {
  getSnapshot(): Promise<TrackerSnapshot>;
  getMultiviews(): Promise<Multiview[]>;
  getOutputs(): Promise<MultiviewOutput[]>;
  getDestinations(): Promise<Destination[]>;
  getSources(): Promise<Source[]>;
  getOperationalAssignments(): Promise<OperationalAssignment[]>;
  getChangeHistory(): Promise<ChangeRecord[]>;
  getValidationFindings(): Promise<ValidationFinding[]>;
  saveSnapshot(
    snapshot: TrackerSnapshot,
    changeSet?: import('../domain/models').ChangeSet,
    operator?: import('../domain/operator').Operator | null
  ): Promise<TrackerSnapshot>;
  resetToBaseline(): Promise<TrackerSnapshot>;
  saveCustomLayout?(
    layout: import('../domain/layoutDefinitions').LayoutDefinition
  ): Promise<TrackerSnapshot>;
  deleteCustomLayout?(layoutId: string): Promise<TrackerSnapshot>;
  readonly isReadOnly?: boolean;
  getLastLoadedSha?(): string | null;
  refreshSnapshot?(): Promise<TrackerSnapshot>;
  checkForRemoteUpdate?(): Promise<{
    hasUpdate: boolean;
    sha: string;
    snapshot: TrackerSnapshot;
  }>;
  applyLoadedSnapshot?(snapshot: TrackerSnapshot, sha: string): void;
}
