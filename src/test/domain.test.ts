import { describe, it, expect } from 'vitest';
import {
  VERIFIED_MULTIVIEWS,
  TOTAL_EXPECTED_MULTIVIEWS,
  TOTAL_EXPECTED_OUTPUTS,
  TOTAL_EXPECTED_DESTINATIONS,
  deriveInputRange,
} from '../domain/constants';
import {
  createOutputId,
  createDestinationId,
  createSourceId,
  createAssignmentId,
  formatOutputDisplay,
  formatDestinationDisplay,
  MultiviewId,
  OutputId,
  DestinationId,
  SourceId,
} from '../domain/identifiers';
import { validateSnapshot } from '../domain/validation';
import {
  selectDashboardTotals,
  selectMultiviewSummaries,
  selectDestinationsForMultiview,
  selectGroupedProductions,
  selectFilteredSources,
} from '../domain/selectors';
import { parseSourcesCsv } from '../services/csv/parseSourcesCsv';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { SEED_SOURCES } from '../data/seed/sources';
import { mockMultiviews, mockSources } from './fixtures';
import { MultiviewOutput, Destination, TrackerSnapshot, Source } from '../domain/models';
import {
  resolveSignalFlow,
  formatSignalFlowChain,
  previewUpstreamSignalFlow,
  formatCyclePath,
  DEFAULT_MAX_SIGNAL_FLOW_DEPTH,
} from '../domain/signalFlow';
import {
  inferSourceType,
  isOriginatingSource,
  isProcessingSource,
  isVirtualSource,
} from '../domain/sourceCategories';

describe('Domain Models & Capacities', () => {
  it('has authoritative verified multiview capacities', () => {
    expect(VERIFIED_MULTIVIEWS.length).toBe(TOTAL_EXPECTED_MULTIVIEWS);

    const mv1 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-01')!;
    const mv2 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-02')!;
    const mv3 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-03')!;
    const mv4 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-04')!;
    const mv5 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-05')!;

    expect(mv1.inputCapacity).toBe(36);
    expect(mv1.outputCapacity).toBe(4);

    expect(mv2.inputCapacity).toBe(36);
    expect(mv2.outputCapacity).toBe(4);

    expect(mv3.inputCapacity).toBe(64);
    expect(mv3.outputCapacity).toBe(8);

    expect(mv4.inputCapacity).toBe(64);
    expect(mv4.outputCapacity).toBe(8);

    expect(mv5.inputCapacity).toBe(64);
    expect(mv5.outputCapacity).toBe(8);

    const totalOutputs = VERIFIED_MULTIVIEWS.reduce((sum, mv) => sum + mv.outputCapacity, 0);
    const totalDestinations = VERIFIED_MULTIVIEWS.reduce((sum, mv) => sum + mv.inputCapacity, 0);

    expect(totalOutputs).toBe(TOTAL_EXPECTED_OUTPUTS);
    expect(totalDestinations).toBe(TOTAL_EXPECTED_DESTINATIONS);
  });

  it('correctly resolves authoritative Input Range for MV-01 through MV-05 and derives on-the-fly without stored state', () => {
    // MV-01 has 36 inputs: MV-01-01 through MV-01-36
    expect(deriveInputRange('MV-01')).toBe('MV-01-01 through MV-01-36');
    // MV-02 has 36 inputs: MV-02-01 through MV-02-36
    expect(deriveInputRange('MV-02')).toBe('MV-02-01 through MV-02-36');
    // MV-03 has 64 inputs: MV-03-01 through MV-03-64
    expect(deriveInputRange('MV-03')).toBe('MV-03-01 through MV-03-64');
    // MV-04 has 64 inputs: MV-04-01 through MV-04-64
    expect(deriveInputRange('MV-04')).toBe('MV-04-01 through MV-04-64');
    // MV-05 has 64 inputs: MV-05-01 through MV-05-64
    expect(deriveInputRange('MV-05')).toBe('MV-05-01 through MV-05-64');

    // Confirm inputRange is NOT stored as state on Multiview records
    VERIFIED_MULTIVIEWS.forEach((mv) => {
      expect('inputRange' in mv).toBe(false);
      expect(mv.inputCapacity).toBeGreaterThan(0);
    });

    INITIAL_SNAPSHOT.multiviews.forEach((mv) => {
      expect('inputRange' in mv).toBe(false);
      expect(mv.inputCapacity).toBeGreaterThan(0);
    });

    // Proves that missing or unknown MV IDs fail loudly during development rather than guessing fallbacks
    expect(() => deriveInputRange('MV-99' as MultiviewId)).toThrow(
      'Authoritative configuration missing for multiview: MV-99'
    );
  });

  it('preserves individual VIP input/destination IDs without alteration', () => {
    // MV-01: 36 inputs (DEST:MV-01-01 to DEST:MV-01-36)
    const mv1Dests = INITIAL_SNAPSHOT.destinations.filter((d) => d.multiviewId === 'MV-01');
    expect(mv1Dests.length).toBe(36);
    expect(mv1Dests[0].id).toBe('DEST:MV-01-01');
    expect(mv1Dests[35].id).toBe('DEST:MV-01-36');

    // MV-02: 36 inputs (DEST:MV-02-01 to DEST:MV-02-36)
    const mv2Dests = INITIAL_SNAPSHOT.destinations.filter((d) => d.multiviewId === 'MV-02');
    expect(mv2Dests.length).toBe(36);
    expect(mv2Dests[0].id).toBe('DEST:MV-02-01');
    expect(mv2Dests[35].id).toBe('DEST:MV-02-36');

    // MV-03: 64 inputs (DEST:MV-03-01 to DEST:MV-03-64)
    const mv3Dests = INITIAL_SNAPSHOT.destinations.filter((d) => d.multiviewId === 'MV-03');
    expect(mv3Dests.length).toBe(64);
    expect(mv3Dests[0].id).toBe('DEST:MV-03-01');
    expect(mv3Dests[63].id).toBe('DEST:MV-03-64');

    // MV-04: 64 inputs (DEST:MV-04-01 to DEST:MV-04-64)
    const mv4Dests = INITIAL_SNAPSHOT.destinations.filter((d) => d.multiviewId === 'MV-04');
    expect(mv4Dests.length).toBe(64);
    expect(mv4Dests[0].id).toBe('DEST:MV-04-01');
    expect(mv4Dests[63].id).toBe('DEST:MV-04-64');

    // MV-05: 64 inputs (DEST:MV-05-01 to DEST:MV-05-64)
    const mv5Dests = INITIAL_SNAPSHOT.destinations.filter((d) => d.multiviewId === 'MV-05');
    expect(mv5Dests.length).toBe(64);
    expect(mv5Dests[0].id).toBe('DEST:MV-05-01');
    expect(mv5Dests[63].id).toBe('DEST:MV-05-64');

    // Total destinations must be exactly 264
    expect(INITIAL_SNAPSHOT.destinations.length).toBe(264);
  });

  it('generates distinct, typed identifiers and display formatting', () => {
    const outId = createOutputId('MV-04', 2);
    const destId = createDestinationId('MV-04', 37);
    const srcId = createSourceId('CAM 1');
    const assignId = createAssignmentId('BR ALERT 1');

    expect(outId).toBe('OUT:MV-04-02');
    expect(destId).toBe('DEST:MV-04-37');
    expect(srcId).toBe('SRC:CAM_1');
    expect(assignId).toBe('ASSIGN:BR_ALERT_1');

    expect(formatOutputDisplay(outId)).toBe('MV-04-02');
    expect(formatDestinationDisplay(destId)).toBe('MV-04-37');
  });
});

