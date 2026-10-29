import {
  SourceId,
  DestinationId,
  OutputId,
  PipId,
  MultiviewId,
  formatOutputDisplay,
  formatInputDisplay,
  formatDestinationDisplay,
} from './identifiers';
import {
  Source,
  Destination,
  MultiviewOutput,
  TrackerSnapshot,
  SignalFlowLock,
  LawoDeviceType,
  LawoVendor,
  LAWO_DEVICE_TYPES,
  LAWO_VENDORS,
  getSourceAlias,
  formatSourceCompact,
} from './models';
import { LayoutDefinition, getLayoutDefinition, getLayoutPips } from './layoutDefinitions';
import { normalizeOutputPipAssignments, assignPipInput } from './pipRouting';
import { ChangeAttribution } from './attribution';

export const DEFAULT_MAX_SIGNAL_FLOW_DEPTH = 10;

export type SignalFlowStatus =
  'unassigned' | 'resolved' | 'self_route' | 'circular' | 'dangling' | 'max_depth_exceeded';

export interface ResolvedSignalFlow {
  immediateSourceId: SourceId | null;
  status: SignalFlowStatus;
  hops: Source[]; // In ORIGIN-TO-IMMEDIATE order!
  originSource: Source | null;
  immediateSource: Source | null;
  hasCycle: boolean;
  isSelfRoute: boolean;
  isDangling: boolean;
  maxDepthExceeded: boolean;
  danglingSourceId: SourceId | null;
  cycleSourceIds: SourceId[];
}

/**
 * Pure, iterative signal-flow resolver.
 * Follows upstream source relationships from an immediate source upstream to its origin.
 * Returns hops in ORIGIN-TO-IMMEDIATE order (e.g. BSP-K1-301 → UDX-03 → vCam-02).
 * Detects self-routes, indirect cycles, dangling references, and max-depth termination.
 * Never throws or hangs on malformed graph data.
 */
export function resolveSignalFlow(
  immediateSourceId: SourceId | null,
  sources: readonly Source[] | Map<SourceId, Source>,
  options?: { maxDepth?: number }
): ResolvedSignalFlow {
  if (!immediateSourceId) {
    return {
      immediateSourceId: null,
      status: 'unassigned',
      hops: [],
      originSource: null,
      immediateSource: null,
      hasCycle: false,
      isSelfRoute: false,
      isDangling: false,
      maxDepthExceeded: false,
      danglingSourceId: null,
      cycleSourceIds: [],
    };
  }

  const sourceMap =
    sources instanceof Map ? sources : new Map<SourceId, Source>(sources.map((s) => [s.id, s]));

  const rootSource = sourceMap.get(immediateSourceId);
  if (!rootSource) {
    return {
      immediateSourceId,
      status: 'dangling',
      hops: [],
      originSource: null,
      immediateSource: null,
      hasCycle: false,
      isSelfRoute: false,
      isDangling: true,
      maxDepthExceeded: false,
      danglingSourceId: immediateSourceId,
      cycleSourceIds: [],
    };
  }

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_SIGNAL_FLOW_DEPTH;
  const traversed: Source[] = [];
  const visitedIds = new Set<SourceId>();
  let currentSource: Source = rootSource;

  while (true) {
    traversed.push(currentSource);
    visitedIds.add(currentSource.id);

    const upstreamId = currentSource.upstreamSourceId;

    // 1. Origin reached (null or empty upstream)
    if (!upstreamId) {
      break;
    }

    // 2. Direct self-route check
    if (upstreamId === currentSource.id) {
      const hops = [...traversed].reverse();
      return {
        immediateSourceId,
        status: 'self_route',
        hops,
        originSource: hops[0] ?? null,
        immediateSource: hops[hops.length - 1] ?? null,
        hasCycle: true,
        isSelfRoute: true,
        isDangling: false,
        maxDepthExceeded: false,
        danglingSourceId: null,
        cycleSourceIds: [currentSource.id],
      };
    }

    // 3. Indirect cycle check
    if (visitedIds.has(upstreamId)) {
      const cycleStartIndex = traversed.findIndex((s) => s.id === upstreamId);
      const cycleSourceIds =
        cycleStartIndex >= 0 ? traversed.slice(cycleStartIndex).map((s) => s.id) : [upstreamId];
      const hops = [...traversed].reverse();
      return {
        immediateSourceId,
        status: 'circular',
        hops,
        originSource: hops[0] ?? null,
        immediateSource: hops[hops.length - 1] ?? null,
        hasCycle: true,
        isSelfRoute: false,
        isDangling: false,
        maxDepthExceeded: false,
        danglingSourceId: null,
        cycleSourceIds,
      };
    }

    // 4. Max depth check
    if (traversed.length >= maxDepth) {
      const hops = [...traversed].reverse();
      return {
        immediateSourceId,
        status: 'max_depth_exceeded',
        hops,
        originSource: hops[0] ?? null,
        immediateSource: hops[hops.length - 1] ?? null,
        hasCycle: false,
        isSelfRoute: false,
        isDangling: false,
        maxDepthExceeded: true,
        danglingSourceId: null,
        cycleSourceIds: [],
      };
    }

    // 5. Look up next upstream source in directory
    const nextSource = sourceMap.get(upstreamId);
    if (!nextSource) {
      const hops = [...traversed].reverse();
      return {
        immediateSourceId,
        status: 'dangling',
        hops,
        originSource: hops[0] ?? null,
        immediateSource: hops[hops.length - 1] ?? null,
        hasCycle: false,
        isSelfRoute: false,
        isDangling: true,
        maxDepthExceeded: false,
        danglingSourceId: upstreamId,
        cycleSourceIds: [],
      };
    }

    currentSource = nextSource;
  }

  const hops = [...traversed].reverse();
  return {
    immediateSourceId,
    status: 'resolved',
    hops,
    originSource: hops[0] ?? null,
    immediateSource: hops[hops.length - 1] ?? null,
    hasCycle: false,
    isSelfRoute: false,
    isDangling: false,
    maxDepthExceeded: false,
    danglingSourceId: null,
    cycleSourceIds: [],
  };
}

