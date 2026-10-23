import {
  Multiview,
  MultiviewOutput,
  Destination,
  Source,
  ValidationFinding,
  TrackerSnapshot,
} from './models';
import { MultiviewId, OutputId } from './identifiers';
import { SourceCategory } from './sourceCategories';

export interface DashboardTotals {
  totalMultiviews: number;
  totalOutputs: number;
  assignedOutputs: number;
  availableOutputs: number;
  lockedOutputs: number;
  activeValidationFindings: number;
}

export interface MultiviewSummaryCardData {
  multiview: Multiview;
  assignedOutputsCount: number;
  availableOutputsCount: number;
  lockedOutputsCount: number;
  conflictCount: number;
  outputs: MultiviewOutput[];
}

export interface DerivedDestinationRow {
  destination: Destination;
  source: Source | null;
  derivedAssignmentName: string | null;
  coveringOutput: MultiviewOutput | null;
  isAmbiguous: boolean;
  hasConflict: boolean;
}

export interface GroupedProductionAssignment {
  assignmentName: string;
  multiviewsUsed: MultiviewId[];
  outputsUsed: OutputId[];
  layouts: string[];
  isLocked: boolean;
  findings: ValidationFinding[];
}

/**
 * Calculates dashboard high-level metric totals from snapshot.
 */
export function selectDashboardTotals(snapshot: TrackerSnapshot): DashboardTotals {
  const totalMultiviews = snapshot.multiviews.length;
  const totalOutputs = snapshot.outputs.length;
  const assignedOutputs = snapshot.outputs.filter((o) => o.status === 'Assigned').length;
  const availableOutputs = snapshot.outputs.filter((o) => o.status === 'Available').length;
  const lockedOutputs = snapshot.outputs.filter((o) => o.locked).length;
  const activeValidationFindings = snapshot.validationFindings.filter(
    (f) => f.severity === 'error' || f.severity === 'warning'
  ).length;

  return {
    totalMultiviews,
    totalOutputs,
    assignedOutputs,
    availableOutputs,
    lockedOutputs,
    activeValidationFindings,
  };
}

/**
 * Selects summary data for each multiview card on the dashboard.
 */
export function selectMultiviewSummaries(snapshot: TrackerSnapshot): MultiviewSummaryCardData[] {
  return snapshot.multiviews.map((mv) => {
    const outputs = snapshot.outputs.filter((o) => o.multiviewId === mv.id);
    const assignedOutputsCount = outputs.filter((o) => o.status === 'Assigned').length;
    const availableOutputsCount = outputs.filter((o) => o.status === 'Available').length;
    const lockedOutputsCount = outputs.filter((o) => o.locked).length;

    const conflictCount = snapshot.validationFindings.filter(
      (f) =>
        (f.severity === 'error' || f.severity === 'warning') &&
        (f.entityId === mv.id ||
          f.relatedEntityIds.includes(mv.id) ||
          outputs.some((o) => o.id === f.entityId || f.relatedEntityIds.includes(o.id)))
    ).length;

    return {
      multiview: mv,
      assignedOutputsCount,
      availableOutputsCount,
      lockedOutputsCount,
      conflictCount,
      outputs,
    };
  });
}

/**
 * Selects and derives operational destination information for a selected multiview.
 * Correctly derives operational assignment without ambiguity. If multiple output ranges cover a destination,
 * it flags it as ambiguous and in conflict.
 */
export function selectDestinationsForMultiview(
  snapshot: TrackerSnapshot,
  multiviewId: MultiviewId
): DerivedDestinationRow[] {
  const mvOutputs = snapshot.outputs.filter((o) => o.multiviewId === multiviewId);
  const mvDestinations = snapshot.destinations.filter((d) => d.multiviewId === multiviewId);
  const sourceMap = new Map<string, Source>(snapshot.sources.map((s) => [s.id, s]));

  return mvDestinations.map((dest) => {
    const source = dest.assignedSourceId ? (sourceMap.get(dest.assignedSourceId) ?? null) : null;

    // Find covering outputs
    const coveringOutputs = mvOutputs.filter(
      (o) =>
        o.destinationStart !== null &&
        o.destinationEnd !== null &&
        dest.destinationNumber >= o.destinationStart &&
        dest.destinationNumber <= o.destinationEnd
    );

    let derivedAssignmentName: string | null = null;
    let coveringOutput: MultiviewOutput | null = null;
    let isAmbiguous = false;
    let hasConflict = false;

    if (coveringOutputs.length === 1) {
      coveringOutput = coveringOutputs[0];
      derivedAssignmentName = coveringOutputs[0].assignmentName;
    } else if (coveringOutputs.length > 1) {
      isAmbiguous = true;
      hasConflict = true;
      derivedAssignmentName = `CONFLICT (${coveringOutputs.length} ranges)`;
    }

    return {
      destination: dest,
      source,
      derivedAssignmentName,
      coveringOutput,
      isAmbiguous,
      hasConflict,
    };
  });
}

/**
 * Selects grouped operational assignments derived strictly from verified output records.
 * Preserves raw names (including hyphens vs underscores).
 */
export function selectGroupedProductions(snapshot: TrackerSnapshot): GroupedProductionAssignment[] {
  const groups = new Map<string, GroupedProductionAssignment>();

  for (const out of snapshot.outputs) {
    if (!out.assignmentName) continue;
    const name = out.assignmentName;

    if (!groups.has(name)) {
      groups.set(name, {
        assignmentName: name,
        multiviewsUsed: [],
        outputsUsed: [],
        layouts: [],
        isLocked: false,
        findings: [],
      });
    }

    const group = groups.get(name)!;

    if (!group.multiviewsUsed.includes(out.multiviewId)) {
      group.multiviewsUsed.push(out.multiviewId);
    }
    if (!group.outputsUsed.includes(out.id)) {
      group.outputsUsed.push(out.id);
    }
    if (out.layoutName && !group.layouts.includes(out.layoutName)) {
      group.layouts.push(out.layoutName);
    }
    if (out.locked) {
      group.isLocked = true;
    }
  }

  // Attach relevant findings
  for (const group of groups.values()) {
    group.findings = snapshot.validationFindings.filter(
      (f) =>
        group.outputsUsed.includes(f.entityId as OutputId) ||
        f.message.includes(`'${group.assignmentName}'`)
    );
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.assignmentName.localeCompare(b.assignmentName)
  );
}

/**
 * Filters and sorts sources for the Source Directory.
 */
export function selectFilteredSources(
  sources: Source[],
  categoryFilter: SourceCategory | 'ALL',
  searchQuery: string
): Source[] {
  const query = searchQuery.trim().toLowerCase();

  return sources
    .filter((source) => {
      if (categoryFilter !== 'ALL' && source.category !== categoryFilter) {
        return false;
      }
      if (query && !source.name.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
