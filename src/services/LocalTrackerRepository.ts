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
import {
  changeSetToChangeRecords,
  appendHistoryEntries,
  mergeHistoryEntries,
  MAX_HISTORY_ENTRIES,
} from '../domain/diff';
import {
  TrackerStorage,
  defaultStorage,
  TRACKER_SCHEMA_VERSION,
  CURRENT_SOURCE_SEED_VERSION,
} from './storage';
import { SourceId } from '../domain/identifiers';
import {
  LayoutDefinition,
  setCustomLayoutRegistry,
  getLayoutDefinition,
} from '../domain/layoutDefinitions';
import { normalizeOutputPipAssignments } from '../domain/pipRouting';

/**
 * Reconciles persisted sources against the authoritative seed catalog on seed version bump.
 * Stable source IDs are used as the primary match key.
 *
 * For every source in seedSources:
 * - If a matching persisted source exists: retains user-editable / operational fields
 *   (alias, active, upstreamSourceId, inputLabel, outputLabel, attribution), while refreshing
 *   authoritative classification and inventory metadata from seed.
 * - If no persisted source matches: appends the seed source.
 *
 * Retains custom user-created or validly referenced legacy sources not in the seed catalog,
 * while cleanly discarding obsolete unreferenced legacy inventory entries.
 *
 * Idempotent: repeated runs produce identical source lists with stable ordering and IDs.
 */