/**
 * Formats a resolved signal flow chain into an operator-friendly arrow representation.
 * Example: "BSP-K1-301 → UDX-03 → vCam-02"
 */
export function formatSignalFlowChain(flow: ResolvedSignalFlow): string {
  if (flow.hops.length === 0) return '';
  return flow.hops.map((h) => formatSourceCompact(h)).join(' → ');
}

/**
 * Evaluates the resulting signal flow if targetSourceId has its upstream assigned to proposedUpstreamSourceId.
 * Creates an in-memory shadow graph without mutating the original source objects or repository.
 */
export function previewUpstreamSignalFlow(
  targetSourceId: SourceId,
  proposedUpstreamSourceId: SourceId | null,
  sources: readonly Source[] | Map<SourceId, Source>,
  options?: { maxDepth?: number }
): ResolvedSignalFlow {
  const sourceList = sources instanceof Map ? Array.from(sources.values()) : sources;
  const shadowMap = new Map<SourceId, Source>(
    sourceList.map((s) => [
      s.id,
      s.id === targetSourceId ? { ...s, upstreamSourceId: proposedUpstreamSourceId } : s,
    ])
  );

  return resolveSignalFlow(targetSourceId, shadowMap, options);
}

/**
 * Formats cycleSourceIds into a readable cycle loop string.
 * Example: ['SRC:vCam-01', 'SRC:vTie-101'] -> "vCam-01 → vTie-101 → vCam-01"
 */
export function formatCyclePath(
  cycleSourceIds: SourceId[],
  sources: readonly Source[] | Map<SourceId, Source>
): string {
  if (cycleSourceIds.length === 0) return '';
  const sourceMap =
    sources instanceof Map ? sources : new Map<SourceId, Source>(sources.map((s) => [s.id, s]));

  const names = cycleSourceIds.map((id) => sourceMap.get(id)?.name ?? id);
  // Complete the loop by appending the start node
  return [...names, names[0]].join(' → ');
}

/* ============================================================================
   SIGNAL FLOW DIRECTORY CLASSIFICATION & STAGE OPTIONS
   ============================================================================ */

const PROCESSING_DEVICE_TYPES = new Set<LawoDeviceType>([
  'UDX',
  'FS',
  'Color Corrector',
  'Decap/Encap',
  'Decode/Encode',
  'Transcode',
]);

/**
 * Conservatively infers a LawoDeviceType from a Source record if not explicitly set.
 */
export function inferLawoDeviceType(source: Source): LawoDeviceType | null {
  if (source.deviceType && LAWO_DEVICE_TYPES.includes(source.deviceType)) {
    return source.deviceType;
  }
  const upper = source.name.trim().toUpperCase();
  if (/^UDX\b/.test(upper)) return 'UDX';
  if (/^FS\b|FRAME\s*SYNC/.test(upper)) return 'FS';
  if (/^BSP\b/.test(upper)) return 'BSP';
  if (/^CAM\b|^VCAM\b/.test(upper)) return 'Cam';
  if (/CAPTION/.test(upper)) return 'Caption';
  if (/COLOR\s*CORR|^CC\b/.test(upper)) return 'Color Corrector';
  if (/DECAP|ENCAP/.test(upper)) return 'Decap/Encap';
  if (/^ENC\b|^DEC\b|^CAP\s*ENC|J2K|JXS/.test(upper)) return 'Decode/Encode';
  if (/^GFX\b|GRAPHICS/.test(upper)) return 'GFX';
  if (/IPTV/.test(upper)) return 'IPTV';
  if (/^MON\b/.test(upper)) return 'Mon';
  if (/^MV\b|MULTIVIEW/.test(upper)) return 'Multiview';
  if (/^QC\b/.test(upper)) return 'QC';
  if (/^SWR\b|^SW\b|SWITCHER|^VPGM\b/.test(upper)) return 'Swr';
  if (/TRANSCODE/.test(upper)) return 'Transcode';
  return null;
}

/**
 * Conservatively infers a LawoVendor from a Source record if not explicitly set.
 */
export function inferLawoVendor(source: Source): LawoVendor | null {
  if (source.vendor && LAWO_VENDORS.includes(source.vendor)) {
    return source.vendor;
  }
  const upper = `${source.name} ${source.alias ?? ''}`.toUpperCase();
  if (upper.includes('LIVEU')) return 'LiveU';
  if (upper.includes('HAIVISION')) return 'Haivision';
  if (upper.includes('EVERTZ')) return 'Evertz';
  if (upper.includes('LAWO')) return 'Lawo';
  if (upper.includes('SONY')) return 'Sony';
  if (upper.includes('ROSS')) return 'Ross';
  if (upper.includes('AJA')) return 'AJA';
  if (upper.includes('APPEAR')) return 'Appear';
  if (upper.includes('AWS')) return 'AWS';
  if (upper.includes('BLACKMAGIC')) return 'Blackmagic Design';
  if (upper.includes('CUESCRIPT')) return 'CueScript';
  if (upper.includes('GNURAL')) return 'Gnural';
  if (upper.includes('MAGEWELL')) return 'Magewell';
  if (upper.includes('QUICKLINK')) return 'QuickLink';
  if (upper.includes('AI-MEDIA') || upper.includes('AIMEDIA')) return 'AI-Media';
  return null;
}

