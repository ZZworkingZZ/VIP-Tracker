import {
  TrackerSnapshot,
  FieldChange,
  ChangeSet,
  ChangeRecord,
  HistoryEntry,
  HistoryEntityType,
  HistoryAction,
  getSourceAlias,
} from './models';
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

    const baseAlias = getSourceAlias(baseSrc);
    const draftAlias = getSourceAlias(draftSrc);
    if (baseAlias !== draftAlias) {
      let description: string;
      if (!baseAlias && draftAlias) {
        description = `${draftSrc.name} alias set to '${draftAlias}'`;
      } else if (baseAlias && !draftAlias) {
        description = `${draftSrc.name} alias '${baseAlias}' cleared`;
      } else {
        description = `${draftSrc.name} alias changed from '${baseAlias}' to '${draftAlias}'`;
      }

      changes.push({
        entityType: 'source',
        entityId: draftSrc.id,
        entityLabel: draftSrc.name,
        field: 'alias',
        previousValue: baseAlias,
        newValue: draftAlias,
        description,
      });
    }
  }

  // 4. Compare OperationalAssignments (detect added, renamed, or removed Production Assignments)
  const baselineAssignments = (baseline.operationalAssignments ?? []).filter(
    (a) => a && a.active !== false
  );
  const draftAssignments = (draft.operationalAssignments ?? []).filter(
    (a) => a && a.active !== false
  );
  const baselineAssignMap = new Map(baselineAssignments.map((a) => [a.id, a]));
  const draftAssignMap = new Map(draftAssignments.map((a) => [a.id, a]));

  // Assignments that were implicitly created by setting output.assignmentName on an output
  // already have an output assignmentName FieldChange, so only emit a separate assignmentCatalog
  // diff when the assignment is not already accounted for by a changed output assignmentName.
  const changedOutputAssignmentNames = new Set(
    changes
      .filter((c) => c.entityType === 'output' && c.field === 'assignmentName' && c.newValue)
      .map((c) => c.newValue!.trim().toUpperCase())
  );

  for (const draftAssign of draftAssignments) {
    const baseAssign = baselineAssignMap.get(draftAssign.id);
    if (!baseAssign) {
      if (!changedOutputAssignmentNames.has(draftAssign.rawName.trim().toUpperCase())) {
        changes.push({
          entityType: 'assignment',
          entityId: draftAssign.id,
          entityLabel: draftAssign.rawName,
          field: 'assignmentCatalog',
          previousValue: null,
          newValue: draftAssign.rawName,
          description: `Added Production Assignment: ${draftAssign.rawName}`,
        });
      }
    } else if (baseAssign.rawName !== draftAssign.rawName) {
      changes.push({
        entityType: 'assignment',
        entityId: draftAssign.id,
        entityLabel: draftAssign.rawName,
        field: 'assignmentCatalog',
        previousValue: baseAssign.rawName,
        newValue: draftAssign.rawName,
        description: `Renamed Production Assignment: ${baseAssign.rawName} → ${draftAssign.rawName}`,
      });
    }
  }

  for (const baseAssign of baselineAssignments) {
    if (!draftAssignMap.has(baseAssign.id)) {
      changes.push({
        entityType: 'assignment',
        entityId: baseAssign.id,
        entityLabel: baseAssign.rawName,
        field: 'assignmentCatalog',
        previousValue: baseAssign.rawName,
        newValue: null,
        description: `Removed Production Assignment: ${baseAssign.rawName}`,
      });
    }
  }

  // 5. Compare SignalFlowLocks
  const baseLocks = baseline.signalFlowLocks ?? {};
  const draftLocks = draft.signalFlowLocks ?? {};
  const allFlowKeys = Array.from(
    new Set([...Object.keys(baseLocks), ...Object.keys(draftLocks)])
  ).sort();

  for (const flowKey of allFlowKeys) {
    const baseLock = baseLocks[flowKey];
    const draftLock = draftLocks[flowKey];
    const wasLocked = Boolean(baseLock?.locked);
    const isNowLocked = Boolean(draftLock?.locked);
    const prevAvail = baseLock?.availableAt ?? null;
    const nextAvail = draftLock?.availableAt ?? null;

    if (wasLocked !== isNowLocked || (isNowLocked && prevAvail !== nextAvail)) {
      const entityLabel = flowKey.replace(/^OUT:/, '').replace(':', ' ');
      const prevDesc = wasLocked ? `Locked${prevAvail ? ` (until ${prevAvail})` : ''}` : 'Unlocked';
      const nextDesc = isNowLocked
        ? `Locked${nextAvail ? ` (until ${nextAvail})` : ''}`
        : 'Unlocked';

      changes.push({
        entityType: 'pip',
        entityId: flowKey,
        entityLabel,
        field: 'signalFlowLock',
        previousValue: prevDesc,
        newValue: nextDesc,
        description: `Signal Flow Lock: ${prevDesc} → ${nextDesc}`,
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
 * When an active operator is provided, records structured operator ID and display name.
 * Maintains zero identity fabrication (null when no operator is provided).
 */
export function changeSetToChangeRecords(
  changeSet: ChangeSet,
  operator?: { id: string; displayName: string } | null
): ChangeRecord[] {
  return changeSet.changes.map((c, index) => ({
    id: `rec_${changeSet.id}_${index + 1}`,
    entityType: c.entityType,
    entityId: c.entityId,
    field: c.field,
    previousValue: c.previousValue,
    newValue: c.newValue,
    reason: changeSet.summary,
    changedBy: operator ? operator.displayName : null,
    changedAt: changeSet.timestamp,
    operatorId: operator ? operator.id : null,
    operatorName: operator ? operator.displayName : null,
  }));
}

export const MAX_HISTORY_ENTRIES = 500;

function isClearedValue(val: string | null | undefined): boolean {
  if (val === null || val === undefined || val === '') return true;
  const upper = val.trim().toUpperCase();
  return (
    upper === 'NONE' || upper === 'AVAILABLE' || upper === 'UNASSIGNED' || upper === 'UNROUTED'
  );
}

function classifyEntityHistoryType(changes: FieldChange[]): HistoryEntityType {
  const first = changes[0];
  if (
    first.entityType === 'destination' ||
    first.entityType === 'source' ||
    first.entityType === 'pip'
  ) {
    return 'Source/Destination State';
  }
  if (first.entityType === 'assignment') {
    return 'Production Assignment';
  }
  const fields = new Set(changes.map((c) => c.field));
  if (fields.size === 1) {
    if (fields.has('layoutName')) {
      return 'Layout Assignment';
    }
    if (fields.has('assignmentName')) {
      return 'Production Assignment';
    }
  }
  return 'Output/MV';
}

function classifyEntityHistoryAction(changes: FieldChange[]): HistoryAction {
  const allCreated = changes.every(
    (c) =>
      c.field === 'sourceCatalog' ||
      (isClearedValue(c.previousValue) && !isClearedValue(c.newValue))
  );
  if (allCreated) {
    return 'created';
  }
  const allCleared = changes.every(
    (c) => !isClearedValue(c.previousValue) && isClearedValue(c.newValue)
  );
  if (allCleared) {
    return 'cleared';
  }
  return 'updated';
}

function resolvePipChangeValueLabel(value: string | null, snapshot?: TrackerSnapshot): string {
  if (!value || value === 'Unassigned') return 'Unassigned';
  if (!snapshot) return value;
  const destId = `DEST:${value.replace(/\s+Input$/i, '').trim()}`;
  const dest = snapshot.destinations.find((d) => d.id === destId);
  if (!dest || !dest.assignedSourceId) return value;
  const src = snapshot.sources.find((s) => s.id === dest.assignedSourceId);
  return src ? src.name : value;
}

function formatHistoryFieldChange(
  change: FieldChange,
  baseline?: TrackerSnapshot,
  draft?: TrackerSnapshot
): string {
  if (change.field.startsWith('pipAssignment:')) {
    const pipId = change.field.replace(/^pipAssignment:/, '');
    const prevLabel = resolvePipChangeValueLabel(change.previousValue, baseline);
    const newLabel = resolvePipChangeValueLabel(change.newValue, draft);
    return `${change.entityLabel} ${pipId}: ${prevLabel} → ${newLabel}`;
  }
  if (change.entityType === 'destination' && change.field === 'assignedSourceId') {
    return `${change.entityLabel}: ${change.previousValue ?? 'Unrouted'} → ${change.newValue ?? 'Unrouted'}`;
  }
  if (change.entityType === 'source') {
    if (change.field === 'sourceCatalog') {
      return `${change.entityLabel}: None → ${change.newValue ?? change.entityLabel}`;
    }
    if (change.field === 'upstreamSourceId') {
      return `${change.entityLabel} Upstream: ${change.previousValue ?? 'Unassigned'} → ${change.newValue ?? 'Unassigned'}`;
    }
    if (change.field === 'alias') {
      return `${change.entityLabel} Alias: ${change.previousValue ?? 'None'} → ${change.newValue ?? 'None'}`;
    }
  }
  if (change.entityType === 'assignment') {
    return change.description;
  }
  return `${change.entityLabel} ${change.description}`;
}

/**
 * Generates one HistoryEntry per changed entity from a ChangeSet.
 */
export function changeSetToHistoryEntries(
  changeSet: ChangeSet,
  operator?: { id: string; displayName: string } | null,
  baseline?: TrackerSnapshot,
  draft?: TrackerSnapshot
): HistoryEntry[] {
  if (!changeSet.changes || changeSet.changes.length === 0) {
    return [];
  }

  const groupedByEntity = new Map<string, FieldChange[]>();
  for (const change of changeSet.changes) {
    const key = `${change.entityType}:${change.entityId}`;
    const existing = groupedByEntity.get(key) ?? [];
    existing.push(change);
    groupedByEntity.set(key, existing);
  }

  const operatorName = operator?.displayName?.trim() || 'Unknown Operator';
  const entries: HistoryEntry[] = [];
  let index = 0;

  for (const [, entityChanges] of groupedByEntity) {
    index++;
    const first = entityChanges[0];
    const entityType = classifyEntityHistoryType(entityChanges);
    const action = classifyEntityHistoryAction(entityChanges);
    const summary = entityChanges
      .map((c) => formatHistoryFieldChange(c, baseline, draft))
      .join('; ');

    entries.push({
      id: `hist_${changeSet.id}_${index}`,
      timestamp: changeSet.timestamp,
      operator: operatorName,
      entityType,
      entityId: first.entityLabel || first.entityId,
      action,
      summary,
    });
  }

  return entries;
}

/**
 * Combines two sets of HistoryEntry records, deduplicates by id, sorts newest first by timestamp,
 * and trims the oldest entries to enforce the cap (default 500).
 */
export function mergeHistoryEntries(
  existing: readonly HistoryEntry[] | undefined | null,
  incoming: readonly HistoryEntry[] | undefined | null,
  maxEntries: number = MAX_HISTORY_ENTRIES
): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();

  for (const entry of existing ?? []) {
    if (entry && typeof entry.id === 'string') {
      byId.set(entry.id, entry);
    }
  }
  for (const entry of incoming ?? []) {
    if (entry && typeof entry.id === 'string') {
      byId.set(entry.id, entry);
    }
  }

  const combined = Array.from(byId.values());
  combined.sort((a, b) => {
    const timeA = Date.parse(a.timestamp);
    const timeB = Date.parse(b.timestamp);
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
      return timeB - timeA;
    }
    return b.timestamp.localeCompare(a.timestamp);
  });

  return combined.slice(0, maxEntries);
}

/**
 * Merges the history arrays of two TrackerSnapshots (e.g., local and remote),
 * combining entries, deduplicating by id, sorting newest first by timestamp,
 * and capping at MAX_HISTORY_ENTRIES (500).
 */
export function mergeSnapshotHistory(
  targetSnapshot: TrackerSnapshot,
  otherSnapshot: TrackerSnapshot,
  maxEntries: number = MAX_HISTORY_ENTRIES
): TrackerSnapshot {
  return {
    ...targetSnapshot,
    history: mergeHistoryEntries(targetSnapshot.history, otherSnapshot.history, maxEntries),
  };
}

/**
 * Appends new HistoryEntry items generated from a ChangeSet to an existing history array,
 * sorted newest first and capped at MAX_HISTORY_ENTRIES (500).
 */
export function appendHistoryEntries(
  existing: readonly HistoryEntry[] | undefined | null,
  changeSet: ChangeSet,
  operator?: { id: string; displayName: string } | null,
  maxEntries: number = MAX_HISTORY_ENTRIES,
  baseline?: TrackerSnapshot,
  draft?: TrackerSnapshot
): HistoryEntry[] {
  const newEntries = changeSetToHistoryEntries(changeSet, operator, baseline, draft);
  return mergeHistoryEntries(existing, newEntries, maxEntries);
}
