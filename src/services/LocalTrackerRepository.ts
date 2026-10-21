import { TrackerRepository } from './TrackerRepository';
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
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';

/**
 * In-memory local repository serving the typed bundled baseline seed snapshot.
 */
export class LocalTrackerRepository implements TrackerRepository {
  private snapshot: TrackerSnapshot;

  constructor(initialSnapshot: TrackerSnapshot = INITIAL_SNAPSHOT) {
    // Clone snapshot to prevent accidental external mutation
    this.snapshot = JSON.parse(JSON.stringify(initialSnapshot));
  }

  async getSnapshot(): Promise<TrackerSnapshot> {
    return Promise.resolve(JSON.parse(JSON.stringify(this.snapshot)));
  }

  async getMultiviews(): Promise<Multiview[]> {
    return Promise.resolve([...this.snapshot.multiviews]);
  }

  async getOutputs(): Promise<MultiviewOutput[]> {
    return Promise.resolve([...this.snapshot.outputs]);
  }

  async getDestinations(): Promise<Destination[]> {
    return Promise.resolve([...this.snapshot.destinations]);
  }

  async getSources(): Promise<Source[]> {
    return Promise.resolve([...this.snapshot.sources]);
  }

  async getOperationalAssignments(): Promise<OperationalAssignment[]> {
    return Promise.resolve([...this.snapshot.operationalAssignments]);
  }

  async getChangeHistory(): Promise<ChangeRecord[]> {
    return Promise.resolve([...this.snapshot.changeRecords]);
  }

  async getValidationFindings(): Promise<ValidationFinding[]> {
    return Promise.resolve([...this.snapshot.validationFindings]);
  }
}

export const defaultRepository = new LocalTrackerRepository();