/**
 * Determines whether a Source record is a processing stage device (UDX, Frame Sync, etc.).
 */
export function isProcessingDirectorySource(source: Source): boolean {
  if (source.routeRole === 'processing' || source.sourceType === 'processing') {
    return true;
  }
  if (source.routeRole === 'lawo_source' || source.routeRole === 'tieline') {
    return false;
  }
  const devType = source.deviceType;
  if (devType && PROCESSING_DEVICE_TYPES.has(devType)) {
    return true;
  }
  const upper = source.name.trim().toUpperCase();
  return /^UDX\b|^FS[-_\s0-9]|FRAME\s*SYNC|COLOR\s*CORR|TRANSCODE|DECAP|ENCAP/i.test(upper);
}

/**
 * Determines whether a Source record is a valid Lawo destination / Evertz tieline / Evertz source.
 * Existing Evertz sources in the tracker represent the Lawo-to-Evertz tielines and Evertz VIP sources.
 */
export function isTielineDirectorySource(source: Source): boolean {
  if (source.routeRole === 'tieline' || source.routeRole === 'evertz_source') {
    return true;
  }
  if (source.routeRole === 'lawo_source' || source.routeRole === 'processing') {
    return false;
  }
  if (isProcessingDirectorySource(source)) {
    return false;
  }
  return true;
}

/**
 * Determines whether a Source record is a valid upstream Lawo originating source.
 */
export function isLawoOriginDirectorySource(source: Source): boolean {
  if (source.routeRole === 'lawo_source') {
    return true;
  }
  if (source.routeRole === 'processing' || source.routeRole === 'tieline') {
    return false;
  }
  if (isProcessingDirectorySource(source)) {
    return false;
  }
  // Virtual tielines (vCam-*, vTie-*, vIngest-*, vPgm-*) are tielines unless explicitly marked as lawo_source
  if (source.sourceType === 'virtual') {
    return false;
  }
  return true;
}

/**
 * Returns valid Lawo source directory options for the Lawo Source stage selector.
 * Never includes VIP PIPs, MV Inputs, processing stages, or the target tieline itself.
 */
