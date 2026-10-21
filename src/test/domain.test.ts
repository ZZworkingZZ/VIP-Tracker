import { describe, it, expect } from 'vitest';
import {
  VERIFIED_MULTIVIEWS,
  TOTAL_EXPECTED_MULTIVIEWS,
  TOTAL_EXPECTED_OUTPUTS,
  TOTAL_EXPECTED_DESTINATIONS,
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
import { mockMultiviews, mockSources } from './fixtures';
import { MultiviewOutput, Destination, TrackerSnapshot } from '../domain/models';

describe('Domain Models & Capacities', () => {
  it('has authoritative verified multiview capacities', () => {
    expect(VERIFIED_MULTIVIEWS.length).toBe(TOTAL_EXPECTED_MULTIVIEWS);

    const mv1 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-01')!;
    const mv2 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-02')!;
    const mv3 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-03')!;
    const mv4 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-04')!;
    const mv5 = VERIFIED_MULTIVIEWS.find((mv) => mv.id === 'MV-05')!;

    expect(mv1.destinationCapacity).toBe(36);
    expect(mv1.outputCapacity).toBe(4);

    expect(mv2.destinationCapacity).toBe(36);
    expect(mv2.outputCapacity).toBe(4);

    expect(mv3.destinationCapacity).toBe(64);
    expect(mv3.outputCapacity).toBe(8);

    expect(mv4.destinationCapacity).toBe(64);
    expect(mv4.outputCapacity).toBe(8);

    expect(mv5.destinationCapacity).toBe(64);
    expect(mv5.outputCapacity).toBe(8);

    const totalOutputs = VERIFIED_MULTIVIEWS.reduce((sum, mv) => sum + mv.outputCapacity, 0);
    const totalDestinations = VERIFIED_MULTIVIEWS.reduce(
      (sum, mv) => sum + mv.destinationCapacity,
      0
    );

    expect(totalOutputs).toBe(TOTAL_EXPECTED_OUTPUTS);
    expect(totalDestinations).toBe(TOTAL_EXPECTED_DESTINATIONS);
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

  it('detects destination range exceeding multiview capacity', () => {
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

  it('detects overlapping destination ranges on the same multiview', () => {
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
