import { SourceId } from './identifiers';
import { Source } from './models';

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
  sources: Source[] | Map<SourceId, Source>,
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
  return flow.hops.map((h) => h.name).join(' → ');
}

/**
 * Evaluates the resulting signal flow if targetSourceId has its upstream assigned to proposedUpstreamSourceId.
 * Creates an in-memory shadow graph without mutating the original source objects or repository.
 */
export function previewUpstreamSignalFlow(
  targetSourceId: SourceId,
  proposedUpstreamSourceId: SourceId | null,
  sources: Source[] | Map<SourceId, Source>,
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
  sources: Source[] | Map<SourceId, Source>
): string {
  if (cycleSourceIds.length === 0) return '';
  const sourceMap =
    sources instanceof Map ? sources : new Map<SourceId, Source>(sources.map((s) => [s.id, s]));

  const names = cycleSourceIds.map((id) => sourceMap.get(id)?.name ?? id);
  // Complete the loop by appending the start node
  return [...names, names[0]].join(' → ');
}
