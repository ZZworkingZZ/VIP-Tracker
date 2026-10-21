import { TrackerSnapshot } from './models';
import { formatOutputDisplay, formatDestinationDisplay } from './identifiers';

/**
 * Normalized tabular row representing an output assignment for spreadsheet export.
 */
export interface OutputExportRow {
  outputId: string;
  multiviewId: string;
  outputNumber: number;
  displayLabel: string;
  layoutName: string;
  destinationStart: number | null;
  destinationEnd: number | null;
  destinationRange: string;
  windowCount: number;
  assignmentName: string;
  status: string;
  locked: boolean;
  notes: string;
}

/**
 * Normalized tabular row representing a destination router mapping for spreadsheet export.
 */
export interface DestinationExportRow {
  destinationId: string;
  multiviewId: string;
  destinationNumber: number;
  displayLabel: string;
  assignedSourceId: string | null;
  sourceName: string;
  sourceCategory: string;
  derivedAssignmentName: string;
  locked: boolean;
}

/**
 * Normalized tabular row representing a cataloged router source.
 */
export interface SourceExportRow {
  sourceId: string;
  name: string;
  normalizedName: string;
  category: string;
  active: boolean;
}

/**
 * Structured export dataset prepared for future Excel/CSV generator.
 */
export interface AuthoritativeExportDataset {
  outputs: OutputExportRow[];
  destinations: DestinationExportRow[];
  sources: SourceExportRow[];
  exportedAt: string;
  version: string;
}

/**
 * Transforms an authoritative TrackerSnapshot into a normalized export dataset.
 * Free of UI dependencies.
 */
export function buildAuthoritativeExportDataset(
  snapshot: TrackerSnapshot
): AuthoritativeExportDataset {
  const sourceMap = new Map(snapshot.sources.map((s) => [s.id, s]));

  // Build Output rows
  const outputs: OutputExportRow[] = snapshot.outputs.map((out) => {
    const range =
      out.destinationStart !== null && out.destinationEnd !== null
        ? `${out.destinationStart}-${out.destinationEnd}`
        : 'None';
    const winCount =
      out.destinationStart !== null && out.destinationEnd !== null
        ? out.destinationEnd - out.destinationStart + 1
        : 0;

    return {
      outputId: out.id,
      multiviewId: out.multiviewId,
      outputNumber: out.outputNumber,
      displayLabel: formatOutputDisplay(out.id),
      layoutName: out.layoutName ?? 'Available',
      destinationStart: out.destinationStart,
      destinationEnd: out.destinationEnd,
      destinationRange: range,
      windowCount: winCount,
      assignmentName: out.assignmentName ?? 'Available',
      status: out.status,
      locked: out.locked,
      notes: out.notes ?? '',
    };
  });

  // Build Destination rows
  const destinations: DestinationExportRow[] = snapshot.destinations.map((dest) => {
    const source = dest.assignedSourceId ? sourceMap.get(dest.assignedSourceId) : null;
    const coveringOut = snapshot.outputs.find(
      (o) =>
        o.multiviewId === dest.multiviewId &&
        o.destinationStart !== null &&
        o.destinationEnd !== null &&
        dest.destinationNumber >= o.destinationStart &&
        dest.destinationNumber <= o.destinationEnd
    );

    return {
      destinationId: dest.id,
      multiviewId: dest.multiviewId,
      destinationNumber: dest.destinationNumber,
      displayLabel: formatDestinationDisplay(dest.id),
      assignedSourceId: dest.assignedSourceId,
      sourceName: source?.name ?? 'Unrouted',
      sourceCategory: source?.category ?? 'None',
      derivedAssignmentName: coveringOut?.assignmentName ?? 'Unassigned',
      locked: dest.locked,
    };
  });

  // Build Source rows
  const sources: SourceExportRow[] = snapshot.sources.map((s) => ({
    sourceId: s.id,
    name: s.name,
    normalizedName: s.normalizedName,
    category: s.category,
    active: s.active,
  }));

  return {
    outputs,
    destinations,
    sources,
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
  };
}

/**
 * Serializes a TrackerSnapshot to JSON string.
 */
export function serializeTrackerSnapshot(snapshot: TrackerSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Deserializes JSON string to TrackerSnapshot with basic structural validation.
 */
export function deserializeTrackerSnapshot(json: string): TrackerSnapshot {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.outputs) || !Array.isArray(parsed.destinations)) {
    throw new Error('Invalid VIP Tracker snapshot format.');
  }
  return parsed as TrackerSnapshot;
}