export function getValidLawoSourceOptions(
  sources: readonly Source[],
  excludeSourceId?: SourceId | null
): Source[] {
  return sources
    .filter((s) => s.active !== false && s.id !== excludeSourceId && isLawoOriginDirectorySource(s))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns valid Lawo processing stage directory options (UDX, Frame Sync, etc.).
 */
export function getValidProcessingStageOptions(
  sources: readonly Source[],
  excludeIds: readonly SourceId[] = []
): Source[] {
  const excluded = new Set(excludeIds);
  return sources
    .filter((s) => s.active !== false && !excluded.has(s.id) && isProcessingDirectorySource(s))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns valid Lawo Destination / Evertz Tieline directory options.
 */
export function getValidTielineOptions(sources: readonly Source[]): Source[] {
  return sources
    .filter((s) => s.active !== false && isTielineDirectorySource(s))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns valid Evertz MV Input options constrained strictly to the given VIP card (multiviewId).
 */
export function getValidMvInputOptions(
  destinations: readonly Destination[],
  multiviewId: MultiviewId
): Destination[] {
  return destinations
    .filter((d) => d.multiviewId === multiviewId)
    .sort((a, b) => a.destinationNumber - b.destinationNumber);
}

/**
 * Returns valid PIP IDs that exist in the current layout of an output.
 */
export function getValidPipOptions(
  output: MultiviewOutput,
  customLayouts?: readonly LayoutDefinition[]
): PipId[] {
  if (!output.layoutName || output.status === 'Available') return [];
  const layout = getLayoutDefinition(output.layoutName, customLayouts);
  if (!layout) return [];
  return getLayoutPips(layout).map((p) => p.pipId);
}

/* ============================================================================
   SIGNAL FLOW LOCKING
   ============================================================================ */

export function createPipFlowKey(outputId: OutputId, pipId: PipId): string {
  return `${outputId}:${pipId}`;
}

/**
 * Checks if a SignalFlowLock has an availability timestamp that has already passed.
 */
export function isSignalFlowLockExpired(
  lock: SignalFlowLock | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lock || !lock.locked || !lock.availableAt) return false;
  const availTime = Date.parse(lock.availableAt);
  if (isNaN(availTime)) return false;
  return availTime <= now.getTime();
}

/**
 * Returns true if the flow is currently locked and not expired.
 */
export function isSignalFlowActivelyLocked(
  lock: SignalFlowLock | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lock || !lock.locked) return false;
  if (isSignalFlowLockExpired(lock, now)) return false;
  return true;
}

/* ============================================================================
   RESOLVED PIP SIGNAL FLOW MODEL & RESOLVER
   ============================================================================ */

export interface ProcessingStageHop {
  source: Source;
  inputLabel: string;
  outputLabel: string;
  displayLabel: string;
}

export interface DuplicateLawoSourceWarning {
  lawoSourceId: SourceId;
  lawoSourceName: string;
  currentTielineId: SourceId;
  otherTielineIds: SourceId[];
  otherTielineNames: string[];
  message: string;
}

export interface ResolvedPipSignalFlow {
  flowKey: string;
  multiviewId: MultiviewId;
  multiviewDisplayName: string;
  outputId: OutputId;
  outputDisplayLabel: string;
  outputNumber: number;
  layoutName: string;
  assignmentName: string | null;
  pipId: PipId;
  pipIndex: number;
  pipDisplayLabel: string; // e.g. "MV-03-01 PIP-01"

  // Stage 1: Original/current Lawo Source
  lawoSourceId: SourceId | null;
  lawoSource: Source | null;
  lawoSourceBlank: boolean;

  // Stage 2 (Optional): Variable-depth upstream Lawo processing stages
  processingStages: Source[];
  processingStageHops: ProcessingStageHop[];

  // Stage 3: Lawo Destination / Evertz Tieline
  tielineId: SourceId | null;
  tielineSource: Source | null;
  tielineBlank: boolean;

  // Stage 4: Evertz MV Input
  destinationId: DestinationId | null;
  destination: Destination | null;
  mvInputLabel: string | null;
  mvInputBlank: boolean;

  // Shared Alias
  aliasSource: Source | null;
  alias: string | null;

  // Upstream graph diagnostics
  upstreamFlow: ResolvedSignalFlow;
  hasCycle: boolean;
  isDangling: boolean;
  maxDepthExceeded: boolean;

  // Completeness & Routing status
  isComplete: boolean;
  isUnrouted: boolean; // True when at least one required stage (Lawo Source, Tieline, or MV Input) is BLANK

  // Duplicate Lawo Source across multiple tielines warning
  duplicateWarning: DuplicateLawoSourceWarning | null;

  // Lock state
  lock: SignalFlowLock | null;
  isLocked: boolean;
  isLockExpired: boolean;

  // Last Updated Attribution
  lastUpdated: ChangeAttribution | null;

  // Derived Classification Metadata for Filtering/Search
  deviceType: LawoDeviceType | null;
  vendor: LawoVendor | null;
}

/**
 * Formats a processing Source hop into Input / Output labels.
 * If two consecutive hops represent Input and Output of the same processing unit (e.g. "UDX-01 Input" -> "UDX-01 Output"),
 * or if a single processing device record (e.g. "UDX-01") is used, formats cleanly.
 */
export function buildProcessingStageHops(
  processingStages: readonly Source[]
): ProcessingStageHop[] {
  return processingStages.map((stage) => {
    const inLbl = stage.inputLabel ?? `${stage.name} Input`;
    const outLbl = stage.outputLabel ?? `${stage.name} Output`;
    const hasExplicitInOut = /input|output/i.test(stage.name);
    const displayLabel = hasExplicitInOut ? stage.name : `${inLbl} → ${outLbl}`;
    return {
      source: stage,
      inputLabel: inLbl,
      outputLabel: outLbl,
      displayLabel,
    };
  });
}

/**
 * Resolves the upstream hops of a tieline into:
 * - lawoSource (the originating Lawo source at the head of the chain, or null if BLANK)
 * - processingStages (0 or more intermediate processing devices between lawoSource and tieline)
 * - upstreamFlow (full cycle/dangling/maxDepth diagnostic result)
 */
export function decomposeTielineUpstream(
  tielineSource: Source | null,
  sourceMap: Map<SourceId, Source>,
  options?: { maxDepth?: number }
): {
  lawoSource: Source | null;
  processingStages: Source[];
  upstreamFlow: ResolvedSignalFlow;
} {
  if (!tielineSource) {
    return {
      lawoSource: null,
      processingStages: [],
      upstreamFlow: resolveSignalFlow(null, sourceMap, options),
    };
  }

  const upstreamFlow = resolveSignalFlow(tielineSource.id, sourceMap, options);
  // Hops are in ORIGIN-TO-IMMEDIATE order, ending with tielineSource
  const upstreamHops = upstreamFlow.hops.slice(0, -1);

  if (upstreamHops.length === 0) {
    // Migration invariant: existing Evertz sources/tielines with no upstream source assigned
    // have their Lawo Source stage left as BLANK (null) unless the record itself is explicitly
    // tagged as a direct lawo_source.
    if (tielineSource.routeRole === 'lawo_source') {
      return {
        lawoSource: tielineSource,
        processingStages: [],
        upstreamFlow,
      };
    }
    return {
      lawoSource: null,
      processingStages: [],
      upstreamFlow,
    };
  }

  const firstHop = upstreamHops[0];
  if (isProcessingDirectorySource(firstHop)) {
    // Chain starts at a processing device whose own upstream Lawo source is still unassigned (BLANK)
    return {
      lawoSource: null,
      processingStages: upstreamHops,
      upstreamFlow,
    };
  }

  return {
    lawoSource: firstHop,
    processingStages: upstreamHops.slice(1),
    upstreamFlow,
  };
}

/**
 * Detects duplicate Lawo source usage across distinct Lawo-to-Evertz tielines.
 * Topology Rule:
 * - Allowed without warning: One tieline feeding multiple MV Inputs on different VIP cards.
 * - Warn: One Lawo source routed into multiple DIFFERENT tielines.
 */
export function buildLawoSourceToTielinesMap(
  sources: readonly Source[],
  destinations?: readonly Destination[]
): Map<SourceId, Set<SourceId>> {
  const sourceMap = new Map<SourceId, Source>(sources.map((s) => [s.id, s]));
  const map = new Map<SourceId, Set<SourceId>>();

  // Consider all tieline sources that either have an upstream assigned or are patched to a destination
  const activeTielineIds = new Set<SourceId>();
  for (const s of sources) {
    if (isTielineDirectorySource(s) && s.upstreamSourceId) {
      activeTielineIds.add(s.id);
    }
  }
  if (destinations) {
    for (const d of destinations) {
      if (d.assignedSourceId && sourceMap.has(d.assignedSourceId)) {
        activeTielineIds.add(d.assignedSourceId);
      }
    }
  }

  for (const tielineId of activeTielineIds) {
    const tieline = sourceMap.get(tielineId);
    if (!tieline) continue;
    const { lawoSource } = decomposeTielineUpstream(tieline, sourceMap);
    if (lawoSource && lawoSource.id !== tieline.id) {
      const set = map.get(lawoSource.id) ?? new Set<SourceId>();
      set.add(tieline.id);
      map.set(lawoSource.id, set);
    }
  }

  return map;
}

/**
 * Evaluates whether assigning candidateLawoSourceId to targetTielineId results in the same Lawo source
 * feeding multiple distinct tielines.
 */
export function evaluateDuplicateLawoSourceWarning(
  lawoSourceId: SourceId | null,
  targetTielineId: SourceId | null,
  sources: readonly Source[],
  destinations?: readonly Destination[]
): DuplicateLawoSourceWarning | null {
  if (!lawoSourceId || !targetTielineId) return null;
  const sourceMap = new Map<SourceId, Source>(sources.map((s) => [s.id, s]));
  const lawoSource = sourceMap.get(lawoSourceId);
  if (!lawoSource) return null;

  const lawoToTielines = buildLawoSourceToTielinesMap(sources, destinations);
  const existingTielines = new Set<SourceId>(lawoToTielines.get(lawoSourceId) ?? []);
  existingTielines.add(targetTielineId);

  const otherTielineIds = Array.from(existingTielines).filter((id) => id !== targetTielineId);
  if (otherTielineIds.length === 0) {
    return null;
  }

  const otherTielineNames = otherTielineIds
    .map((id) => sourceMap.get(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));

  return {
    lawoSourceId,
    lawoSourceName: lawoSource.name,
    currentTielineId: targetTielineId,
    otherTielineIds,
    otherTielineNames,
    message: `This Lawo source is already routed to another tieline (${otherTielineNames.join(', ')}).`,
  };
}

/**
 * Selects the most recent ChangeAttribution across all entities participating in a PIP signal flow.
 */
export function selectPipFlowLastUpdated(params: {
  flowKey: string;
  output: MultiviewOutput;
  destination: Destination | null;
  tielineSource: Source | null;
  processingStages: readonly Source[];
  lawoSource: Source | null;
  lock: SignalFlowLock | null;
  changeRecords?: readonly import('./models').ChangeRecord[];
}): ChangeAttribution | null {
  const candidates: ChangeAttribution[] = [];

  const pushCandidate = (
    timestamp: string | null | undefined,
    operatorName: string | null | undefined,
    operatorId?: string | null
  ) => {
    if (!timestamp) return;
    if (!operatorName && !operatorId) return;
    candidates.push({
      timestamp,
      operatorName: operatorName ?? null,
      operatorId: operatorId ?? null,
    });
  };

  if (params.lock) {
    pushCandidate(
      params.lock.updatedAt ?? params.lock.lockedAt,
      params.lock.updatedBy ?? params.lock.lockedBy,
      params.lock.operatorId
    );
  }

  if (params.lawoSource) {
    pushCandidate(
      params.lawoSource.updatedAt,
      params.lawoSource.updatedBy,
      params.lawoSource.operatorId
    );
  }

  for (const stage of params.processingStages) {
    pushCandidate(stage.updatedAt, stage.updatedBy, stage.operatorId);
  }

  if (params.tielineSource) {
    pushCandidate(
      params.tielineSource.updatedAt,
      params.tielineSource.updatedBy,
      params.tielineSource.operatorId
    );
  }

  if (params.destination) {
    pushCandidate(
      params.destination.updatedAt,
      params.destination.updatedBy,
      params.destination.operatorId
    );
  }

  pushCandidate(params.output.updatedAt, params.output.updatedBy, params.output.operatorId);

  if (params.changeRecords && params.changeRecords.length > 0) {
    const relevantEntityIds = new Set<string>([
      params.flowKey,
      params.output.id,
      ...(params.destination ? [params.destination.id] : []),
      ...(params.tielineSource ? [params.tielineSource.id] : []),
      ...params.processingStages.map((s) => s.id),
      ...(params.lawoSource ? [params.lawoSource.id] : []),
    ]);

    for (let i = params.changeRecords.length - 1; i >= 0; i--) {
      const rec = params.changeRecords[i];
      if (rec.changedAt && relevantEntityIds.has(rec.entityId)) {
        // If output-level pipAssignment change, ensure it belongs to this PIP or general output
        if (
          rec.entityType === 'output' &&
          rec.field.startsWith('pipAssignment:') &&
          rec.field !== `pipAssignment:${params.flowKey.split(':').pop()}`
        ) {
          continue;
        }
        pushCandidate(rec.changedAt, rec.operatorName ?? rec.changedBy, rec.operatorId);
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const tA = Date.parse(a.timestamp);
    const tB = Date.parse(b.timestamp);
    if (!isNaN(tA) && !isNaN(tB) && tA !== tB) {
      return tB - tA;
    }
    return b.timestamp.localeCompare(a.timestamp);
  });

  return candidates[0];
}

/**
 * Resolves a single PIP's complete signal flow from the snapshot.
 */
export function resolveSinglePipSignalFlow(
  output: MultiviewOutput,
  pipId: PipId,
  pipIndex: number,
  snapshot: TrackerSnapshot,
  lookup?: {
    mvMap: Map<string, import('./models').Multiview>;
    destMap: Map<DestinationId, Destination>;
    sourceMap: Map<SourceId, Source>;
    now?: Date;
  }
): ResolvedPipSignalFlow {
  const mvMap = lookup?.mvMap ?? new Map(snapshot.multiviews.map((m) => [m.id, m]));
  const destMap = lookup?.destMap ?? new Map(snapshot.destinations.map((d) => [d.id, d]));
  const sourceMap = lookup?.sourceMap ?? new Map(snapshot.sources.map((s) => [s.id, s]));
  const now = lookup?.now ?? new Date();

  const layout = getLayoutDefinition(output.layoutName, snapshot.customLayouts);
  const pipAssignments = output.pipAssignments || normalizeOutputPipAssignments(output, layout);

  const flowKey = createPipFlowKey(output.id, pipId);
  const outputDisplayLabel = formatOutputDisplay(output.id);
  const pipDisplayLabel = `${outputDisplayLabel} ${pipId}`;
  const mv = mvMap.get(output.multiviewId);

  const assignedDestId = pipAssignments[pipId] ?? null;
  const destination = assignedDestId ? (destMap.get(assignedDestId) ?? null) : null;
  const mvInputBlank = !destination;
  const mvInputLabel = destination ? formatInputDisplay(destination.id) : null;

  const rawTielineId = destination?.assignedSourceId ?? null;
  const tielineSource = rawTielineId ? (sourceMap.get(rawTielineId) ?? null) : null;
  const tielineBlank = !tielineSource;

  const { lawoSource, processingStages, upstreamFlow } = decomposeTielineUpstream(
    tielineSource,
    sourceMap
  );
  const lawoSourceBlank = !lawoSource;
  const processingStageHops = buildProcessingStageHops(processingStages);

  const aliasSource = lawoSource ?? tielineSource;
  const alias = getSourceAlias(lawoSource) ?? getSourceAlias(tielineSource);

  const isDangling =
    Boolean(assignedDestId && !destination) ||
    Boolean(rawTielineId && !tielineSource) ||
    upstreamFlow.isDangling;
  const hasCycle = upstreamFlow.hasCycle;
  const maxDepthExceeded = upstreamFlow.maxDepthExceeded;

  const isComplete = !lawoSourceBlank && !tielineBlank && !mvInputBlank && !hasCycle && !isDangling;
  const isUnrouted = !isComplete;

  const duplicateWarning =
    lawoSource && tielineSource
      ? evaluateDuplicateLawoSourceWarning(
          lawoSource.id,
          tielineSource.id,
          snapshot.sources,
          snapshot.destinations
        )
      : null;

  const lock = snapshot.signalFlowLocks?.[flowKey] ?? null;
  const isLockExpired = isSignalFlowLockExpired(lock, now);
  const isLocked = isSignalFlowActivelyLocked(lock, now);

  const lastUpdated = selectPipFlowLastUpdated({
    flowKey,
    output,
    destination,
    tielineSource,
    processingStages,
    lawoSource,
    lock,
    changeRecords: snapshot.changeRecords,
  });

  const deviceType =
    (lawoSource ? inferLawoDeviceType(lawoSource) : null) ??
    (processingStages[0] ? inferLawoDeviceType(processingStages[0]) : null) ??
    (tielineSource ? inferLawoDeviceType(tielineSource) : null);

  const vendor =
    (lawoSource ? inferLawoVendor(lawoSource) : null) ??
    (tielineSource ? inferLawoVendor(tielineSource) : null);

  return {
    flowKey,
    multiviewId: output.multiviewId,
    multiviewDisplayName: mv?.displayName ?? output.multiviewId,
    outputId: output.id,
    outputDisplayLabel,
    outputNumber: output.outputNumber,
    layoutName: output.layoutName ?? '',
    assignmentName: output.assignmentName,
    pipId,
    pipIndex,
    pipDisplayLabel,
    lawoSourceId: lawoSource?.id ?? null,
    lawoSource,
    lawoSourceBlank,
    processingStages,
    processingStageHops,
    tielineId: tielineSource?.id ?? null,
    tielineSource,
    tielineBlank,
    destinationId: destination?.id ?? null,
    destination,
    mvInputLabel,
    mvInputBlank,
    aliasSource,
    alias,
    upstreamFlow,
    hasCycle,
    isDangling,
    maxDepthExceeded,
    isComplete,
    isUnrouted,
    duplicateWarning,
    lock,
    isLocked,
    isLockExpired,
    lastUpdated,
    deviceType,
    vendor,
  };
}

/**
 * Resolves all active PIP signal flows across the entire snapshot.
 * Emits exactly one row per PIP that currently exists in the active multiviewer layouts.
 * Never emits rows for Available/unassigned outputs or nonexistent PIPs.
 */
export function resolveAllPipSignalFlows(
  snapshot: TrackerSnapshot,
  options?: { now?: Date }
): ResolvedPipSignalFlow[] {
  const mvMap = new Map(snapshot.multiviews.map((m) => [m.id, m]));
  const destMap = new Map(snapshot.destinations.map((d) => [d.id, d]));
  const sourceMap = new Map(snapshot.sources.map((s) => [s.id, s]));
  const now = options?.now ?? new Date();

  const flows: ResolvedPipSignalFlow[] = [];

  for (const output of snapshot.outputs) {
    if (output.status === 'Available' || !output.layoutName) {
      continue;
    }
    const layout = getLayoutDefinition(output.layoutName, snapshot.customLayouts);
    if (!layout) {
      continue;
    }

    const pips = getLayoutPips(layout);
    for (const pip of pips) {
      flows.push(
        resolveSinglePipSignalFlow(output, pip.pipId, pip.index, snapshot, {
          mvMap,
          destMap,
          sourceMap,
          now,
        })
      );
    }
  }

  return flows;
}

export interface PipSignalFlowFilterOptions {
  multiviewId?: MultiviewId | 'ALL';
  searchQuery?: string;
  routeStatus?: 'ALL' | 'ROUTED' | 'UNROUTED';
  sourceTypeFilter?: string; // 'ALL' | LawoDeviceType | LawoVendor | SourceCategory
}

/**
 * Filters resolved PIP signal flows by search query, multiview card, routed/unrouted status, and source type/vendor.
 */
export function filterPipSignalFlows(
  flows: readonly ResolvedPipSignalFlow[],
  filters: PipSignalFlowFilterOptions
): ResolvedPipSignalFlow[] {
  const q = (filters.searchQuery ?? '').trim().toLowerCase();
  const mvFilter = filters.multiviewId ?? 'ALL';
  const routeStatus = filters.routeStatus ?? 'ALL';
  const typeFilter = filters.sourceTypeFilter ?? 'ALL';

  return flows.filter((flow) => {
    if (mvFilter !== 'ALL' && flow.multiviewId !== mvFilter) {
      return false;
    }

    if (routeStatus === 'ROUTED' && flow.isUnrouted) {
      return false;
    }
    if (routeStatus === 'UNROUTED' && !flow.isUnrouted) {
      return false;
    }

    if (typeFilter && typeFilter !== 'ALL') {
      const upperFilter = typeFilter.toUpperCase();
      const matchesDeviceType = flow.deviceType?.toUpperCase() === upperFilter;
      const matchesVendor = flow.vendor?.toUpperCase() === upperFilter;
      const matchesLawoCategory = flow.lawoSource?.category.toUpperCase() === upperFilter;
      const matchesTielineCategory = flow.tielineSource?.category.toUpperCase() === upperFilter;
      const matchesProcessingDevice = flow.processingStages.some(
        (s) =>
          inferLawoDeviceType(s)?.toUpperCase() === upperFilter ||
          inferLawoVendor(s)?.toUpperCase() === upperFilter ||
          s.category.toUpperCase() === upperFilter
      );
      if (
        !matchesDeviceType &&
        !matchesVendor &&
        !matchesLawoCategory &&
        !matchesTielineCategory &&
        !matchesProcessingDevice
      ) {
        return false;
      }
    }

    if (q) {
      const searchableTokens: string[] = [
        flow.pipId,
        flow.pipDisplayLabel,
        flow.outputDisplayLabel,
        flow.outputId,
        flow.multiviewId,
        flow.multiviewDisplayName,
        flow.layoutName,
        flow.assignmentName ?? '',
        flow.mvInputLabel ?? '',
        flow.destination ? formatDestinationDisplay(flow.destination.id) : '',
        flow.lawoSource?.name ?? '',
        getSourceAlias(flow.lawoSource) ?? '',
        flow.tielineSource?.name ?? '',
        getSourceAlias(flow.tielineSource) ?? '',
        flow.alias ?? '',
        flow.deviceType ?? '',
        flow.vendor ?? '',
        flow.lawoSource?.category ?? '',
        flow.tielineSource?.category ?? '',
        ...flow.processingStages.flatMap((s) => [
          s.name,
          getSourceAlias(s) ?? '',
          inferLawoDeviceType(s) ?? '',
          inferLawoVendor(s) ?? '',
          inferLawoDeviceType(s) === 'FS' ? 'Frame Sync' : '',
        ]),
        ...flow.processingStageHops.map((h) => h.displayLabel),
      ];

      const matchesSearch = searchableTokens.some((tok) => tok.toLowerCase().includes(q));
      if (!matchesSearch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Formats a compact stacked or inline representation of a ResolvedPipSignalFlow for PIP windows and modals.
 */
export function formatResolvedPipChainText(flow: ResolvedPipSignalFlow): string {
  const stages: string[] = [];
  stages.push(flow.lawoSource ? flow.lawoSource.name : 'BLANK');
  for (const hop of flow.processingStageHops) {
    stages.push(hop.displayLabel);
  }
  stages.push(flow.tielineSource ? flow.tielineSource.name : 'BLANK');
  stages.push(flow.mvInputLabel ?? 'BLANK');
  stages.push(flow.pipDisplayLabel);
  return stages.join(' → ');
}

/* ============================================================================
   PURE SNAPSHOT MUTATION HELPERS FOR CHECKMARK STAGE SAVES
   ============================================================================ */

/**
 * Updates the MV Input assigned to a specific PIP on an output.
 */
export function applyPipMvInputStageChange(
  snapshot: TrackerSnapshot,
  outputId: OutputId,
  pipId: PipId,
  newDestinationId: DestinationId | null,
  operator?: { id: string; displayName: string } | null,
  timestamp: string = new Date().toISOString()
): TrackerSnapshot {
  const nextOutputs = snapshot.outputs.map((out) => {
    if (out.id !== outputId) return out;
    const layout = getLayoutDefinition(out.layoutName, snapshot.customLayouts);
    const updated = assignPipInput(out, pipId, newDestinationId, layout);
    return {
      ...updated,
      updatedAt: timestamp,
      updatedBy: operator ? operator.displayName : updated.updatedBy,
      operatorId: operator ? operator.id : updated.operatorId,
    };
  });

  return {
    ...JSON.parse(JSON.stringify(snapshot)),
    outputs: nextOutputs,
  };
}

/**
 * Updates the Tieline / Evertz Source assigned to an MV Input destination.
 */
export function applyPipTielineStageChange(
  snapshot: TrackerSnapshot,
  destinationId: DestinationId,
  newTielineId: SourceId | null,
  operator?: { id: string; displayName: string } | null,
  timestamp: string = new Date().toISOString()
): TrackerSnapshot {
  const nextDestinations = snapshot.destinations.map((dest) => {
    if (dest.id !== destinationId) return dest;
    return {
      ...dest,
      assignedSourceId: newTielineId,
      updatedAt: timestamp,
      updatedBy: operator ? operator.displayName : dest.updatedBy,
      operatorId: operator ? operator.id : dest.operatorId,
    };
  });

  return {
    ...JSON.parse(JSON.stringify(snapshot)),
    destinations: nextDestinations,
  };
}

/**
 * Updates the upstream Lawo chain (Lawo Source + zero or more Processing Stages) feeding a Tieline.
 * Links: lawoSource <- processingStage[0] <- ... <- processingStage[n-1] <- tielineSource.
 * Validates against circular references before applying.
 */
export function applyPipLawoChainUpdate(
  snapshot: TrackerSnapshot,
  tielineId: SourceId,
  lawoSourceId: SourceId | null,
  processingStageIds: readonly SourceId[],
  operator?: { id: string; displayName: string } | null,
  timestamp: string = new Date().toISOString()
): TrackerSnapshot {
  // Ordered chain from origin to tieline: [...(lawoSourceId ? [lawoSourceId] : []), ...processingStageIds, tielineId]
  const chain: (SourceId | null)[] = [lawoSourceId, ...processingStageIds, tielineId];

  // Check for duplicates in the proposed chain (circularity check)
  const nonNullIds = chain.filter((id): id is SourceId => id !== null);
  const uniqueIds = new Set(nonNullIds);
  if (uniqueIds.size !== nonNullIds.length) {
    throw new Error('Cannot save signal flow stage: circular upstream relationship detected.');
  }

  // Map each node from index 1..end to its immediate upstream at index-1
  const upstreamUpdates = new Map<SourceId, SourceId | null>();
  for (let i = 1; i < chain.length; i++) {
    const nodeId = chain[i];
    const parentId = chain[i - 1];
    if (nodeId) {
      upstreamUpdates.set(nodeId, parentId ?? null);
    }
  }

  const nextSources = snapshot.sources.map((src) => {
    if (!upstreamUpdates.has(src.id)) return src;
    const nextUpstream = upstreamUpdates.get(src.id) ?? null;
    if (src.upstreamSourceId === nextUpstream) return src;
    return {
      ...src,
      upstreamSourceId: nextUpstream,
      updatedAt: timestamp,
      updatedBy: operator ? operator.displayName : src.updatedBy,
      operatorId: operator ? operator.id : src.operatorId,
    };
  });

  // Also verify no indirect cycle was created in the full graph
  const resolved = resolveSignalFlow(tielineId, nextSources);
  if (resolved.hasCycle) {
    throw new Error(
      `Cannot save signal flow stage: circular routing detected (${formatCyclePath(
        resolved.cycleSourceIds,
        nextSources
      )}).`
    );
  }

  return {
    ...JSON.parse(JSON.stringify(snapshot)),
    sources: nextSources,
  };
}

/**
 * Updates or unlocks a PIP signal flow lock record.
 */
export function applyPipFlowLockChange(
  snapshot: TrackerSnapshot,
  outputId: OutputId,
  pipId: PipId,
  lockOptions: {
    locked: boolean;
    availableAt?: string | null;
    context?: string | null;
  },
  operator?: { id: string; displayName: string } | null,
  timestamp: string = new Date().toISOString()
): TrackerSnapshot {
  const flowKey = createPipFlowKey(outputId, pipId);
  const currentLocks = { ...(snapshot.signalFlowLocks ?? {}) };
  const existing = currentLocks[flowKey];
  const operatorName = operator?.displayName ?? 'TECH OPS';

  if (lockOptions.locked) {
    currentLocks[flowKey] = {
      flowKey,
      outputId,
      pipId,
      locked: true,
      lockedBy: operatorName,
      operatorId: operator?.id ?? null,
      lockedAt: timestamp,
      availableAt: lockOptions.availableAt ?? null,
      context: lockOptions.context ?? null,
      updatedAt: timestamp,
      updatedBy: operatorName,
    };
  } else if (existing) {
    currentLocks[flowKey] = {
      ...existing,
      locked: false,
      updatedAt: timestamp,
      updatedBy: operatorName,
      operatorId: operator?.id ?? existing.operatorId ?? null,
    };
  }

  return {
    ...JSON.parse(JSON.stringify(snapshot)),
    signalFlowLocks: currentLocks,
  };
}
