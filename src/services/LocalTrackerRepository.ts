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
  ChangeSet,
} from '../domain/models';
import { Operator } from '../domain/operator';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { validateSnapshot } from '../domain/validation';
import { changeSetToChangeRecords } from '../domain/diff';
import {
  TrackerStorage,
  defaultStorage,
  TRACKER_SCHEMA_VERSION,
  CURRENT_SOURCE_SEED_VERSION,
} from './storage';
import {
  LayoutDefinition,
  setCustomLayoutRegistry,
  getLayoutDefinition,
} from '../domain/layoutDefinitions';
import { normalizeOutputPipAssignments } from '../domain/pipRouting';

/**
 * Local repository serving the typed baseline seed snapshot with browser persistence support.
 */
export class LocalTrackerRepository implements TrackerRepository {
  private initialSnapshot: TrackerSnapshot;
  private snapshot: TrackerSnapshot;
  private storage: TrackerStorage;

  constructor(
    initialSnapshot: TrackerSnapshot = INITIAL_SNAPSHOT,
    storage: TrackerStorage = defaultStorage
  ) {
    this.initialSnapshot = JSON.parse(JSON.stringify(initialSnapshot));
    this.storage = storage;

    const storedData = this.storage.load();
    if (storedData) {
      let sources = storedData.sources;
      let shouldPersistBootstrap = false;

      // Existing installation that predates authoritative source catalog seeding
      if (
        storedData.sourceSeedVersion === undefined ||
        storedData.sourceSeedVersion < CURRENT_SOURCE_SEED_VERSION
      ) {
        sources = JSON.parse(JSON.stringify(this.initialSnapshot.sources));
        storedData.sourceSeedVersion = CURRENT_SOURCE_SEED_VERSION;
        storedData.sources = sources;
        shouldPersistBootstrap = true;
      }

      const customLayouts = storedData.customLayouts ?? [];
      setCustomLayoutRegistry(customLayouts);

      // Normalize output PIP assignments safely without data fabrication
      const normalizedOutputs = storedData.outputs.map((out) => {
        if (out.pipAssignments) return out;
        const layout = getLayoutDefinition(out.layoutName, customLayouts);
        return {
          ...out,
          pipAssignments: normalizeOutputPipAssignments(out, layout),
        };
      });

      const findings = validateSnapshot(
        this.initialSnapshot.multiviews,
        normalizedOutputs,
        storedData.destinations,
        sources
      );

      this.snapshot = {
        multiviews: JSON.parse(JSON.stringify(this.initialSnapshot.multiviews)),
        outputs: normalizedOutputs,
        destinations: storedData.destinations,
        sources,
        operationalAssignments: storedData.operationalAssignments,
        changeRecords: storedData.changeRecords ?? [],
        validationFindings: findings,
        generatedAt: storedData.savedAt,
        customLayouts,
      };

      if (shouldPersistBootstrap) {
        this.storage.save({
          schemaVersion: storedData.schemaVersion ?? TRACKER_SCHEMA_VERSION,
          sourceSeedVersion: CURRENT_SOURCE_SEED_VERSION,
          outputs: this.snapshot.outputs,
          destinations: storedData.destinations,
          sources: storedData.sources,
          operationalAssignments: storedData.operationalAssignments,
          changeRecords: storedData.changeRecords ?? [],
          savedAt: storedData.savedAt,
          customLayouts,
        });
      }
    } else {
      this.snapshot = JSON.parse(JSON.stringify(initialSnapshot));
      const customLayouts = this.snapshot.customLayouts ?? [];
      setCustomLayoutRegistry(customLayouts);

      this.snapshot.outputs = this.snapshot.outputs.map((out) => {
        if (out.pipAssignments) return out;
        const layout = getLayoutDefinition(out.layoutName, customLayouts);
        return {
          ...out,
          pipAssignments: normalizeOutputPipAssignments(out, layout),
        };
      });
    }
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

  async saveSnapshot(
    updatedSnapshot: TrackerSnapshot,
    changeSet?: ChangeSet,
    operator?: Operator | null
  ): Promise<TrackerSnapshot> {
    const cloned: TrackerSnapshot = JSON.parse(JSON.stringify(updatedSnapshot));

    if (changeSet && changeSet.changes.length > 0) {
      const newRecords = changeSetToChangeRecords(changeSet, operator);
      cloned.changeRecords = [...(cloned.changeRecords ?? []), ...newRecords];

      // Update attribution metadata for entities affected by this save
      if (operator) {
        const affectedOutputIds = new Set<string>();
        const affectedDestinationIds = new Set<string>();

        for (const change of changeSet.changes) {
          if (change.entityType === 'output') {
            affectedOutputIds.add(change.entityId);
          } else if (change.entityType === 'destination') {
            affectedDestinationIds.add(change.entityId);
          }
        }

        if (affectedOutputIds.size > 0) {
          cloned.outputs = cloned.outputs.map((out) => {
            if (affectedOutputIds.has(out.id)) {
              return {
                ...out,
                updatedAt: changeSet.timestamp,
                updatedBy: operator.displayName,
                operatorId: operator.id,
              };
            }
            return out;
          });
        }

        if (affectedDestinationIds.size > 0) {
          cloned.destinations = cloned.destinations.map((dest) => {
            if (affectedDestinationIds.has(dest.id)) {
              return {
                ...dest,
                updatedAt: changeSet.timestamp,
                updatedBy: operator.displayName,
                operatorId: operator.id,
              };
            }
            return dest;
          });
        }
      }
    }

    // Re-run pure domain validation
    cloned.validationFindings = validateSnapshot(
      cloned.multiviews,
      cloned.outputs,
      cloned.destinations,
      cloned.sources
    );

    cloned.generatedAt = new Date().toISOString();
    this.snapshot = cloned;

    const customLayouts = this.snapshot.customLayouts ?? [];
    setCustomLayoutRegistry(customLayouts);

    // Persist to storage
    this.storage.save({
      schemaVersion: TRACKER_SCHEMA_VERSION,
      sourceSeedVersion: CURRENT_SOURCE_SEED_VERSION,
      outputs: this.snapshot.outputs,
      destinations: this.snapshot.destinations,
      sources: this.snapshot.sources,
      operationalAssignments: this.snapshot.operationalAssignments,
      changeRecords: this.snapshot.changeRecords,
      savedAt: this.snapshot.generatedAt,
      customLayouts,
    });

    return Promise.resolve(JSON.parse(JSON.stringify(this.snapshot)));
  }

  async saveCustomLayout(layout: LayoutDefinition): Promise<TrackerSnapshot> {
    const current = [...(this.snapshot.customLayouts ?? [])];
    const idx = current.findIndex(
      (l) => l.id === layout.id || l.name.toUpperCase() === layout.name.toUpperCase()
    );
    if (idx >= 0) {
      current[idx] = layout;
    } else {
      current.push(layout);
    }
    const nextSnapshot: TrackerSnapshot = {
      ...this.snapshot,
      customLayouts: current,
    };
    return this.saveSnapshot(nextSnapshot);
  }

  async deleteCustomLayout(layoutId: string): Promise<TrackerSnapshot> {
    const current = (this.snapshot.customLayouts ?? []).filter((l) => l.id !== layoutId);
    const nextSnapshot: TrackerSnapshot = {
      ...this.snapshot,
      customLayouts: current,
    };
    return this.saveSnapshot(nextSnapshot);
  }

  async resetToBaseline(): Promise<TrackerSnapshot> {
    this.storage.clear();
    this.snapshot = JSON.parse(JSON.stringify(this.initialSnapshot));
    setCustomLayoutRegistry([]);
    this.snapshot.outputs = this.snapshot.outputs.map((out) => {
      const layout = getLayoutDefinition(out.layoutName);
      return {
        ...out,
        pipAssignments: normalizeOutputPipAssignments(out, layout),
      };
    });
    this.snapshot.validationFindings = validateSnapshot(
      this.snapshot.multiviews,
      this.snapshot.outputs,
      this.snapshot.destinations,
      this.snapshot.sources
    );
    this.snapshot.generatedAt = new Date().toISOString();
    return Promise.resolve(JSON.parse(JSON.stringify(this.snapshot)));
  }
}

export const defaultRepository = new LocalTrackerRepository();
