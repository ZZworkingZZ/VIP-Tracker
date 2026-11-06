import type { Destination, Source, TrackerSnapshot } from './models';
import { getSourceAlias } from './models';
import type { DestinationId, MultiviewId, OutputId, PipId, SourceId } from './identifiers';
import { formatDestinationDisplay } from './identifiers';
import { matchesSourceQuery, normalizeSourceSearch } from './sourceSearch';
import {
  applyPipLawoChainUpdate,
  decomposeTielineUpstream,
  resolveAllPipSignalFlows,
} from './signalFlow';

/**
 * "All Signal Flows" = every tracked tieline -> Lawo source path in the tracker data.
 * This is derived from persisted tracker records only (Source.upstreamSourceId chains);
 * it is NOT live discovery of router, SDVN, VSM or Lawo state.
 *
 * MV input assignment (Destination.assignedSourceId) and PIP visibility (a PIP in an active output
 * pointing at that MV input) are deliberately kept as separate facts.
 */

export type FlowUsageState =
  /** At least one PIP on an active output uses an MV input assigned to this tieline. */
  | 'pip-visible'
  /** Assigned to an MV input, but no PIP currently uses that MV input. */
  | 'mv-input-unused'
  /** Not assigned to any MV input. */
  | 'no-mv-input';

export type FlowUsageFilter = 'ALL' | FlowUsageState | 'unresolved';

export type FlowSortKey = 'tieline' | 'source' | 'usage';
export type FlowSortDirection = 'asc' | 'desc';

export interface FlowMvInputUse {
  readonly destinationId: DestinationId;
  readonly multiviewId: MultiviewId;
  readonly label: string; // e.g. "MV-01-12"
}

export interface FlowPipUse {
  readonly flowKey: string;
  readonly outputId: OutputId;
  readonly pipId: PipId;
  readonly destinationId: DestinationId;
  readonly label: string; // e.g. "MV-04-05 PIP-01"
}

export interface TielineFlowRow {
  readonly tielineId: SourceId;
  readonly tieline: Source;
  readonly tielineAlias: string | null;
  readonly lawoSource: Source | null;
  readonly lawoSourceAlias: string | null;
  readonly processingStages: readonly Source[];
  readonly mvInputs: readonly FlowMvInputUse[];
  readonly pipUses: readonly FlowPipUse[];
  readonly usageState: FlowUsageState;
  readonly isUnresolved: boolean;
  readonly unresolvedReasons: readonly string[];
  /**
   * Other tielines whose upstream chain includes this tieline's first processing stage.
   * Changing this row's Lawo source rewrites that stage's upstream, so these would be rerouted too.
   * Empty when the tieline has no processing stages.
   */
  readonly affectedOtherTielines: readonly Source[];
  /** Stages in this tieline's chain that at least one other tieline also uses. */
  readonly sharedProcessingStages: readonly Source[];
}

export function isTrackedTieline(source: Source): boolean {
  if (source.active === false) return false;
  return (
    source.routeRole === 'tieline' ||
    source.inventoryCategory === 'lawo-destination/tieline' ||
    (source.inventoryCategories?.includes('lawo-destination/tieline') ?? false)
  );
}

/** Natural ("vTie 2" < "vTie 10" < "vTie 107"), case-insensitive comparison. */
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function naturalCompare(a: string, b: string): number {
  return naturalCollator.compare(a, b);
}

function mvIdOf(destination: Destination): MultiviewId {
  return destination.multiviewId;
}

