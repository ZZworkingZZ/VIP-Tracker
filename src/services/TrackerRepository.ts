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
    changeSet?: import('../domain/models').ChangeSet
  ): Promise<TrackerSnapshot>;
  resetToBaseline(): Promise<TrackerSnapshot>;
}
