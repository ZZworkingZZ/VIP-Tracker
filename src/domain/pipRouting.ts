/**
 * Pure Domain Multiview Input / PIP / Output Routing Logic
 *
 * Models the broadcast multiview unidirectional hierarchy:
 * Routed Source -> MV Input / Router Destination -> PIP belonging to an MV Output
 *
 * Invariant:
 * Output ID + PIP ID -> MV Input / Router Destination ID or null
 *
 * Strictly pure TypeScript: Zero React or DOM dependencies.
 */

import { MultiviewOutput, Destination, Source } from './models';
import { PipId, DestinationId, createPipId, createDestinationId } from './identifiers';
import { LayoutDefinition, getLayoutPips } from './layoutDefinitions';

export interface PipDisplayData {
  pipId: PipId;
  assignedDestinationId: DestinationId | null;
  assignedDestination: Destination | null;
  routedSource: Source | null;
  isAssigned: boolean;
  hasRoutedSource: boolean;
}

/**
 * Safely resolves the assigned MV Input ID for a given PIP on an output.
 * Returns null if the PIP is unassigned. Never fabricates a placeholder.
 */
export function getPipAssignment(
  output: MultiviewOutput,
  pipId: PipId
): DestinationId | null {
  if (!output.pipAssignments) {
    return null;
  }
  return output.pipAssignments[pipId] ?? null;
}

/**
 * Normalizes output pipAssignments.
 * If pipAssignments exists, it is preserved and (if a layout is provided) pruned of any PIPs
 * that no longer exist in the layout geometry.
 * If pipAssignments does not exist, it safely migrates from legacy destinationStart / destinationEnd
 * without data loss or fabrication.
 */
export function normalizeOutputPipAssignments(
  output: MultiviewOutput,
  layout?: LayoutDefinition | null
): Record<PipId, DestinationId | null> {
  const normalized: Record<PipId, DestinationId | null> = {};

  if (output.pipAssignments) {
    const validPipIds = layout ? new Set(getLayoutPips(layout).map((p) => p.pipId)) : null;

    for (const [key, val] of Object.entries(output.pipAssignments)) {
      const pipId = key as PipId;
      if (validPipIds && !validPipIds.has(pipId)) {
        // Prune PIPs that no longer exist in the active layout
        continue;
      }
      normalized[pipId] = val ?? null;
    }

    // Ensure all PIPs in layout are represented (unassigned PIPs explicitly null)
    if (layout) {
      for (const p of getLayoutPips(layout)) {
        if (!(p.pipId in normalized)) {
          normalized[p.pipId] = null;
        }
      }
    }

    return normalized;
  }

  // Legacy normalization fallback:
  // If output has layout and destinationStart/destinationEnd, populate mapped range
  if (layout && output.destinationStart !== null && output.destinationStart !== undefined) {
    const end = output.destinationEnd ?? output.destinationStart + layout.windowCount - 1;
    const pips = getLayoutPips(layout);

    for (let i = 0; i < pips.length; i++) {
      const destNumber = output.destinationStart + i;
      const pipId = pips[i].pipId;

      if (destNumber <= end) {
        normalized[pipId] = createDestinationId(output.multiviewId, destNumber);
      } else {
        normalized[pipId] = null;
      }
    }
    return normalized;
  }

  if (layout) {
    for (const p of getLayoutPips(layout)) {
      normalized[p.pipId] = null;
    }
  }

  return normalized;
}

/**
 * Assigns an MV Input / Router Destination to a specific PIP within an MV Output.
 * Within the same MV Output, enforces one-input-to-one-PIP: if the destination was already
 * assigned to a different PIP on this output, that previous PIP is cleared back to null.
 * Pure function: returns a new MultiviewOutput.
 */