describe('Validation Engine', () => {
  it('detects unknown multiview references', () => {
    const badOutput: MultiviewOutput = {
      id: 'OUT:MV-99-01' as unknown as OutputId,
      multiviewId: 'MV-99' as unknown as MultiviewId,
      outputNumber: 1,
      layoutName: null,
      destinationStart: null,
      destinationEnd: null,
      assignmentName: null,
      notes: null,
      status: 'Available',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [badOutput], [], []);
    expect(findings.some((f) => f.code === 'UNKNOWN_MULTIVIEW')).toBe(true);
  });

  it('detects output and destination numbers outside capacity', () => {
    const badOutput: MultiviewOutput = {
      id: 'OUT:MV-01-05' as OutputId,
      multiviewId: 'MV-01',
      outputNumber: 5, // MV-01 capacity is 4
      layoutName: null,
      destinationStart: null,
      destinationEnd: null,
      assignmentName: null,
      notes: null,
      status: 'Available',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const badDest: Destination = {
      id: 'DEST:MV-01-40' as DestinationId,
      multiviewId: 'MV-01',
      destinationNumber: 40, // MV-01 capacity is 36
      assignedSourceId: null,
      assignmentName: null,
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [badOutput], [badDest], []);
    expect(findings.some((f) => f.code === 'OUTPUT_NUMBER_OUT_OF_CAPACITY')).toBe(true);
    expect(findings.some((f) => f.code === 'DESTINATION_NUMBER_OUT_OF_CAPACITY')).toBe(true);
  });

  it('detects destination start greater than destination end', () => {
    const badRangeOutput: MultiviewOutput = {
      id: 'OUT:MV-01-01',
      multiviewId: 'MV-01',
      outputNumber: 1,
      layoutName: '4 BOX',
      destinationStart: 10,
      destinationEnd: 5,
      assignmentName: 'TEST',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [badRangeOutput], [], []);
    expect(findings.some((f) => f.code === 'DESTINATION_START_GREATER_THAN_END')).toBe(true);
  });

  it('detects mapped destinations exceeding multiview capacity', () => {
    const overflowOutput: MultiviewOutput = {
      id: 'OUT:MV-01-01',
      multiviewId: 'MV-01',
      outputNumber: 1,
      layoutName: '4 BOX',
      destinationStart: 30,
      destinationEnd: 40, // MV-01 has 36 destinations
      assignmentName: 'TEST',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [overflowOutput], [], []);
    expect(findings.some((f) => f.code === 'DESTINATION_RANGE_OUT_OF_CAPACITY')).toBe(true);
  });

  it('detects overlapping mapped destinations on the same multiview', () => {
    const out1: MultiviewOutput = {
      id: 'OUT:MV-02-01',
      multiviewId: 'MV-02',
      outputNumber: 1,
      layoutName: '4 BOX',
      destinationStart: 1,
      destinationEnd: 10,
      assignmentName: 'ASSIGN A',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };
    const out2: MultiviewOutput = {
      id: 'OUT:MV-02-02',
      multiviewId: 'MV-02',
      outputNumber: 2,
      layoutName: '4 BOX',
      destinationStart: 8,
      destinationEnd: 14,
      assignmentName: 'ASSIGN B',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [out1, out2], [], []);
    expect(findings.some((f) => f.code === 'OVERLAPPING_OUTPUT_RANGES')).toBe(true);
  });

  it('flags box-count mismatch warnings including MV-03-03 preserving seed data', () => {
    const mv3Output: MultiviewOutput = {
      id: 'OUT:MV-03-03',
      multiviewId: 'MV-03',
      outputNumber: 3,
      layoutName: '11 BOX',
      destinationStart: 64,
      destinationEnd: 64, // 1 destination vs 11 BOX
      assignmentName: 'BOB TEST',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [mv3Output], [], []);
    const mismatch = findings.find((f) => f.code === 'BOX_COUNT_RANGE_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('warning');
    expect(mismatch?.message).toContain('11 boxes');
    expect(mismatch?.message).toContain('1 destination');
  });

  it('detects destination referencing unknown source', () => {
    const badDest: Destination = {
      id: 'DEST:MV-01-01',
      multiviewId: 'MV-01',
      destinationNumber: 1,
      assignedSourceId: 'SRC:NON_EXISTENT' as SourceId,
      assignmentName: null,
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const findings = validateSnapshot(mockMultiviews, [], [badDest], mockSources);
    expect(findings.some((f) => f.code === 'DESTINATION_UNKNOWN_SOURCE')).toBe(true);
  });
});

describe('Domain Selectors & Bundled Seed Snapshot', () => {
  it('correctly calculates dashboard totals from snapshot', () => {
    const totals = selectDashboardTotals(INITIAL_SNAPSHOT);

    expect(totals.totalMultiviews).toBe(5);
    expect(totals.totalOutputs).toBe(32);
    expect(totals.assignedOutputs).toBe(15);
    expect(totals.availableOutputs).toBe(17);
    expect(totals.lockedOutputs).toBe(0);
    expect(totals.activeValidationFindings).toBeGreaterThan(0);
  });

  it('selects multiview summaries for all 5 frames', () => {
    const summaries = selectMultiviewSummaries(INITIAL_SNAPSHOT);
    expect(summaries.length).toBe(5);

    const mv1 = summaries.find((s) => s.multiview.id === 'MV-01')!;
    expect(mv1.assignedOutputsCount).toBe(0);
    expect(mv1.availableOutputsCount).toBe(4);

    const mv2 = summaries.find((s) => s.multiview.id === 'MV-02')!;
    expect(mv2.assignedOutputsCount).toBe(4);
    expect(mv2.availableOutputsCount).toBe(0);

    const mv3 = summaries.find((s) => s.multiview.id === 'MV-03')!;
    expect(mv3.assignedOutputsCount).toBe(4);
    expect(mv3.availableOutputsCount).toBe(4);

    const mv4 = summaries.find((s) => s.multiview.id === 'MV-04')!;
    expect(mv4.assignedOutputsCount).toBe(3);
    expect(mv4.availableOutputsCount).toBe(5);

    const mv5 = summaries.find((s) => s.multiview.id === 'MV-05')!;
    expect(mv5.assignedOutputsCount).toBe(4);
    expect(mv5.availableOutputsCount).toBe(4);
  });

  it('selects destinations and derives unambiguous layout assignments', () => {
    const mv2Dests = selectDestinationsForMultiview(INITIAL_SNAPSHOT, 'MV-02');
    expect(mv2Dests.length).toBe(36);

    // Dest 1 is in MV-02-01 range 1-3 (BR ALERT 1)
    const dest1 = mv2Dests.find((d) => d.destination.destinationNumber === 1)!;
    expect(dest1.derivedAssignmentName).toBe('BR ALERT 1');
    expect(dest1.coveringOutput?.layoutName).toBe('6 BOX');
    expect(dest1.isAmbiguous).toBe(false);

    // Dest 7 is not covered by any range on MV-02
    const dest7 = mv2Dests.find((d) => d.destination.destinationNumber === 7)!;
    expect(dest7.derivedAssignmentName).toBeNull();
    expect(dest7.coveringOutput).toBeNull();
  });

  it('flags ambiguous destination ownership when multiple output ranges overlap', () => {
    const overlappingOutput1: MultiviewOutput = {
      id: 'OUT:MV-01-01',
      multiviewId: 'MV-01',
      outputNumber: 1,
      layoutName: '4 BOX',
      destinationStart: 1,
      destinationEnd: 5,
      assignmentName: 'PROD A',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };
    const overlappingOutput2: MultiviewOutput = {
      id: 'OUT:MV-01-02',
      multiviewId: 'MV-01',
      outputNumber: 2,
      layoutName: '4 BOX',
      destinationStart: 4,
      destinationEnd: 8,
      assignmentName: 'PROD B',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const dest4: Destination = {
      id: 'DEST:MV-01-04',
      multiviewId: 'MV-01',
      destinationNumber: 4,
      assignedSourceId: null,
      assignmentName: null,
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const testSnapshot: TrackerSnapshot = {
      multiviews: [VERIFIED_MULTIVIEWS[0]],
      outputs: [overlappingOutput1, overlappingOutput2],
      destinations: [dest4],
      sources: [],
      operationalAssignments: [],
      changeRecords: [],
      validationFindings: [],
      generatedAt: '',
    };

    const dests = selectDestinationsForMultiview(testSnapshot, 'MV-01');
    expect(dests[0].isAmbiguous).toBe(true);
    expect(dests[0].hasConflict).toBe(true);
    expect(dests[0].derivedAssignmentName).toContain('CONFLICT');
  });

  it('groups operational assignments preserving exact raw names (hyphen vs underscore)', () => {
    const groups = selectGroupedProductions(INITIAL_SNAPSHOT);

    // Verified assignments exist
    const hoh1 = groups.find((g) => g.assignmentName === 'HOH-WKB-01');
    const hoh3 = groups.find((g) => g.assignmentName === 'HOH_WKB-03');

    expect(hoh1).toBeDefined();
    expect(hoh3).toBeDefined();

    // Preserved raw naming distinction
    expect(hoh1?.assignmentName).toBe('HOH-WKB-01');
    expect(hoh3?.assignmentName).toBe('HOH_WKB-03');
  });

  it('filters sources in source directory', () => {
    const results = selectFilteredSources(mockSources, 'Virtual Camera', 'CAM');
    expect(results.length).toBe(1);

    const emptyResults = selectFilteredSources(mockSources, 'Test', 'CAM');
    expect(emptyResults.length).toBe(0);
  });
});

describe('CSV Parser', () => {
  it('parses valid CSV layout correctly', () => {
    const sampleCsv = `MV-01,,,MV-02,,,MV-03,,,MV-04,,,MV-05,
Destination,Source,,Destination,Source,,Destination,Source,,Destination,Source,,Destination,Source
MV-01-01,TEST_SRC,,MV-02-01,,,MV-03-01,,,MV-04-01,,,MV-05-01,
MV-01-02,,,MV-02-02,,,MV-03-02,,,MV-04-02,,,MV-05-02,`;

    const result = parseSourcesCsv(sampleCsv);
    expect(result.errors.length).toBe(0);
    expect(result.destinations.length).toBe(10);
    expect(result.sources.length).toBe(1);
    expect(result.sources[0].name).toBe('TEST_SRC');
  });

  it('reports malformed destination format', () => {
    const badCsv = `MV-01,,,MV-02,,,MV-03,,,MV-04,,,MV-05,
Destination,Source,,Destination,Source,,Destination,Source,,Destination,Source,,Destination,Source
INVALID_DEST,,,MV-02-01,,,MV-03-01,,,MV-04-01,,,MV-05-01,`;

    const result = parseSourcesCsv(badCsv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Malformed destination identifier');
  });
});

describe('Source Classification Helpers', () => {
  it('conservatively infers source types based on operational prefixes', () => {
    // Virtual sources (v*)
    expect(inferSourceType('vCam-02')).toBe('virtual');
    expect(inferSourceType('vIngest-01')).toBe('virtual');
    expect(inferSourceType('VCAM 1')).toBe('virtual');
    expect(inferSourceType('vPGM-A')).toBe('virtual');

    // Processing sources (UDX-*)
    expect(inferSourceType('UDX-03')).toBe('processing');
    expect(inferSourceType('UDX_01')).toBe('processing');
    expect(inferSourceType('UDX 4')).toBe('processing');

    // Originating broadcast signals
    expect(inferSourceType('BSP-K1-301')).toBe('originating');
    expect(inferSourceType('CAM 1')).toBe('originating');
    expect(inferSourceType('FS 01')).toBe('originating');
    expect(inferSourceType('TEST BARS')).toBe('originating');
  });

  it('provides reliable type checker helper functions', () => {
    const virtualSrc: Source = {
      id: 'SRC:VCAM_01',
      name: 'vCam-01',
      normalizedName: 'VCAM-01',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: null,
      sourceType: 'virtual',
    };

    const processingSrc: Source = {
      id: 'SRC:UDX_01',
      name: 'UDX-01',
      normalizedName: 'UDX-01',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'processing',
    };

    const originatingSrc: Source = {
      id: 'SRC:BSP_01',
      name: 'BSP-01',
      normalizedName: 'BSP-01',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
    };

    expect(isVirtualSource(virtualSrc)).toBe(true);
    expect(isVirtualSource(processingSrc)).toBe(false);

    expect(isProcessingSource(processingSrc)).toBe(true);
    expect(isProcessingSource(originatingSrc)).toBe(false);

    expect(isOriginatingSource(originatingSrc)).toBe(true);
    expect(isOriginatingSource(virtualSrc)).toBe(false);
  });
});

describe('Iterative Signal Flow Resolution Engine', () => {
  it('resolves direct originating source', () => {
    const bsp: Source = {
      id: 'SRC:BSP_K1_301',
      name: 'BSP-K1-301',
      normalizedName: 'BSP-K1-301',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
    };

    const sources = [bsp];
    const flow = resolveSignalFlow(bsp.id, sources);

    expect(flow.status).toBe('resolved');
    expect(flow.hops).toHaveLength(1);
    expect(flow.hops[0].id).toBe(bsp.id);
    expect(flow.originSource?.id).toBe(bsp.id);
    expect(flow.immediateSource?.id).toBe(bsp.id);
    expect(flow.hasCycle).toBe(false);
    expect(flow.isDangling).toBe(false);
    expect(formatSignalFlowChain(flow)).toBe('BSP-K1-301');
  });

  it('resolves originating → processing → virtual cascade in origin-to-immediate order', () => {
    // BSP-K1-301 -> UDX-03 -> vCam-02
    const bsp: Source = {
      id: 'SRC:BSP_K1_301',
      name: 'BSP-K1-301',
      normalizedName: 'BSP-K1-301',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
    };

    const udx: Source = {
      id: 'SRC:UDX_03',
      name: 'UDX-03',
      normalizedName: 'UDX-03',
      category: 'Other',
      active: true,
      upstreamSourceId: bsp.id,
      sourceType: 'processing',
    };

    const vcam: Source = {
      id: 'SRC:VCAM_02',
      name: 'vCam-02',
      normalizedName: 'VCAM-02',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: udx.id,
      sourceType: 'virtual',
    };

    const sources = [bsp, udx, vcam];
    const flow = resolveSignalFlow(vcam.id, sources);

    expect(flow.status).toBe('resolved');
    expect(flow.hops).toHaveLength(3);
    // Origin-to-immediate order: BSP-K1-301 -> UDX-03 -> vCam-02
    expect(flow.hops[0].id).toBe(bsp.id);
    expect(flow.hops[1].id).toBe(udx.id);
    expect(flow.hops[2].id).toBe(vcam.id);
    expect(flow.originSource?.id).toBe(bsp.id);
    expect(flow.immediateSource?.id).toBe(vcam.id);
    expect(formatSignalFlowChain(flow)).toBe('BSP-K1-301 → UDX-03 → vCam-02');
  });

  it('handles unassigned destination gracefully', () => {
    const flow = resolveSignalFlow(null, []);
    expect(flow.status).toBe('unassigned');
    expect(flow.hops).toHaveLength(0);
    expect(flow.originSource).toBeNull();
    expect(flow.immediateSource).toBeNull();
    expect(flow.hasCycle).toBe(false);
    expect(flow.isDangling).toBe(false);
    expect(formatSignalFlowChain(flow)).toBe('');
  });

  it('detects direct self-routing and prevents infinite loop', () => {
    const selfSrc: Source = {
      id: 'SRC:SELF_01',
      name: 'vCam-Self',
      normalizedName: 'VCAM-SELF',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: 'SRC:SELF_01',
      sourceType: 'virtual',
    };

    const flow = resolveSignalFlow(selfSrc.id, [selfSrc]);
    expect(flow.status).toBe('self_route');
    expect(flow.hasCycle).toBe(true);
    expect(flow.isSelfRoute).toBe(true);
    expect(flow.cycleSourceIds).toEqual([selfSrc.id]);
    expect(flow.hops).toHaveLength(1);
  });

  it('detects indirect circular routing and terminates safely', () => {
    // SRC:A -> SRC:B -> SRC:C -> SRC:A
    const srcA: Source = {
      id: 'SRC:A',
      name: 'Source A',
      normalizedName: 'SOURCE A',
      category: 'Other',
      active: true,
      upstreamSourceId: 'SRC:C',
      sourceType: 'processing',
    };
    const srcB: Source = {
      id: 'SRC:B',
      name: 'Source B',
      normalizedName: 'SOURCE B',
      category: 'Other',
      active: true,
      upstreamSourceId: 'SRC:A',
      sourceType: 'processing',
    };
    const srcC: Source = {
      id: 'SRC:C',
      name: 'vSource C',
      normalizedName: 'VSOURCE C',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: 'SRC:B',
      sourceType: 'virtual',
    };

    const sources = [srcA, srcB, srcC];
    const flow = resolveSignalFlow(srcC.id, sources);

    expect(flow.status).toBe('circular');
    expect(flow.hasCycle).toBe(true);
    expect(flow.isSelfRoute).toBe(false);
    expect(flow.cycleSourceIds.length).toBeGreaterThan(0);
    expect(flow.hops.length).toBeGreaterThan(0);
  });

  it('handles dangling upstream ID and nonexistent immediate source safely', () => {
    // Dangling upstream reference
    const srcWithDanglingUpstream: Source = {
      id: 'SRC:VALID_1',
      name: 'vCam-Valid',
      normalizedName: 'VCAM-VALID',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: 'SRC:MISSING_PARENT',
      sourceType: 'virtual',
    };

    const flow1 = resolveSignalFlow(srcWithDanglingUpstream.id, [srcWithDanglingUpstream]);
    expect(flow1.status).toBe('dangling');
    expect(flow1.isDangling).toBe(true);
    expect(flow1.danglingSourceId).toBe('SRC:MISSING_PARENT');
    expect(flow1.hops).toHaveLength(1);
    expect(flow1.hops[0].id).toBe(srcWithDanglingUpstream.id);

    // Immediate source missing entirely
    const flow2 = resolveSignalFlow('SRC:NON_EXISTENT', [srcWithDanglingUpstream]);
    expect(flow2.status).toBe('dangling');
    expect(flow2.isDangling).toBe(true);
    expect(flow2.danglingSourceId).toBe('SRC:NON_EXISTENT');
    expect(flow2.hops).toHaveLength(0);
  });

  it('enforces maximum-depth termination to prevent unbounded recursion', () => {
    // Create chain: S1 -> S2 -> S3 -> S4 -> S5 -> S6
    const chain: Source[] = [];
    for (let i = 1; i <= 6; i++) {
      chain.push({
        id: `SRC:${i}` as SourceId,
        name: `Source ${i}`,
        normalizedName: `SOURCE ${i}`,
        category: 'Other',
        active: true,
        upstreamSourceId: i > 1 ? (`SRC:${i - 1}` as SourceId) : null,
        sourceType: i > 1 ? 'processing' : 'originating',
      });
    }

    // Resolve with maxDepth 3
    const flow = resolveSignalFlow('SRC:6' as SourceId, chain, { maxDepth: 3 });
    expect(flow.status).toBe('max_depth_exceeded');
    expect(flow.maxDepthExceeded).toBe(true);
    expect(flow.hops).toHaveLength(3);
    // Origin-to-immediate: hop 0 is SRC:4, hop 2 is SRC:6
    expect(flow.hops[flow.hops.length - 1].id).toBe('SRC:6');
  });
});

describe('Source Graph Validation & Cycle Deduplication', () => {
  it('reports direct self-route without generating a duplicate generic circular routing finding', () => {
    const selfRouteSrc: Source = {
      id: 'SRC:SELF_TEST',
      name: 'vCam-SelfRoute',
      normalizedName: 'VCAM-SELFROUTE',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: 'SRC:SELF_TEST',
      sourceType: 'virtual',
    };

    const findings = validateSnapshot(mockMultiviews, [], [], [selfRouteSrc]);
    const selfRouteFindings = findings.filter((f) => f.code === 'SOURCE_SELF_ROUTING');
    const circularFindings = findings.filter((f) => f.code === 'SOURCE_CIRCULAR_ROUTING');

    expect(selfRouteFindings).toHaveLength(1);
    expect(selfRouteFindings[0].entityId).toBe(selfRouteSrc.id);
    expect(selfRouteFindings[0].message).toContain('routed directly into itself');
    // Ensure no duplicate circular-routing finding
    expect(circularFindings).toHaveLength(0);
  });

  it('reports unknown upstream source references', () => {
    const danglingSrc: Source = {
      id: 'SRC:DANGLING',
      name: 'vCam-Dangling',
      normalizedName: 'VCAM-DANGLING',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: 'SRC:DOES_NOT_EXIST',
      sourceType: 'virtual',
    };

    const findings = validateSnapshot(mockMultiviews, [], [], [danglingSrc]);
    const unknownUpstream = findings.find((f) => f.code === 'SOURCE_UNKNOWN_UPSTREAM');

    expect(unknownUpstream).toBeDefined();
    expect(unknownUpstream?.severity).toBe('error');
    expect(unknownUpstream?.message).toContain(
      "references unknown upstream source ID 'SRC:DOES_NOT_EXIST'"
    );
  });

  it('reports each unique circular routing cycle exactly once', () => {
    // 3 sources in a cycle: A -> B -> C -> A
    // Plus source D that routes into A: D -> A -> B -> C -> A
    const srcA: Source = {
      id: 'SRC:CYCLE_A',
      name: 'Source A',
      normalizedName: 'SOURCE A',
      category: 'Other',
      active: true,
      upstreamSourceId: 'SRC:CYCLE_C',
      sourceType: 'processing',
    };
    const srcB: Source = {
      id: 'SRC:CYCLE_B',
      name: 'Source B',
      normalizedName: 'SOURCE B',
      category: 'Other',
      active: true,
      upstreamSourceId: 'SRC:CYCLE_A',
      sourceType: 'processing',
    };
    const srcC: Source = {
      id: 'SRC:CYCLE_C',
      name: 'vSource C',
      normalizedName: 'VSOURCE C',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: 'SRC:CYCLE_B',
      sourceType: 'virtual',
    };
    const srcD: Source = {
      id: 'SRC:FEED_D',
      name: 'Feed D',
      normalizedName: 'FEED D',
      category: 'Other',
      active: true,
      upstreamSourceId: 'SRC:CYCLE_A',
      sourceType: 'originating',
    };

    const allSources = [srcA, srcB, srcC, srcD];
    const findings = validateSnapshot(mockMultiviews, [], [], allSources);

    const circularFindings = findings.filter((f) => f.code === 'SOURCE_CIRCULAR_ROUTING');
    // Exactly ONE unique circular routing finding must be generated, not 3 or 4
    expect(circularFindings).toHaveLength(1);
    expect(circularFindings[0].severity).toBe('error');
    expect(circularFindings[0].message).toContain('Circular source routing detected');
  });
});

describe('Phase 4B — Authoritative Source Catalog Inventory & Seed Properties', () => {
  it('loads the full authoritative facility source inventory with exact count and no additional sources', () => {
    expect(SEED_SOURCES).toHaveLength(231);

    const virtualSources = SEED_SOURCES.filter((s) => s.sourceType === 'virtual');
    const processingSources = SEED_SOURCES.filter((s) => s.sourceType === 'processing');
    const originatingSources = SEED_SOURCES.filter((s) => s.sourceType === 'originating');

    expect(virtualSources).toHaveLength(117);
    expect(processingSources).toHaveLength(0);
    expect(originatingSources).toHaveLength(114);
  });

  it('preserves representative exact source names without normalization or modification', () => {
    const sourceNames = new Set(SEED_SOURCES.map((s) => s.name));
    const representativeNames = [
      'Bars',
      'Cap Enc-03',
      'J2K Clip-1C',
      'JXS Clip-6B',
      'MV-05-08',
      'Swr-216',
      'Tx TWD 9936',
      'vCam-50',
      'vCam-601',
      'vCam-606',
      'vIngest-16',
      'vPgm-08',
      'vTie-137',
    ];

    for (const name of representativeNames) {
      expect(sourceNames.has(name)).toBe(true);
    }
  });

  it('preserves vCam-601 through vCam-606 without inventing vCam-51 through vCam-600', () => {
    const sourceNames = new Set(SEED_SOURCES.map((s) => s.name));

    // Valid vCam-01 to vCam-50 exist
    for (let i = 1; i <= 50; i++) {
      const padded = String(i).padStart(2, '0');
      expect(sourceNames.has(`vCam-${padded}`)).toBe(true);
    }

    // Valid vCam-601 to vCam-606 exist
    for (let i = 601; i <= 606; i++) {
      expect(sourceNames.has(`vCam-${i}`)).toBe(true);
    }

    // vCam-51 through vCam-600 must NOT exist
    expect(sourceNames.has('vCam-51')).toBe(false);
    expect(sourceNames.has('vCam-100')).toBe(false);
    expect(sourceNames.has('vCam-600')).toBe(false);
  });

  it('classifies all v* sources as virtual', () => {
    const vSources = SEED_SOURCES.filter((s) => s.name.startsWith('v'));
    expect(vSources).toHaveLength(117);
    for (const src of vSources) {
      expect(src.sourceType).toBe('virtual');
      expect(isVirtualSource(src)).toBe(true);
    }
  });

  it('classifies all non-v sources in this supplied inventory as originating', () => {
    const origSources = SEED_SOURCES.filter((s) => !s.name.startsWith('v'));
    expect(origSources).toHaveLength(114);
    for (const src of origSources) {
      expect(src.sourceType).toBe('originating');
      expect(isOriginatingSource(src)).toBe(true);
    }
  });

  it('defaults all seeded sources to upstreamSourceId: null', () => {
    for (const src of SEED_SOURCES) {
      expect(src.upstreamSourceId).toBeNull();
    }
  });

  it('generates deterministic and stable source IDs matching createSourceId conventions', () => {
    for (const src of SEED_SOURCES) {
      expect(src.id).toBe(createSourceId(src.name));
      expect(src.id.startsWith('SRC:')).toBe(true);
    }
  });
});

describe('Signal Flow Preview & Cycle Formatting (Phase 4C)', () => {
  const vCam1: Source = {
    id: 'SRC:VCAM_01',
    name: 'vCam-01',
    normalizedName: 'VCAM-01',
    category: 'Virtual Camera',
    active: true,
    upstreamSourceId: null,
    sourceType: 'virtual',
  };

  const vTie101: Source = {
    id: 'SRC:VTIE_101',
    name: 'vTie-101',
    normalizedName: 'VTIE-101',
    category: 'Virtual Tie',
    active: true,
    upstreamSourceId: null,
    sourceType: 'virtual',
  };

  const swr201: Source = {
    id: 'SRC:SWR_201',
    name: 'Swr-201',
    normalizedName: 'SWR-201',
    category: 'Switcher',
    active: true,
    upstreamSourceId: null,
    sourceType: 'originating',
  };

  it('evaluates proposed upstream assignment without mutating original source objects', () => {
    const sources = [vCam1, vTie101, swr201];
    const preview = previewUpstreamSignalFlow(vCam1.id, vTie101.id, sources);

    // Simulated chain: vTie-101 -> vCam-01
    expect(preview.status).toBe('resolved');
    expect(preview.hops).toHaveLength(2);
    expect(preview.hops[0].id).toBe(vTie101.id);
    expect(preview.hops[1].id).toBe(vCam1.id);

    // Original sources remain completely untouched
    expect(vCam1.upstreamSourceId).toBeNull();
    expect(vTie101.upstreamSourceId).toBeNull();
  });

  it('resolves multi-hop preview chain in origin-to-immediate order', () => {
    // Graph: Swr-201 -> vTie-101. We propose vTie-101 as upstream for vCam-01.
    const tieWithSwr: Source = { ...vTie101, upstreamSourceId: swr201.id };
    const sources = [vCam1, tieWithSwr, swr201];

    const preview = previewUpstreamSignalFlow(vCam1.id, tieWithSwr.id, sources);

    expect(preview.status).toBe('resolved');
    expect(preview.hasCycle).toBe(false);
    expect(preview.isSelfRoute).toBe(false);
    expect(preview.originSource?.id).toBe(swr201.id);
    expect(preview.immediateSource?.id).toBe(vCam1.id);

    // Origin-to-immediate order: Swr-201 -> vTie-101 -> vCam-01
    expect(preview.hops.map((h) => h.name)).toEqual(['Swr-201', 'vTie-101', 'vCam-01']);
    expect(formatSignalFlowChain(preview)).toBe('Swr-201 → vTie-101 → vCam-01');
  });

  it('rejects direct self-routing and flags isSelfRoute and hasCycle', () => {
    const sources = [vCam1, vTie101];
    const preview = previewUpstreamSignalFlow(vCam1.id, vCam1.id, sources);

    expect(preview.status).toBe('self_route');
    expect(preview.isSelfRoute).toBe(true);
    expect(preview.hasCycle).toBe(true);
    expect(preview.cycleSourceIds).toEqual([vCam1.id]);
    expect(formatCyclePath(preview.cycleSourceIds, sources)).toBe('vCam-01 → vCam-01');
  });

  it('rejects indirect circular routing and reports the exact cycle loop', () => {
    // Current: vTie-101 is fed by vCam-01 (vTie-101.upstream = vCam-01)
    // Proposed: feed vCam-01 from vTie-101 -> creates 2-node cycle!
    const tieFedByCam: Source = { ...vTie101, upstreamSourceId: vCam1.id };
    const sources = [vCam1, tieFedByCam];

    const preview = previewUpstreamSignalFlow(vCam1.id, tieFedByCam.id, sources);

    expect(preview.status).toBe('circular');
    expect(preview.hasCycle).toBe(true);
    expect(preview.isSelfRoute).toBe(false);
    expect(preview.cycleSourceIds).toContain(vCam1.id);
    expect(preview.cycleSourceIds).toContain(tieFedByCam.id);

    const cyclePath = formatCyclePath(preview.cycleSourceIds, sources);
    expect(cyclePath).toBe('vCam-01 → vTie-101 → vCam-01');
  });

  it('safely handles dangling upstream source references without throwing', () => {
    const sources = [vCam1];
    const preview = previewUpstreamSignalFlow(vCam1.id, 'SRC:NON_EXISTENT' as SourceId, sources);

    expect(preview.status).toBe('dangling');
    expect(preview.isDangling).toBe(true);
    expect(preview.hasCycle).toBe(false);
    expect(preview.danglingSourceId).toBe('SRC:NON_EXISTENT');
  });

  it('safely truncates at DEFAULT_MAX_SIGNAL_FLOW_DEPTH without hanging', () => {
    // Construct chain of 15 sources
    const chain: Source[] = [];
    for (let i = 1; i <= 15; i++) {
      chain.push({
        id: `SRC:NODE_${i}` as SourceId,
        name: `Node-${i}`,
        normalizedName: `NODE-${i}`,
        category: 'Virtual Tie',
        active: true,
        upstreamSourceId: i < 15 ? (`SRC:NODE_${i + 1}` as SourceId) : null,
        sourceType: 'virtual',
      });
    }

    const preview = previewUpstreamSignalFlow(chain[0].id, chain[1].id, chain, {
      maxDepth: DEFAULT_MAX_SIGNAL_FLOW_DEPTH,
    });

    expect(preview.status).toBe('max_depth_exceeded');
    expect(preview.maxDepthExceeded).toBe(true);
    expect(preview.hops.length).toBeLessThanOrEqual(DEFAULT_MAX_SIGNAL_FLOW_DEPTH);
  });

  it('evaluates clearing upstream source to null as origin', () => {
    const camWithUpstream: Source = { ...vCam1, upstreamSourceId: vTie101.id };
    const sources = [camWithUpstream, vTie101];

    const preview = previewUpstreamSignalFlow(camWithUpstream.id, null, sources);

    expect(preview.status).toBe('resolved');
    expect(preview.hops).toHaveLength(1);
    expect(preview.hops[0].id).toBe(camWithUpstream.id);
    expect(preview.originSource?.id).toBe(camWithUpstream.id);
  });
});
