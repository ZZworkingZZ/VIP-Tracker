import { Destination, Source } from '../domain/models';
import { SourceId } from '../domain/identifiers';

/**
 * Reconciles persisted sources against the authoritative seed catalog on seed version bump
 * or when loading / saving snapshots in shared GitHub storage.
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
