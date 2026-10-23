import { Multiview, MultiviewOutput, Destination, Source, ValidationFinding } from './models';
import { formatOutputDisplay, formatDestinationDisplay } from './identifiers';

/**
 * Validates the complete operational snapshot and returns structured findings.
 * Validation never mutates or normalizes the underlying data.
 */
export function validateSnapshot(
  multiviews: Multiview[],
  outputs: MultiviewOutput[],
  destinations: Destination[],
  sources: Source[]
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const mvMap = new Map<string, Multiview>(multiviews.map((mv) => [mv.id, mv]));
  const sourceIdSet = new Set<string>(sources.map((s) => s.id));

  // 1 & 2: Output validations
  for (const out of outputs) {
    const mv = mvMap.get(out.multiviewId);
    if (!mv) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'UNKNOWN_MULTIVIEW',
        message: `Output ${formatOutputDisplay(out.id)} references unknown multiview ${out.multiviewId}.`,
        entityType: 'output',
        entityId: out.id,
        relatedEntityIds: [],
      });
      continue;
    }

    // 2: Output number outside capacity
    if (out.outputNumber < 1 || out.outputNumber > mv.outputCapacity) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'OUTPUT_NUMBER_OUT_OF_CAPACITY',
        message: `Output number ${out.outputNumber} on ${out.multiviewId} exceeds output capacity of ${mv.outputCapacity}.`,
        entityType: 'output',
        entityId: out.id,
        relatedEntityIds: [mv.id],
      });
    }

    const hasStart = out.destinationStart !== null && out.destinationStart !== undefined;
    const hasEnd = out.destinationEnd !== null && out.destinationEnd !== undefined;
    const hasLayout = Boolean(out.layoutName && out.layoutName.trim());
    const hasAssignment = Boolean(out.assignmentName && out.assignmentName.trim());

    // 7: Layout present without destination mapping
    if (hasLayout && (!hasStart || !hasEnd)) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'LAYOUT_WITHOUT_RANGE',
        message: `Output ${formatOutputDisplay(out.id)} has layout '${out.layoutName}' but lacks destination mapping.`,
        entityType: 'output',
        entityId: out.id,
        relatedEntityIds: [],
      });
    }

    // 8: Destination mapping present without layout
    if ((hasStart || hasEnd) && !hasLayout) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'RANGE_WITHOUT_LAYOUT',
        message: `Output ${formatOutputDisplay(out.id)} has mapped destinations but no layout assigned.`,
        entityType: 'output',
        entityId: out.id,
        relatedEntityIds: [],
      });
    }

    // 9: Assignment name present without layout or range
    if (hasAssignment && (!hasLayout || !hasStart || !hasEnd)) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'warning',
        code: 'ASSIGNMENT_WITHOUT_LAYOUT_OR_RANGE',
        message: `Output ${formatOutputDisplay(out.id)} has assignment '${out.assignmentName}' but missing layout or destination mapping.`,
        entityType: 'output',
        entityId: out.id,
        relatedEntityIds: [],
      });
    }

    // Range checks
    if (hasStart && hasEnd && out.destinationStart !== null && out.destinationEnd !== null) {
      // 4: Destination start greater than destination end
      if (out.destinationStart > out.destinationEnd) {
        findings.push({
          id: `finding-${findings.length + 1}`,
          severity: 'error',
          code: 'DESTINATION_START_GREATER_THAN_END',
          message: `Output ${formatOutputDisplay(out.id)} destination start (${out.destinationStart}) is greater than end (${out.destinationEnd}).`,
          entityType: 'output',
          entityId: out.id,
          relatedEntityIds: [],
        });
      }

      // 5: Destination outside multiview capacity
      if (
        out.destinationStart < 1 ||
        out.destinationEnd > mv.inputCapacity ||
        out.destinationStart > mv.inputCapacity
      ) {
        findings.push({
          id: `finding-${findings.length + 1}`,
          severity: 'error',
          code: 'DESTINATION_RANGE_OUT_OF_CAPACITY',
          message: `Output ${formatOutputDisplay(out.id)} mapped destinations (${out.destinationStart}-${out.destinationEnd}) exceed input capacity (${mv.inputCapacity}).`,
          entityType: 'output',
          entityId: out.id,
          relatedEntityIds: [mv.id],
        });
      }

      // 12: Box count mismatch warning
      if (hasLayout && out.layoutName) {
        const match = out.layoutName.match(/^(\d+)\s*BOX/i);
        if (match) {
          const declaredBoxes = parseInt(match[1], 10);
          const inclusiveRangeSize = out.destinationEnd - out.destinationStart + 1;
          if (declaredBoxes !== inclusiveRangeSize) {
            findings.push({
              id: `finding-${findings.length + 1}`,
              severity: 'warning',
              code: 'BOX_COUNT_RANGE_MISMATCH',
              message: `Output ${formatOutputDisplay(out.id)} layout '${out.layoutName}' declares ${declaredBoxes} boxes, but mapped destinations ${out.destinationStart}-${out.destinationEnd} span ${inclusiveRangeSize} destination(s).`,
              entityType: 'output',
              entityId: out.id,
              relatedEntityIds: [],
            });
          }
        }
      }
    }

    // 11: Locked assignment has incomplete tracking information
    if (out.locked) {
      if (!out.assignmentName || !out.layoutName || !hasStart || !hasEnd) {
        findings.push({
          id: `finding-${findings.length + 1}`,
          severity: 'warning',
          code: 'LOCKED_ASSIGNMENT_INCOMPLETE_TRACKING',
          message: `Locked output ${formatOutputDisplay(out.id)} is missing complete tracking details (assignment, layout, or destination mapping).`,
          entityType: 'output',
          entityId: out.id,
          relatedEntityIds: [],
        });
      }
    }

    // Naming pattern observation (e.g. HOH-WKB vs HOH_WKB)
    if (out.assignmentName && /HOH[-_]WKB/i.test(out.assignmentName)) {
      if (out.assignmentName.includes('_')) {
        findings.push({
          id: `finding-${findings.length + 1}`,
          severity: 'info',
          code: 'NAMING_INCONSISTENCY',
          message: `Output ${formatOutputDisplay(out.id)} uses underscore naming ('${out.assignmentName}'). Related outputs use hyphen naming ('HOH-WKB-01'). Preserved raw value.`,
          entityType: 'output',
          entityId: out.id,
          relatedEntityIds: [],
        });
      }
    }
  }

  // 6: Overlapping assigned output ranges on the same multiview
  const outputsByMv = new Map<string, MultiviewOutput[]>();
  for (const out of outputs) {
    if (!outputsByMv.has(out.multiviewId)) {
      outputsByMv.set(out.multiviewId, []);
    }
    outputsByMv.get(out.multiviewId)!.push(out);
  }

  for (const [mvId, mvOutputs] of outputsByMv.entries()) {
    const rangedOutputs = mvOutputs.filter(
      (o) =>
        o.destinationStart !== null &&
        o.destinationEnd !== null &&
        o.destinationStart <= o.destinationEnd
    );

    for (let i = 0; i < rangedOutputs.length; i++) {
      for (let j = i + 1; j < rangedOutputs.length; j++) {
        const a = rangedOutputs[i];
        const b = rangedOutputs[j];
        const overlap =
          Math.max(a.destinationStart!, b.destinationStart!) <=
          Math.min(a.destinationEnd!, b.destinationEnd!);
        if (overlap) {
          findings.push({
            id: `finding-${findings.length + 1}`,
            severity: 'error',
            code: 'OVERLAPPING_OUTPUT_RANGES',
            message: `Overlapping mapped destinations on ${mvId}: ${formatOutputDisplay(a.id)} (${a.destinationStart}-${a.destinationEnd}) and ${formatOutputDisplay(b.id)} (${b.destinationStart}-${b.destinationEnd}).`,
            entityType: 'output',
            entityId: a.id,
            relatedEntityIds: [b.id, mvId],
          });
        }
      }
    }
  }

  // 3 & 10: Destination validations
  for (const dest of destinations) {
    const mv = mvMap.get(dest.multiviewId);
    if (!mv) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'UNKNOWN_MULTIVIEW',
        message: `Destination ${formatDestinationDisplay(dest.id)} references unknown multiview ${dest.multiviewId}.`,
        entityType: 'destination',
        entityId: dest.id,
        relatedEntityIds: [],
      });
      continue;
    }

    if (dest.destinationNumber < 1 || dest.destinationNumber > mv.inputCapacity) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'DESTINATION_NUMBER_OUT_OF_CAPACITY',
        message: `Destination ${dest.destinationNumber} on ${dest.multiviewId} exceeds capacity of ${mv.inputCapacity}.`,
        entityType: 'destination',
        entityId: dest.id,
        relatedEntityIds: [mv.id],
      });
    }

    if (dest.assignedSourceId && !sourceIdSet.has(dest.assignedSourceId)) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'DESTINATION_UNKNOWN_SOURCE',
        message: `Destination ${formatDestinationDisplay(dest.id)} references unknown source ID ${dest.assignedSourceId}.`,
        entityType: 'destination',
        entityId: dest.id,
        relatedEntityIds: [],
      });
    }
  }

  // 13: Source graph validations
  const directSelfRouteSources = new Set<string>();
  const reportedCycleKeys = new Set<string>();
  const sourceLookup = new Map<string, Source>(sources.map((s) => [s.id, s]));

  for (const source of sources) {
    if (!source.upstreamSourceId) {
      continue;
    }

    // Direct self-route check
    if (source.upstreamSourceId === source.id) {
      directSelfRouteSources.add(source.id);
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'SOURCE_SELF_ROUTING',
        message: `Source '${source.name}' (${source.id}) is routed directly into itself.`,
        entityType: 'source',
        entityId: source.id,
        relatedEntityIds: [source.id],
      });
      continue;
    }

    // Unknown upstream reference check
    if (!sourceIdSet.has(source.upstreamSourceId)) {
      findings.push({
        id: `finding-${findings.length + 1}`,
        severity: 'error',
        code: 'SOURCE_UNKNOWN_UPSTREAM',
        message: `Source '${source.name}' (${source.id}) references unknown upstream source ID '${source.upstreamSourceId}'.`,
        entityType: 'source',
        entityId: source.id,
        relatedEntityIds: [source.upstreamSourceId],
      });
      continue;
    }
  }

  // Indirect circular routing check (with deduplication)
  for (const startSource of sources) {
    if (directSelfRouteSources.has(startSource.id)) {
      continue;
    }

    const path: string[] = [];
    const pathSet = new Set<string>();
    let current: Source | undefined = startSource;

    while (current && current.upstreamSourceId) {
      // Direct self-route aborted (already handled)
      if (current.upstreamSourceId === current.id) {
        break;
      }

      // Dangling upstream aborted (already handled)
      if (!sourceLookup.has(current.upstreamSourceId)) {
        break;
      }

      path.push(current.id);
      pathSet.add(current.id);

      const nextId = current.upstreamSourceId;
      if (pathSet.has(nextId)) {
        // Cycle detected
        const cycleStartIndex = path.indexOf(nextId);
        const cycleNodes = path.slice(cycleStartIndex);

        if (cycleNodes.length > 1) {
          const canonicalKey = [...cycleNodes].sort().join('|');
          if (!reportedCycleKeys.has(canonicalKey)) {
            reportedCycleKeys.add(canonicalKey);

            const cycleNames = cycleNodes.map((id) => sourceLookup.get(id)?.name ?? id).join(' → ');

            findings.push({
              id: `finding-${findings.length + 1}`,
              severity: 'error',
              code: 'SOURCE_CIRCULAR_ROUTING',
              message: `Circular source routing detected: ${cycleNames} → ${sourceLookup.get(nextId)?.name ?? nextId}.`,
              entityType: 'source',
              entityId: cycleNodes[0],
              relatedEntityIds: cycleNodes.slice(1),
            });
          }
        }
        break;
      }

      current = sourceLookup.get(nextId);
    }
  }

  return findings;
}
