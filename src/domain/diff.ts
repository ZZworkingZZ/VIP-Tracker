import { TrackerSnapshot, FieldChange, ChangeSet, ChangeRecord } from './models';
import {
  formatOutputDisplay,
  formatDestinationDisplay,
  formatInputDisplay,
  PipId,
} from './identifiers';

/**
 * Compares a baseline snapshot with a draft snapshot and produces structured field differences.
 * Pure domain logic: deterministic, decoupled from UI/React.
 */
export function diffSnapshots(baseline: TrackerSnapshot, draft: TrackerSnapshot): FieldChange[] {
  const changes: FieldChange[] = [];

  // Map sources for fast name resolution
  const baselineSources = new Map(baseline.sources.map((s) => [s.id, s.name]));
  const draftSources = new Map(draft.sources.map((s) => [s.id, s.name]));

  // 1. Compare MultiviewOutputs
  const baselineOutputs = new Map(baseline.outputs.map((o) => [o.id, o]));
  for (const draftOut of draft.outputs) {
    const baseOut = baselineOutputs.get(draftOut.id);
    if (!baseOut) continue;

    const outputLabel = formatOutputDisplay(draftOut.id);

    // Layout
    if (baseOut.layoutName !== draftOut.layoutName) {
      changes.push({
        entityType: 'output',
        entityId: draftOut.id,
        entityLabel: outputLabel,
        field: 'layoutName',
        previousValue: baseOut.layoutName ?? 'None',
        newValue: draftOut.layoutName ?? 'None',
        description: `Layout: ${baseOut.layoutName ?? 'None'} → ${draftOut.layoutName ?? 'None'}`,
      });
    }

    // Production Assignment
    const baseAssign = baseOut.assignmentName || 'AVAILABLE';
    const draftAssign = draftOut.assignmentName || 'AVAILABLE';
    if (baseAssign !== draftAssign) {
      changes.push({
        entityType: 'output',
        entityId: draftOut.id,
        entityLabel: outputLabel,
        field: 'assignmentName',
        previousValue: baseAssign,
        newValue: draftAssign,
        description: `Production Assignment: ${baseAssign} → ${draftAssign}`,
      });
    }

    // Status
    if (baseOut.status !== draftOut.status) {
      changes.push({
        entityType: 'output',
        entityId: draftOut.id,
        entityLabel: outputLabel,
        field: 'status',
        previousValue: baseOut.status,
        newValue: draftOut.status,
        description: `Status: ${baseOut.status} → ${draftOut.status}`,
      });
    }

    // Notes
    if ((baseOut.notes ?? '') !== (draftOut.notes ?? '')) {
      changes.push({
        entityType: 'output',
        entityId: draftOut.id,
        entityLabel: outputLabel,
        field: 'notes',
        previousValue: baseOut.notes,
        newValue: draftOut.notes,
        description: `Notes: '${baseOut.notes ?? ''}' → '${draftOut.notes ?? ''}'`,
      });
    }

    // Locked
    if (baseOut.locked !== draftOut.locked) {
      changes.push({
        entityType: 'output',
        entityId: draftOut.id,
        entityLabel: outputLabel,
        field: 'locked',
        previousValue: baseOut.locked ? 'Locked' : 'Unlocked',
        newValue: draftOut.locked ? 'Locked' : 'Unlocked',
        description: `Lock State: ${baseOut.locked ? 'Locked' : 'Unlocked'} → ${
          draftOut.locked ? 'Locked' : 'Unlocked'
        }`,
      });
    }

    // PIP Assignments
    const basePips = baseOut.pipAssignments ?? {};
    const draftPips = draftOut.pipAssignments ?? {};
    const allPipIds = Array.from(
      new Set([...Object.keys(basePips), ...Object.keys(draftPips)])
    ).sort() as PipId[];

    for (const pipId of allPipIds) {
      const prevDest = basePips[pipId] ?? null;
      const newDest = draftPips[pipId] ?? null;

      if (prevDest !== newDest) {
        const prevLabel = prevDest ? formatInputDisplay(prevDest) : 'Unassigned';
        const newLabel = newDest ? formatInputDisplay(newDest) : 'Unassigned';

        changes.push({
          entityType: 'output',
          entityId: draftOut.id,
          entityLabel: outputLabel,
          field: `pipAssignment:${pipId}`,
          previousValue: prevLabel,
          newValue: newLabel,
          description: `${outputLabel} ${pipId}: ${prevLabel} → ${newLabel}`,
        });
      }
    }
  }

  // 2. Compare Destinations
  const baselineDests = new Map(baseline.destinations.map((d) => [d.id, d]));
  for (const draftDest of draft.destinations) {
    const baseDest = baselineDests.get(draftDest.id);
    if (!baseDest) continue;

    if (baseDest.assignedSourceId !== draftDest.assignedSourceId) {
      const prevSource = baseDest.assignedSourceId
        ? (baselineSources.get(baseDest.assignedSourceId) ?? baseDest.assignedSourceId)
        : 'Unrouted';
      const newSource = draftDest.assignedSourceId
        ? (draftSources.get(draftDest.assignedSourceId) ?? draftDest.assignedSourceId)
        : 'Unrouted';

      const destLabel = formatDestinationDisplay(draftDest.id);

      changes.push({
        entityType: 'destination',
        entityId: draftDest.id,
        entityLabel: destLabel,
        field: 'assignedSourceId',
        previousValue: prevSource,
        newValue: newSource,
        description: `Destination ${draftDest.destinationNumber}: ${prevSource} → ${newSource}`,
      });
    }
  }

  // 3. Compare Sources (detect newly cataloged sources and upstream relationship changes)
  const baselineSourcesMap = new Map(baseline.sources.map((s) => [s.id, s]));
  for (const draftSrc of draft.sources) {
    const baseSrc = baselineSourcesMap.get(draftSrc.id);
    if (!baseSrc) {
      changes.push({
        entityType: 'source',
        entityId: draftSrc.id,
        entityLabel: draftSrc.name,
        field: 'sourceCatalog',
        previousValue: null,
        newValue: draftSrc.name,
        description: `Added Source to Directory: ${draftSrc.name} (${draftSrc.category})`,
      });
      continue;
    }

    if (baseSrc.upstreamSourceId !== draftSrc.upstreamSourceId) {
      const prevName = baseSrc.upstreamSourceId
        ? (baselineSources.get(baseSrc.upstreamSourceId) ?? baseSrc.upstreamSourceId)
        : 'Unassigned';
      const newName = draftSrc.upstreamSourceId
        ? (draftSources.get(draftSrc.upstreamSourceId) ?? draftSrc.upstreamSourceId)
        : 'Unassigned';

      let description: string;
      if (!baseSrc.upstreamSourceId && draftSrc.upstreamSourceId) {
        description = `${draftSrc.name} upstream changed from Unassigned to ${newName}`;
      } else if (baseSrc.upstreamSourceId && !draftSrc.upstreamSourceId) {
        description = `${draftSrc.name} upstream cleared from ${prevName}`;
      } else {
        description = `${draftSrc.name} upstream changed from ${prevName} to ${newName}`;
      }

      changes.push({
        entityType: 'source',
        entityId: draftSrc.id,
        entityLabel: draftSrc.name,
        field: 'upstreamSourceId',
        previousValue: prevName,
        newValue: newName,
        description,
      });
    }
  }

  return changes;
}

/**
 * Creates a complete ChangeSet object from baseline and draft snapshots.
 */
export function createChangeSet(baseline: TrackerSnapshot, draft: TrackerSnapshot): ChangeSet {
  const changes = diffSnapshots(baseline, draft);
  const timestamp = new Date().toISOString();
  const summary = `${changes.length} change${changes.length === 1 ? '' : 's'}`;

  return {
    id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    summary,
    changes,
  };
}

/**
 * Transforms a ChangeSet into standard ChangeRecord instances for historical audit logging.
 * Maintains zero identity fabrication (changedBy is null).
 */
export function changeSetToChangeRecords(changeSet: ChangeSet): ChangeRecord[] {
  return changeSet.changes.map((c, index) => ({
    id: `rec_${changeSet.id}_${index + 1}`,
    entityType: c.entityType,
    entityId: c.entityId,
    field: c.field,
    previousValue: c.previousValue,
    newValue: c.newValue,
    reason: changeSet.summary,
    changedBy: null,
    changedAt: changeSet.timestamp,
  }));
}
