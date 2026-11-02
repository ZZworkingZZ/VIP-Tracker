import { Destination, Source, TrackerSnapshot } from '../domain/models';
import { SourceId } from '../domain/identifiers';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';

export interface MigrationReportItem {
  legacyId: SourceId;
  legacyName: string;
  canonicalId: SourceId;
  canonicalName: string;
  referencesCount: number;
  matchReason: string;
}

export interface AmbiguousMappingItem {
  legacyId: SourceId;
  legacyName: string;
  candidates: Array<{ id: SourceId; name: string }>;
  referencesCount: number;
  matchReason: string;
}

export interface UnmatchedLegacyItem {
  legacyId: SourceId;
  legacyName: string;
  referencesCount: number;
}

export interface LegacySourceMigrationReport {
  safeMappings: MigrationReportItem[];
  ambiguousMappings: AmbiguousMappingItem[];
  unmatchedRecords: UnmatchedLegacyItem[];
  totalReferencedLegacyRecords: number;
  migratedReferencesCount: number;
}

/**
 * Generates a normalized alphanumeric matching key for domain source names.
 */
export function normalizeSourceMatchKey(rawName: string): string {
  return rawName.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Explicit legacy -> canonical rules for TWD records whose Tx/Rx prefix was swapped relative to the
 * authoritative Source Directory workbook. The match is keyed on the 4-digit number (within the exact
 * range) and the legacy prefix; it is NOT a global Tx/Rx swap and involves no fuzzy matching.
 *   legacy "Tx TWD 9901".."9936" -> canonical "RX TWD 9901".."9936"
 *   legacy "Rx TWD 8801".."8836" -> canonical "TX TWD 8801".."8836"
 * A rule applies only when exactly one persisted legacy record and exactly one canonical record
 * share the number; otherwise the legacy record is reported as ambiguous and is not auto-migrated.
 */
export const TWD_PREFIX_SWAP_RULES: ReadonlyArray<{
  legacyPrefix: 'TX' | 'RX';
  canonicalPrefix: 'TX' | 'RX';
  min: number;
  max: number;
}> = [
  { legacyPrefix: 'TX', canonicalPrefix: 'RX', min: 9901, max: 9936 },
  { legacyPrefix: 'RX', canonicalPrefix: 'TX', min: 8801, max: 8836 },
];

/**
 * Returns the canonical normalized match key for a legacy name covered by a TWD prefix-swap rule,
 * or null when the name is not covered.
 */
export function getTwdPrefixSwapKey(legacyName: string): string | null {
  const m = /^(TX|RX) TWD (\d{4})$/i.exec(legacyName.trim());
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const num = Number(m[2]);
  const rule = TWD_PREFIX_SWAP_RULES.find(
    (r) => r.legacyPrefix === prefix && num >= r.min && num <= r.max
  );
  return rule ? normalizeSourceMatchKey(`${rule.canonicalPrefix} TWD ${m[2]}`) : null;
}

/**
 * Builds a strict, deterministic legacy-to-canonical migration plan.
 * Only exact 1-to-1 normalized matches against authoritative seed sources are classified as safe.
 */
export function buildLegacySourceMigrationPlan(
  persistedSources: readonly Source[],
  seedSources: readonly Source[],
  destinations: readonly Destination[] = []
): {
  legacyToCanonicalMap: Map<SourceId, SourceId>;
  report: LegacySourceMigrationReport;
} {
  const seedMap = new Map<SourceId, Source>(seedSources.map((s) => [s.id, s]));
  const persistedMap = new Map<SourceId, Source>(persistedSources.map((s) => [s.id, s]));

  // Index canonical seed sources by normalized alphanumeric key
  const canonicalByNormalized = new Map<string, Source[]>();
  for (const s of seedSources) {
    const key = normalizeSourceMatchKey(s.name);
    const list = canonicalByNormalized.get(key) ?? [];
    list.push(s);
    canonicalByNormalized.set(key, list);
  }

  // Count references to every source in destinations and upstream sources
  const refCounts = new Map<SourceId, number>();
  for (const d of destinations) {
    if (d.assignedSourceId) {
      refCounts.set(d.assignedSourceId, (refCounts.get(d.assignedSourceId) ?? 0) + 1);
    }
  }
  for (const s of persistedSources) {
    if (s.upstreamSourceId) {
      refCounts.set(s.upstreamSourceId, (refCounts.get(s.upstreamSourceId) ?? 0) + 1);
    }
  }

  // Identify referenced legacy sources not present in the canonical seed catalog
  const legacyReferencedIds = Array.from(refCounts.keys()).filter((id) => !seedMap.has(id));

  const safeMappings: MigrationReportItem[] = [];
  const ambiguousMappings: AmbiguousMappingItem[] = [];
  const unmatchedRecords: UnmatchedLegacyItem[] = [];
  const legacyToCanonicalMap = new Map<SourceId, SourceId>();

  for (const legacyId of legacyReferencedIds) {
    const legacySource = persistedMap.get(legacyId);
    const legacyName = legacySource?.name ?? legacyId;
    const count = refCounts.get(legacyId) ?? 0;
    const swapKey = getTwdPrefixSwapKey(legacyName);
    const normKey = swapKey ?? normalizeSourceMatchKey(legacyName);
    const candidates = canonicalByNormalized.get(normKey) ?? [];
    const swapLegacyPeers = swapKey
      ? persistedSources.filter(
          (p) => !seedMap.has(p.id) && getTwdPrefixSwapKey(p.name) === swapKey
        ).length
      : 1;

    if (swapKey && swapLegacyPeers > 1 && candidates.length > 0) {
      ambiguousMappings.push({
        legacyId,
        legacyName,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
        referencesCount: count,
        matchReason: `Multiple legacy records (${swapLegacyPeers}) map to TWD prefix-swap key ${normKey}`,
      });
    } else if (candidates.length === 1) {
      const canonical = candidates[0];
      safeMappings.push({
        legacyId,
        legacyName,
        canonicalId: canonical.id,
        canonicalName: canonical.name,
        referencesCount: count,
        matchReason: swapKey
          ? `TWD prefix-swap rule: legacy ${legacyName} -> canonical ${canonical.name} (keyed on 4-digit number)`
          : `Unambiguous 1-to-1 normalized alphanumeric match (${normKey}) to canonical Source Directory record`,
      });
      legacyToCanonicalMap.set(legacyId, canonical.id);
    } else if (candidates.length > 1) {
      ambiguousMappings.push({
        legacyId,
        legacyName,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
        referencesCount: count,
        matchReason: `Multiple canonical candidates (${candidates.length}) for normalized key ${normKey}`,
      });
    } else {
      unmatchedRecords.push({
        legacyId,
        legacyName,
        referencesCount: count,
      });
    }
  }

  let migratedReferencesCount = 0;
  for (const d of destinations) {
    if (d.assignedSourceId && legacyToCanonicalMap.has(d.assignedSourceId)) {
      migratedReferencesCount++;
    }
  }
  for (const s of persistedSources) {
    if (s.upstreamSourceId && legacyToCanonicalMap.has(s.upstreamSourceId)) {
      migratedReferencesCount++;
    }
  }

  return {
    legacyToCanonicalMap,
    report: {
      safeMappings,
      ambiguousMappings,
      unmatchedRecords,
      totalReferencedLegacyRecords: legacyReferencedIds.length,
      migratedReferencesCount,
    },
  };
}

/**
 * Reconciles persisted sources against the authoritative seed catalog on seed version bump
 * or when loading / saving snapshots in shared GitHub storage.
 *
 * Automatically migrates unambiguous legacy source references in destinations and sources
 * to their corresponding canonical Source Directory identifiers while preserving routing state.
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
    destinations?: Destination[];
  }
): Source[] {
  const seedMap = new Map<SourceId, Source>(seedSources.map((s) => [s.id, s]));
  const persistedMap = new Map<SourceId, Source>(persistedSources.map((s) => [s.id, s]));

  // 1. Build and apply safe legacy-to-canonical migration plan if destinations are provided
  const { legacyToCanonicalMap } = buildLegacySourceMigrationPlan(
    persistedSources,
    seedSources,
    options?.destinations ?? []
  );

  if (options?.destinations && legacyToCanonicalMap.size > 0) {
    for (const d of options.destinations) {
      if (d.assignedSourceId && legacyToCanonicalMap.has(d.assignedSourceId)) {
        d.assignedSourceId = legacyToCanonicalMap.get(d.assignedSourceId)!;
      }
    }
  }

  // 2. Map canonical IDs back to legacy IDs to transfer user operational edits if any
  const canonicalToLegacyMap = new Map<SourceId, SourceId>();
  for (const [legacyId, canonicalId] of legacyToCanonicalMap.entries()) {
    canonicalToLegacyMap.set(canonicalId, legacyId);
  }

  // 3. Gather all source IDs referenced by destinations or by upstream relationships in persisted state
  const referencedSourceIds = new Set<SourceId>();
  if (options?.destinations) {
    for (const d of options.destinations) {
      if (d.assignedSourceId) referencedSourceIds.add(d.assignedSourceId);
    }
  }
  for (const s of persistedSources) {
    const upstream =
      s.upstreamSourceId && legacyToCanonicalMap.has(s.upstreamSourceId)
        ? legacyToCanonicalMap.get(s.upstreamSourceId)!
        : s.upstreamSourceId;
    if (upstream) referencedSourceIds.add(upstream);
  }

  // 4. Process all seed sources in initial snapshot order
  const result: Source[] = seedSources.map((seed) => {
    const legacyId = canonicalToLegacyMap.get(seed.id);
    const existing =
      persistedMap.get(seed.id) ?? (legacyId ? persistedMap.get(legacyId) : undefined);
    if (!existing) {
      return { ...seed };
    }
    const migratedUpstream =
      existing.upstreamSourceId && legacyToCanonicalMap.has(existing.upstreamSourceId)
        ? legacyToCanonicalMap.get(existing.upstreamSourceId)!
        : (existing.upstreamSourceId ?? null);

    return {
      ...seed,
      alias: existing.alias !== undefined ? existing.alias : (seed.alias ?? null),
      active: existing.active !== undefined ? existing.active : seed.active,
      upstreamSourceId:
        migratedUpstream !== undefined ? migratedUpstream : (seed.upstreamSourceId ?? null),
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

  // 5. Retain any user-created or required legacy sources not present in the seed catalog
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
    // Drop legacy records that were safely migrated to canonical seed sources
    if (legacyToCanonicalMap.has(s.id)) {
      continue;
    }
    if (!seedMap.has(s.id) && isUserOrRequired(s)) {
      const migratedUpstream =
        s.upstreamSourceId && legacyToCanonicalMap.has(s.upstreamSourceId)
          ? legacyToCanonicalMap.get(s.upstreamSourceId)!
          : s.upstreamSourceId;
      result.push({
        ...s,
        upstreamSourceId: migratedUpstream,
      });
    }
  }

  return result;
}

/**
 * Migrates all safe legacy source references across destinations and upstream sources
 * within a full TrackerSnapshot, returning the updated snapshot and audit report.
 */
export function migrateLegacySourceReferences(
  snapshot: TrackerSnapshot,
  seedSources: readonly Source[] = INITIAL_SNAPSHOT.sources
): {
  snapshot: TrackerSnapshot;
  report: LegacySourceMigrationReport;
} {
  const cloned: TrackerSnapshot = JSON.parse(JSON.stringify(snapshot));
  const { report } = buildLegacySourceMigrationPlan(
    cloned.sources,
    seedSources,
    cloned.destinations
  );

  const reconciledSources = reconcilePersistedSources(cloned.sources, seedSources, {
    destinations: cloned.destinations,
  });

  cloned.sources = reconciledSources;

  return {
    snapshot: cloned,
    report,
  };
}
