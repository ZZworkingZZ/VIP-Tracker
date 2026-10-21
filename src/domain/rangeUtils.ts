import { MultiviewOutput, Destination, Source } from './models';
import { MultiviewId } from './identifiers';
import { VERIFIED_MULTIVIEWS } from './constants';

export interface DestructiveLayoutReductionWarning {
  isReduction: boolean;
  oldWindowCount: number;
  newWindowCount: number;
  removedDestinationNumbers: number[];
  affectedDestinationsWithSources: {
    destinationNumber: number;
    sourceName: string;
  }[];
}

/**
 * Finds the next available contiguous block of destination numbers on a multiview frame.
 */
export function findNextAvailableDestinationRange(
  multiviewId: MultiviewId,
  windowCount: number,
  outputs: MultiviewOutput[],
  excludeOutputId?: string
): { start: number; end: number } | null {
  const mvMeta = VERIFIED_MULTIVIEWS.find((mv) => mv.id === multiviewId);
  const capacity = mvMeta?.destinationCapacity ?? 64;

  // Mark all currently covered destination numbers
  const covered = new Set<number>();
  for (const out of outputs) {
    if (out.id === excludeOutputId) continue;
    if (
      out.multiviewId === multiviewId &&
      out.destinationStart !== null &&
      out.destinationEnd !== null
    ) {
      for (let n = out.destinationStart; n <= out.destinationEnd; n++) {
        covered.add(n);
      }
    }
  }

  // Find first contiguous window of size `windowCount`
  for (let candidateStart = 1; candidateStart <= capacity - windowCount + 1; candidateStart++) {
    let contiguous = true;
    for (let offset = 0; offset < windowCount; offset++) {
      if (covered.has(candidateStart + offset)) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) {
      return {
        start: candidateStart,
        end: candidateStart + windowCount - 1,
      };
    }
  }

  return null;
}

/**
 * Inspects whether changing an output's layout will truncate destinations that have assigned sources.
 */
export function checkDestructiveLayoutReduction(
  output: MultiviewOutput,
  newWindowCount: number,
  allDestinations: Destination[],
  allSources: Source[]
): DestructiveLayoutReductionWarning {
  if (output.destinationStart === null || output.destinationEnd === null) {
    return {
      isReduction: false,
      oldWindowCount: 0,
      newWindowCount,
      removedDestinationNumbers: [],
      affectedDestinationsWithSources: [],
    };
  }

  const oldWindowCount = output.destinationEnd - output.destinationStart + 1;
  if (newWindowCount >= oldWindowCount) {
    return {
      isReduction: false,
      oldWindowCount,
      newWindowCount,
      removedDestinationNumbers: [],
      affectedDestinationsWithSources: [],
    };
  }

  const newEnd = output.destinationStart + newWindowCount - 1;
  const sourceMap = new Map(allSources.map((s) => [s.id, s.name]));

  const removedDestinationNumbers: number[] = [];
  const affectedDestinationsWithSources: { destinationNumber: number; sourceName: string }[] = [];

  for (let dNum = newEnd + 1; dNum <= output.destinationEnd; dNum++) {
    removedDestinationNumbers.push(dNum);
    const dest = allDestinations.find(
      (d) => d.multiviewId === output.multiviewId && d.destinationNumber === dNum
    );
    if (dest && dest.assignedSourceId) {
      affectedDestinationsWithSources.push({
        destinationNumber: dNum,
        sourceName: sourceMap.get(dest.assignedSourceId) ?? dest.assignedSourceId,
      });
    }
  }

  return {
    isReduction: true,
    oldWindowCount,
    newWindowCount,
    removedDestinationNumbers,
    affectedDestinationsWithSources,
  };
}