export function resolveAllTielineFlows(snapshot: TrackerSnapshot): TielineFlowRow[] {
  const sourceMap = new Map<SourceId, Source>(snapshot.sources.map((s) => [s.id, s]));
  const tielines = snapshot.sources.filter(isTrackedTieline);

  const destinationsByTieline = new Map<SourceId, Destination[]>();
  for (const d of snapshot.destinations) {
    if (!d.assignedSourceId) continue;
    const list = destinationsByTieline.get(d.assignedSourceId) ?? [];
    list.push(d);
    destinationsByTieline.set(d.assignedSourceId, list);
  }

  // PIP visibility uses the exact same definition as the MV-focused view.
  const pipUsesByDestination = new Map<DestinationId, FlowPipUse[]>();
  for (const flow of resolveAllPipSignalFlows(snapshot)) {
    if (!flow.destinationId) continue;
    const list = pipUsesByDestination.get(flow.destinationId) ?? [];
    list.push({
      flowKey: flow.flowKey,
      outputId: flow.outputId,
      pipId: flow.pipId,
      destinationId: flow.destinationId,
      label: flow.pipDisplayLabel,
    });
    pipUsesByDestination.set(flow.destinationId, list);
  }

  const decomposed = new Map<SourceId, ReturnType<typeof decomposeTielineUpstream>>();
  for (const t of tielines) decomposed.set(t.id, decomposeTielineUpstream(t, sourceMap));

  // stage id -> tielines whose chain includes it
  const tielinesByStage = new Map<SourceId, Set<SourceId>>();
  for (const t of tielines) {
    for (const stage of decomposed.get(t.id)!.processingStages) {
      const set = tielinesByStage.get(stage.id) ?? new Set<SourceId>();
      set.add(t.id);
      tielinesByStage.set(stage.id, set);
    }
  }

  return tielines.map((tieline): TielineFlowRow => {
    const { lawoSource, processingStages, upstreamFlow } = decomposed.get(tieline.id)!;

    const dests = destinationsByTieline.get(tieline.id) ?? [];
    const mvInputs: FlowMvInputUse[] = dests.map((d) => ({
      destinationId: d.id,
      multiviewId: mvIdOf(d),
      label: formatDestinationDisplay(d.id),
    }));
    const pipUses = dests.flatMap((d) => pipUsesByDestination.get(d.id) ?? []);

    const usageState: FlowUsageState =
      pipUses.length > 0 ? 'pip-visible' : mvInputs.length > 0 ? 'mv-input-unused' : 'no-mv-input';

    const reasons: string[] = [];
    if (!lawoSource) reasons.push('No Lawo source assigned');
    if (upstreamFlow.hasCycle) reasons.push('Circular upstream routing');
    if (upstreamFlow.isDangling) reasons.push('Upstream source not found');
    if (upstreamFlow.maxDepthExceeded) reasons.push('Upstream chain too deep');

    const firstStage = processingStages[0];
    const affected = firstStage
      ? Array.from(tielinesByStage.get(firstStage.id) ?? [])
          .filter((id) => id !== tieline.id)
          .map((id) => sourceMap.get(id))
          .filter((s): s is Source => Boolean(s))
          .sort((a, b) => naturalCompare(a.name, b.name))
      : [];

    const sharedProcessingStages = processingStages.filter(
      (st) => (tielinesByStage.get(st.id)?.size ?? 0) > 1
    );

    return {
      tielineId: tieline.id,
      tieline,
      tielineAlias: getSourceAlias(tieline),
      lawoSource,
      lawoSourceAlias: getSourceAlias(lawoSource),
      processingStages,
      mvInputs,
      pipUses,
      usageState,
      isUnresolved: reasons.length > 0,
      unresolvedReasons: reasons,
      affectedOtherTielines: affected,
      sharedProcessingStages,
    };
  });
}

export function filterTielineFlows(
  rows: readonly TielineFlowRow[],
  options: { query?: string; usage?: FlowUsageFilter }
): TielineFlowRow[] {
  const query = (options.query ?? '').trim();
  const qNorm = normalizeSourceSearch(query);
  const usage = options.usage ?? 'ALL';

  return rows.filter((row) => {
    if (usage === 'unresolved') {
      if (!row.isUnresolved) return false;
    } else if (usage !== 'ALL' && row.usageState !== usage) {
      return false;
    }
    if (!query) return true;
    if (matchesSourceQuery(row.tieline, query)) return true;
    if (row.lawoSource && matchesSourceQuery(row.lawoSource, query)) return true;
    return row.mvInputs.some(
      (m) =>
        m.label.toLowerCase().includes(query.toLowerCase()) ||
        (qNorm && normalizeSourceSearch(m.label).includes(qNorm))
    );
  });
}

const USAGE_RANK: Record<FlowUsageState, number> = {
  'pip-visible': 0,
  'mv-input-unused': 1,
  'no-mv-input': 2,
};

export function sortTielineFlows(
  rows: readonly TielineFlowRow[],
  key: FlowSortKey = 'tieline',
  direction: FlowSortDirection = 'asc'
): TielineFlowRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let result = 0;
    if (key === 'source') {
      // Blank Lawo sources always sort last.
      const an = a.lawoSource?.name ?? null;
      const bn = b.lawoSource?.name ?? null;
      if (an === null && bn === null) result = 0;
      else if (an === null) return 1;
      else if (bn === null) return -1;
      else result = sign * naturalCompare(an, bn);
    } else if (key === 'usage') {
      result = sign * (USAGE_RANK[a.usageState] - USAGE_RANK[b.usageState]);
    } else {
      result = sign * naturalCompare(a.tieline.name, b.tieline.name);
    }
    // Stable operational tiebreak
    return result !== 0 ? result : naturalCompare(a.tieline.name, b.tieline.name);
  });
}

/**
 * Changes only the Lawo source feeding a tracked tieline, preserving its processing stages.
 * Validates references first and throws (without mutating) on an unknown tieline or source.
 * Reuses applyPipLawoChainUpdate, which only rewrites Source.upstreamSourceId (plus attribution);
 * outputs, destinations, PIP assignments, layouts and locks are untouched.
 */
export function applyTielineLawoSourceChange(
  snapshot: TrackerSnapshot,
  tielineId: SourceId,
  newLawoSourceId: SourceId | null,
  operator?: { id: string; displayName: string } | null,
  timestamp?: string
): TrackerSnapshot {
  const sourceMap = new Map<SourceId, Source>(snapshot.sources.map((s) => [s.id, s]));
  const tieline = sourceMap.get(tielineId);
  if (!tieline || !isTrackedTieline(tieline)) {
    throw new Error(`Cannot change route: tieline ${tielineId} was not found.`);
  }
  if (newLawoSourceId !== null && !sourceMap.has(newLawoSourceId)) {
    throw new Error(`Cannot change route: source ${newLawoSourceId} was not found.`);
  }
  const { processingStages } = decomposeTielineUpstream(tieline, sourceMap);
  return applyPipLawoChainUpdate(
    snapshot,
    tielineId,
    newLawoSourceId,
    processingStages.map((s) => s.id),
    operator,
    timestamp
  );
}