export function assignPipInput(
  output: MultiviewOutput,
  pipId: PipId,
  destinationId: DestinationId | null,
  layout?: LayoutDefinition | null
): MultiviewOutput {
  const current = normalizeOutputPipAssignments(output, layout);
  const updated: Record<PipId, DestinationId | null> = { ...current };

  if (destinationId) {
    // Conflict resolution within same output: clear prior occurrence
    for (const [pId, dest] of Object.entries(updated)) {
      if (dest === destinationId && pId !== pipId) {
        updated[pId as PipId] = null;
      }
    }
  }

  updated[pipId] = destinationId;

  return {
    ...output,
    pipAssignments: updated,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Clears an assigned MV Input from a PIP, restoring it explicitly to null.
 * Pure function: returns a new MultiviewOutput.
 */
export function clearPipInput(
  output: MultiviewOutput,
  pipId: PipId,
  layout?: LayoutDefinition | null
): MultiviewOutput {
  return assignPipInput(output, pipId, null, layout);
}

/**
 * Moves an MV Input assignment from one PIP to another within the same MV Output.
 * The destination PIP receives the MV Input, and the source PIP is cleared to null.
 * Pure function: returns a new MultiviewOutput.
 */
export function movePipInput(
  output: MultiviewOutput,
  fromPipId: PipId,
  toPipId: PipId,
  layout?: LayoutDefinition | null
): MultiviewOutput {
  if (fromPipId === toPipId) {
    return output;
  }

  const current = normalizeOutputPipAssignments(output, layout);
  const sourceDest = current[fromPipId] ?? null;

  const updated: Record<PipId, DestinationId | null> = { ...current };
  // If toPipId already had an input or sourceDest was elsewhere, clean up
  if (sourceDest) {
    for (const [pId, dest] of Object.entries(updated)) {
      if (dest === sourceDest) {
        updated[pId as PipId] = null;
      }
    }
  }

  updated[toPipId] = sourceDest;
  updated[fromPipId] = null;

  return {
    ...output,
    pipAssignments: updated,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Handles layout changes on an output.
 * Retains existing PIP assignments for PIPs that still exist in the new layout geometry.
 * Prunes assignments for PIPs that no longer exist.
 * Never fabricates assignments for new unassigned PIPs (they remain explicitly null).
 * Pure function: returns a new MultiviewOutput.
 */
export function handleOutputLayoutChange(
  output: MultiviewOutput,
  newLayout: LayoutDefinition | null
): MultiviewOutput {
  if (!newLayout) {
    return {
      ...output,
      layoutName: null,
      pipAssignments: {},
      status: 'Available',
      updatedAt: new Date().toISOString(),
    };
  }

  const current = normalizeOutputPipAssignments(output, null);
  const newPips = getLayoutPips(newLayout);
  const updated: Record<PipId, DestinationId | null> = {};

  for (const p of newPips) {
    updated[p.pipId] = current[p.pipId] ?? null;
  }

  return {
    ...output,
    layoutName: newLayout.name,
    pipAssignments: updated,
    status: 'Assigned',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resolves full display details for a PIP on an output, linking the assigned Destination
 * and its routed Source.
 */
export function getPipDisplayData(
  output: MultiviewOutput,
  pipId: PipId,
  destinations: readonly Destination[],
  sources: readonly Source[]
): PipDisplayData {
  const assignedDestinationId = getPipAssignment(output, pipId);

  if (!assignedDestinationId) {
    return {
      pipId,
      assignedDestinationId: null,
      assignedDestination: null,
      routedSource: null,
      isAssigned: false,
      hasRoutedSource: false,
    };
  }

  const destination = destinations.find((d) => d.id === assignedDestinationId) ?? null;
  const routedSource = destination?.assignedSourceId
    ? sources.find((s) => s.id === destination.assignedSourceId) ?? null
    : null;

  return {
    pipId,
    assignedDestinationId,
    assignedDestination: destination,
    routedSource,
    isAssigned: true,
    hasRoutedSource: Boolean(routedSource),
  };
}
