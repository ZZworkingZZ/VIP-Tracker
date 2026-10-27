import { describe, it, expect } from 'vitest';
import { MultiviewOutput, TrackerSnapshot, Destination, Source } from '../domain/models';
import {
  createOutputId,
  createDestinationId,
  createPipId,
  formatInputDisplay,
  formatOutputLabel,
  formatPipDisplay,
} from '../domain/identifiers';
import {
  LAYOUT_36_BOX,
  LAYOUT_3_BOX,
  LAYOUT_4_BOX,
  LayoutDefinition,
  getLayoutPips,
  getLayoutDefinition,
} from '../domain/layoutDefinitions';
import {
  assignPipInput,
  clearPipInput,
  movePipInput,
  handleOutputLayoutChange,
  normalizeOutputPipAssignments,
  getPipAssignment,
  getPipDisplayData,
} from '../domain/pipRouting';
import { diffSnapshots } from '../domain/diff';
import { MemoryTrackerStorage } from '../services/storage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';

describe('PIP Routing Domain Model & Lifecycle', () => {
  const baseOutput: MultiviewOutput = {
    id: 'OUT:MV-01-01',
    multiviewId: 'MV-01',
    outputNumber: 1,
    layoutName: '4 BOX',
    destinationStart: null,
    destinationEnd: null,
    assignmentName: 'STUDIO A',
    notes: null,
    status: 'Assigned',
    locked: false,
    updatedAt: null,
    updatedBy: null,
    pipAssignments: {
      'PIP-01': null,
      'PIP-02': null,
      'PIP-03': null,
      'PIP-04': null,
    },
  };

  // Requirement 1: Assign an MV Input to a PIP
  it('1. assigns an MV Input / Router Destination to a specific PIP within an output', () => {
    const updated = assignPipInput(baseOutput, 'PIP-01', 'DEST:MV-01-05', LAYOUT_4_BOX);
    expect(getPipAssignment(updated, 'PIP-01')).toBe('DEST:MV-01-05');
    expect(getPipAssignment(updated, 'PIP-02')).toBeNull();
  });

  // Requirement 2: Persist and reload the assignment
  it('2. persists and reloads PIP assignments via repository storage', async () => {
    const storage = new MemoryTrackerStorage();
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);

    const snapshot = await repo.getSnapshot();
    const out = snapshot.outputs.find((o) => o.id === 'OUT:MV-01-01')!;
    const updatedOutput = assignPipInput(
      { ...out, layoutName: '4 BOX' },
      'PIP-01',
      'DEST:MV-01-14',
      LAYOUT_4_BOX
    );

    const nextSnapshot: TrackerSnapshot = {
      ...snapshot,
      outputs: snapshot.outputs.map((o) => (o.id === out.id ? updatedOutput : o)),
    };

    await repo.saveSnapshot(nextSnapshot);

    // Create a new repository instance pointing to the same storage to verify reload
    const reloadedRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const reloadedSnapshot = await reloadedRepo.getSnapshot();
    const reloadedOutput = reloadedSnapshot.outputs.find((o) => o.id === 'OUT:MV-01-01')!;

    expect(reloadedOutput.pipAssignments?.['PIP-01']).toBe('DEST:MV-01-14');
  });

  // Requirement 3: Clear a PIP
  it('3. clears an assigned PIP back to explicit null', () => {
    const assigned = assignPipInput(baseOutput, 'PIP-01', 'DEST:MV-01-05', LAYOUT_4_BOX);
    expect(getPipAssignment(assigned, 'PIP-01')).toBe('DEST:MV-01-05');

    const cleared = clearPipInput(assigned, 'PIP-01', LAYOUT_4_BOX);
    expect(getPipAssignment(cleared, 'PIP-01')).toBeNull();
  });

  // Requirement 4: Move an MV Input from one PIP to another
  it('4. moves an MV Input from one PIP to another within the same output, clearing the prior PIP', () => {
    const assigned = assignPipInput(baseOutput, 'PIP-01', 'DEST:MV-01-09', LAYOUT_4_BOX);
    const moved = movePipInput(assigned, 'PIP-01', 'PIP-03', LAYOUT_4_BOX);

    expect(getPipAssignment(moved, 'PIP-01')).toBeNull();
    expect(getPipAssignment(moved, 'PIP-03')).toBe('DEST:MV-01-09');
  });

  // Requirement 5: Replace a PIP's existing MV Input
  it("5. replaces a PIP's existing MV Input cleanly", () => {
    const initial = assignPipInput(baseOutput, 'PIP-02', 'DEST:MV-01-02', LAYOUT_4_BOX);
    const replaced = assignPipInput(initial, 'PIP-02', 'DEST:MV-01-18', LAYOUT_4_BOX);

    expect(getPipAssignment(replaced, 'PIP-02')).toBe('DEST:MV-01-18');
  });

  // Requirement 6: Discard staged assignment changes
  it('6. preserves baseline unchanged when staged draft changes are discarded', () => {
    const baseline = JSON.parse(JSON.stringify(baseOutput)) as MultiviewOutput;
    let draft = JSON.parse(JSON.stringify(baseline)) as MultiviewOutput;

    // Apply staged change to draft
    draft = assignPipInput(draft, 'PIP-01', 'DEST:MV-01-20', LAYOUT_4_BOX);
    expect(getPipAssignment(draft, 'PIP-01')).toBe('DEST:MV-01-20');

    // Discard draft: restore to baseline
    draft = JSON.parse(JSON.stringify(baseline));
    expect(getPipAssignment(draft, 'PIP-01')).toBeNull();
    expect(baseline.pipAssignments?.['PIP-01']).toBeNull();
  });

  // Requirement 7: Save staged assignment changes and verify diffs
  it('7. detects PIP assignment changes accurately in snapshot diffs', () => {
    const baseline: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const draft: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));

    const out = draft.outputs.find((o) => o.id === 'OUT:MV-01-01')!;
    const updated = assignPipInput(
      { ...out, layoutName: '4 BOX' },
      'PIP-01',
      'DEST:MV-01-10',
      LAYOUT_4_BOX
    );
    draft.outputs = draft.outputs.map((o) => (o.id === out.id ? updated : o));

    const diffs = diffSnapshots(baseline, draft);
    const pipDiff = diffs.find((d) => d.field === 'pipAssignment:PIP-01');

    expect(pipDiff).toBeDefined();
    expect(pipDiff?.entityType).toBe('output');
    expect(pipDiff?.entityId).toBe('OUT:MV-01-01');
    expect(pipDiff?.newValue).toBe('MV-01-10 Input');
  });

  // Requirement 8: Independent identities
  it('8. preserves output, PIP, and MV Input identities independently without cross-derivation', () => {
    const outputId = createOutputId('MV-04', 2); // 'OUT:MV-04-02'
    const inputId = createDestinationId('MV-02', 14); // 'DEST:MV-02-14'
    const pipId = createPipId(1); // 'PIP-01'

    expect(outputId).toBe('OUT:MV-04-02');
    expect(inputId).toBe('DEST:MV-02-14');
    expect(pipId).toBe('PIP-01');

    expect(formatOutputLabel(outputId)).toBe('MV-04-02 Output');
    expect(formatInputDisplay(inputId)).toBe('MV-02-14 Input');
    expect(formatPipDisplay(pipId)).toBe('PIP-01');

    // A PIP does not derive identity from an input
    expect(pipId).not.toContain('MV');
    expect(pipId).not.toContain('DEST');
  });

  // Requirement 9: Unassigned PIPs remain null
  it('9. ensures unassigned PIPs remain explicitly null without synthetic placeholders', () => {
    const normalized = normalizeOutputPipAssignments(
      {
        ...baseOutput,
        pipAssignments: {
          'PIP-01': 'DEST:MV-01-01',
        },
      },
      LAYOUT_4_BOX
    );

    expect(normalized['PIP-01']).toBe('DEST:MV-01-01');
    expect(normalized['PIP-02']).toBeNull();
    expect(normalized['PIP-03']).toBeNull();
    expect(normalized['PIP-04']).toBeNull();
    // Zero synthetic placeholders
    expect(normalized['PIP-02']).not.toBe('UNKNOWN');
    expect(normalized['PIP-02']).not.toBe('TBD');
  });

  // Requirement 10: Zero fabrication of routed sources or MV Inputs
  it('10. does not fabricate routed sources or MV Inputs for empty or unrouted PIPs', () => {
    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01',
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: null, // No source routed
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];
    const sources: Source[] = [];

    // Test unassigned PIP
    const unassignedData = getPipDisplayData(baseOutput, 'PIP-01', destinations, sources);
    expect(unassignedData.isAssigned).toBe(false);
    expect(unassignedData.assignedDestinationId).toBeNull();
    expect(unassignedData.routedSource).toBeNull();

    // Test assigned PIP with unrouted destination
    const outputWithInput = assignPipInput(baseOutput, 'PIP-01', 'DEST:MV-01-01', LAYOUT_4_BOX);
    const assignedData = getPipDisplayData(outputWithInput, 'PIP-01', destinations, sources);
    expect(assignedData.isAssigned).toBe(true);
    expect(assignedData.assignedDestinationId).toBe('DEST:MV-01-01');
    expect(assignedData.routedSource).toBeNull(); // No fabricated source
    expect(assignedData.hasRoutedSource).toBe(false);
  });

  // Requirement 11: Representative PIP numbering for 36 BOX layout
  it('11. verifies visual reading order PIP numbering for a 36 BOX layout', () => {
    const pips = getLayoutPips(LAYOUT_36_BOX);
    expect(pips.length).toBe(36);

    // Row 1: PIP-01 through PIP-06
    expect(pips[0].pipId).toBe('PIP-01');
    expect(pips[5].pipId).toBe('PIP-06');
    // Row 2: PIP-07 through PIP-12
    expect(pips[6].pipId).toBe('PIP-07');
    expect(pips[11].pipId).toBe('PIP-12');
    // Row 6: PIP-31 through PIP-36
    expect(pips[30].pipId).toBe('PIP-31');
    expect(pips[35].pipId).toBe('PIP-36');

    // Confirm reading order coordinates: Row 0 has y: 0, Row 5 has y: ~83.33%
    expect(pips[0].window.y).toBe(0);
    expect(pips[5].window.x).toBeGreaterThan(pips[0].window.x);
    expect(pips[35].window.y).toBeGreaterThan(pips[0].window.y);
  });

  // Requirement 12: Stable PIP IDs for 3 BOX layout
  it('12. verifies stable PIP IDs for 3 BOX layout', () => {
    const pips = getLayoutPips(LAYOUT_3_BOX);
    expect(pips.length).toBe(3);
    expect(pips[0].pipId).toBe('PIP-01');
    expect(pips[1].pipId).toBe('PIP-02');
    expect(pips[2].pipId).toBe('PIP-03');

    // 2-over-1 windows: all 3 windows have equal width and height
    expect(pips[0].window.width).toBe(pips[1].window.width);
    expect(pips[1].window.width).toBe(pips[2].window.width);
    expect(pips[0].window.height).toBe(pips[1].window.height);
    expect(pips[1].window.height).toBe(pips[2].window.height);
  });

  // Requirement 13: Custom layouts share the same assignment relationship
  it('13. verifies custom layouts use the identical assignment relationship', () => {
    const customLayout: LayoutDefinition = {
      id: 'custom-control-wall-1',
      name: 'CONTROL WALL CUSTOM',
      windowCount: 2,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Custom dual-window layout',
      windows: [
        { id: 'w-1', pipId: 'PIP-01', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
        { id: 'w-2', pipId: 'PIP-02', x: 50, y: 0, width: 50, height: 100, destinationOffset: 1 },
      ],
      isCustom: true,
    };

    const outputWithCustom: MultiviewOutput = {
      ...baseOutput,
      layoutName: customLayout.name,
    };

    const assigned = assignPipInput(outputWithCustom, 'PIP-01', 'DEST:MV-01-30', customLayout);
    expect(getPipAssignment(assigned, 'PIP-01')).toBe('DEST:MV-01-30');
    expect(getPipAssignment(assigned, 'PIP-02')).toBeNull();
  });

  // Requirement 14: Safe legacy data normalization
  it('14. safely normalizes legacy outputs with destinationStart and destinationEnd without data loss', () => {
    // Legacy output format with layout and destination range
    const legacyOutput: MultiviewOutput = {
      id: 'OUT:MV-02-01',
      multiviewId: 'MV-02',
      outputNumber: 1,
      layoutName: '6 BOX',
      destinationStart: 1,
      destinationEnd: 3, // Verified anomalous baseline: 3 destinations mapped under 6 BOX
      assignmentName: 'BR ALERT 1',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const layout6Box = getLayoutDefinition('6 BOX')!;
    const normalized = normalizeOutputPipAssignments(legacyOutput, layout6Box);

    // Destinations 1, 2, 3 mapped to PIP-01, PIP-02, PIP-03
    expect(normalized['PIP-01']).toBe('DEST:MV-02-01');
    expect(normalized['PIP-02']).toBe('DEST:MV-02-02');
    expect(normalized['PIP-03']).toBe('DEST:MV-02-03');
    // Remaining PIPs are explicitly unassigned (null)
    expect(normalized['PIP-04']).toBeNull();
    expect(normalized['PIP-05']).toBeNull();
    expect(normalized['PIP-06']).toBeNull();
  });

  // Layout change pruning protection
  it('handles layout switching by retaining valid PIPs and pruning obsolete PIPs without fabricating new ones', () => {
    // Start with 4 BOX with PIP-01 through PIP-04 assigned
    let out = assignPipInput(baseOutput, 'PIP-01', 'DEST:MV-01-01', LAYOUT_4_BOX);
    out = assignPipInput(out, 'PIP-02', 'DEST:MV-01-02', LAYOUT_4_BOX);
    out = assignPipInput(out, 'PIP-03', 'DEST:MV-01-03', LAYOUT_4_BOX);
    out = assignPipInput(out, 'PIP-04', 'DEST:MV-01-04', LAYOUT_4_BOX);

    // Switch to 2 BOX
    const layout2Box = getLayoutDefinition('2 BOX')!;
    const switched = handleOutputLayoutChange(out, layout2Box);

    expect(switched.layoutName).toBe('2 BOX');
    expect(getPipAssignment(switched, 'PIP-01')).toBe('DEST:MV-01-01');
    expect(getPipAssignment(switched, 'PIP-02')).toBe('DEST:MV-01-02');
    // Obsolete PIP-03 and PIP-04 are pruned
    expect(getPipAssignment(switched, 'PIP-03')).toBeNull();
    expect(getPipAssignment(switched, 'PIP-04')).toBeNull();
  });
});