export function reconcilePersistedSources(
  persistedSources: readonly Source[],
  seedSources: readonly Source[],
  options?: {
    destinations?: readonly Destination[];
  }
): Source[] {
  const seedMap = new Map<SourceId, Source>(seedSources.map((s) => [s.id, s]));
  const persistedMap = new Map<SourceId, Source>(persistedSources.map((s) => [s.id, s]));

  // 1. Gather all source IDs referenced by destinations or by upstream relationships in persisted state
  const referencedSourceIds = new Set<SourceId>();
  if (options?.destinations) {
    for (const d of options.destinations) {
      if (d.assignedSourceId) referencedSourceIds.add(d.assignedSourceId);
    }
  }
  for (const s of persistedSources) {
    if (s.upstreamSourceId) referencedSourceIds.add(s.upstreamSourceId);
  }

  // 2. Process all seed sources in initial snapshot order
  const result: Source[] = seedSources.map((seed) => {
    const existing = persistedMap.get(seed.id);
    if (!existing) {
      return { ...seed };
    }
    return {
      ...seed,
      alias: existing.alias !== undefined ? existing.alias : (seed.alias ?? null),
      active: existing.active !== undefined ? existing.active : seed.active,
      upstreamSourceId:
        existing.upstreamSourceId !== undefined
          ? existing.upstreamSourceId
          : (seed.upstreamSourceId ?? null),
      inputLabel:
        existing.inputLabel !== undefined ? existing.inputLabel : (seed.inputLabel ?? null),
      outputLabel:
        existing.outputLabel !== undefined ? existing.outputLabel : (seed.outputLabel ?? null),
      updatedAt: existing.updatedAt !== undefined ? existing.updatedAt : (seed.updatedAt ?? null),
      updatedBy: existing.updatedBy !== undefined ? existing.updatedBy : (seed.updatedBy ?? null),
      operatorId:
        existing.operatorId !== undefined ? existing.operatorId : (seed.operatorId ?? null),
    };
  });

  // 3. Retain any user-created or required legacy sources not present in the seed catalog
  const isUserOrRequired = (s: Source): boolean => {
    if (referencedSourceIds.has(s.id)) return true;
    if (s.alias != null && s.alias.trim() !== '') return true;
    if (s.upstreamSourceId != null) return true;
    if (s.updatedAt != null || s.updatedBy != null || s.operatorId != null) return true;
    if (s.inputLabel != null && s.inputLabel.trim() !== '') return true;
    if (s.outputLabel != null && s.outputLabel.trim() !== '') return true;
    return false;
  };

  for (const s of persistedSources) {
    if (!seedMap.has(s.id) && isUserOrRequired(s)) {
      result.push({ ...s });
    }
  }

  return result;
}

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

      // Migrate or bootstrap persisted sources if unversioned or prior to current seed version
      if (
        storedData.sourceSeedVersion === undefined ||
        storedData.sourceSeedVersion < CURRENT_SOURCE_SEED_VERSION
      ) {
        sources = reconcilePersistedSources(
          storedData.sources ?? [],
          this.initialSnapshot.sources,
          { destinations: storedData.destinations }
        );
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
        ...(this.initialSnapshot.metadata ? { metadata: this.initialSnapshot.metadata } : {}),
        multiviews: JSON.parse(JSON.stringify(this.initialSnapshot.multiviews)),
        outputs: normalizedOutputs,
        destinations: storedData.destinations,
        sources,
        operationalAssignments: storedData.operationalAssignments,
        changeRecords: storedData.changeRecords ?? [],
        validationFindings: findings,
        generatedAt: storedData.savedAt,
        customLayouts,
        history: mergeHistoryEntries(storedData.history ?? [], []),
        ...(storedData.signalFlowLocks ? { signalFlowLocks: storedData.signalFlowLocks } : {}),
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
          history: mergeHistoryEntries(storedData.history ?? [], []),
          ...(storedData.signalFlowLocks ? { signalFlowLocks: storedData.signalFlowLocks } : {}),
        });
      }
    } else {
      this.snapshot = JSON.parse(JSON.stringify(initialSnapshot));
      this.snapshot.operationalAssignments = this.snapshot.operationalAssignments ?? [];
      this.snapshot.history = mergeHistoryEntries(this.snapshot.history ?? [], []);
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

    // Operational/production assignment names are reusable across multiple MultiviewOutputs.
    // Deduplicate operational assignments by canonical ID so label reuse across outputs never creates duplicate assignment entities.
    const seenAssignmentIds = new Set<string>();
    cloned.operationalAssignments = (cloned.operationalAssignments ?? []).filter((a) => {
      if (!a || !a.id || seenAssignmentIds.has(a.id)) {
        return false;
      }
      seenAssignmentIds.add(a.id);
      return true;
    });

    if (changeSet && changeSet.changes.length > 0) {
      const newRecords = changeSetToChangeRecords(changeSet, operator);
      cloned.changeRecords = [...(cloned.changeRecords ?? []), ...newRecords];
      cloned.history = appendHistoryEntries(
        mergeHistoryEntries(this.snapshot.history, cloned.history),
        changeSet,
        operator,
        MAX_HISTORY_ENTRIES,
        this.snapshot,
        cloned
      );

      // Update attribution metadata for entities affected by this save
      if (operator) {
        const affectedOutputIds = new Set<string>();
        const affectedDestinationIds = new Set<string>();
        const affectedSourceIds = new Set<string>();

        for (const change of changeSet.changes) {
          if (change.entityType === 'output') {
            affectedOutputIds.add(change.entityId);
          } else if (change.entityType === 'destination') {
            affectedDestinationIds.add(change.entityId);
          } else if (change.entityType === 'source') {
            affectedSourceIds.add(change.entityId);
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

        if (affectedSourceIds.size > 0) {
          cloned.sources = cloned.sources.map((src) => {
            if (affectedSourceIds.has(src.id)) {
              return {
                ...src,
                updatedAt: changeSet.timestamp,
                updatedBy: operator.displayName,
                operatorId: operator.id,
              };
            }
            return src;
          });
        }
      }
    }

    if (!changeSet || changeSet.changes.length === 0) {
      cloned.history = mergeHistoryEntries(this.snapshot.history, cloned.history);
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
      history: this.snapshot.history,
      customLayouts,
      ...(this.snapshot.signalFlowLocks ? { signalFlowLocks: this.snapshot.signalFlowLocks } : {}),
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
