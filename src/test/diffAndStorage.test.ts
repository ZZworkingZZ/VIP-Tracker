import { describe, it, expect, beforeEach } from 'vitest';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { diffSnapshots, createChangeSet, changeSetToChangeRecords } from '../domain/diff';
import { MemoryTrackerStorage, TRACKER_SCHEMA_VERSION } from '../services/storage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import {
  checkDestructiveLayoutReduction,
  findNextAvailableDestinationRange,
} from '../domain/rangeUtils';
import {
  buildAuthoritativeExportDataset,
  serializeTrackerSnapshot,
  deserializeTrackerSnapshot,
} from '../domain/serialization';
import { TrackerSnapshot, MultiviewOutput, Destination, Source } from '../domain/models';

describe('Diff Engine & ChangeSet Generation', () => {
  it('detects layout changes, production changes, and destination source changes accurately', () => {
    const baseline: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const draft: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));

    // Modify draft output OUT:MV-01-03: Layout 4 BOX -> 9 BOX, assignment AVAILABLE -> CHOPPED
    const out = draft.outputs.find((o) => o.id === 'OUT:MV-01-03')!;
    out.layoutName = '9 BOX';
    out.destinationStart = 17;
    out.destinationEnd = 25;
    out.assignmentName = 'CHOPPED';
    out.status = 'Assigned';

    // Add source and route to Destination 17
    const src1: Source = {
      id: 'SRC:CNN_NYP_FEED_1',
      name: 'CNN-NYP-Feed-1',
      normalizedName: 'CNN-NYP-Feed-1',
      category: 'Transmission',
      active: true,
    };
    draft.sources.push(src1);
    const dest17 = draft.destinations.find(
      (d) => d.multiviewId === 'MV-01' && d.destinationNumber === 17
    )!;
    dest17.assignedSourceId = src1.id;

    const changes = diffSnapshots(baseline, draft);
    expect(changes.length).toBeGreaterThan(0);

    const layoutChange = changes.find((c) => c.field === 'layoutName');
    expect(layoutChange).toBeDefined();
    expect(layoutChange?.previousValue).toBe('None');
    expect(layoutChange?.newValue).toBe('9 BOX');

    const assignChange = changes.find((c) => c.field === 'assignmentName');
    expect(assignChange).toBeDefined();
    expect(assignChange?.previousValue).toBe('AVAILABLE');
    expect(assignChange?.newValue).toBe('CHOPPED');

    const sourceChange = changes.find((c) => c.field === 'assignedSourceId');
    expect(sourceChange).toBeDefined();
    expect(sourceChange?.newValue).toBe('CNN-NYP-Feed-1');

    const cs = createChangeSet(baseline, draft);
    expect(cs.changes.length).toBe(changes.length);
    expect(cs.timestamp).toBeDefined();

    const records = changeSetToChangeRecords(cs);
    expect(records.length).toBe(changes.length);
    expect(records[0].changedBy).toBeNull();
  });
});

describe('Range Allocation & Destructive Layout Reduction Protection', () => {
  it('finds next contiguous available destination range on a multiview', () => {
    const outputs = [...INITIAL_SNAPSHOT.outputs];
    // MV-01 has 4 outputs, all Available in initial seed
    const range = findNextAvailableDestinationRange('MV-01', 4, outputs);
    expect(range).not.toBeNull();
    expect(range?.start).toBe(1);
    expect(range?.end).toBe(4);
  });

  it('detects when reducing layout window count will destroy populated source assignments', () => {
    const out: MultiviewOutput = {
      id: 'OUT:MV-01-01',
      multiviewId: 'MV-01',
      outputNumber: 1,
      layoutName: '9 BOX',
      destinationStart: 1,
      destinationEnd: 9,
      assignmentName: 'TEST',
      notes: null,
      status: 'Assigned',
      locked: false,
      updatedAt: null,
      updatedBy: null,
    };

    const sources: Source[] = [
      {
        id: 'SRC:CAM_8',
        name: 'CAM 8',
        normalizedName: 'CAM 8',
        category: 'Virtual Camera',
        active: true,
      },
    ];

    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01',
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: null,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
      {
        id: 'DEST:MV-01-08',
        multiviewId: 'MV-01',
        destinationNumber: 8,
        assignedSourceId: 'SRC:CAM_8',
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    // Reducing to 4 BOX (windows 1..4, removing 5..9)
    const warning = checkDestructiveLayoutReduction(out, 4, destinations, sources);
    expect(warning.isReduction).toBe(true);
    expect(warning.oldWindowCount).toBe(9);
    expect(warning.newWindowCount).toBe(4);
    expect(warning.removedDestinationNumbers).toEqual([5, 6, 7, 8, 9]);
    expect(warning.affectedDestinationsWithSources).toHaveLength(1);
    expect(warning.affectedDestinationsWithSources[0].destinationNumber).toBe(8);
    expect(warning.affectedDestinationsWithSources[0].sourceName).toBe('CAM 8');
  });
});

describe('Storage Persistence & Reset', () => {
  let storage: MemoryTrackerStorage;

  beforeEach(() => {
    storage = new MemoryTrackerStorage();
  });

  it('saves changes to storage and reloads persisted state across repository instances', async () => {
    const repo1 = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const snap1 = await repo1.getSnapshot();

    // Modify output
    const modifiedOutput = { ...snap1.outputs[0], assignmentName: 'PERSISTED SHOW' };
    const snap2 = {
      ...snap1,
      outputs: snap1.outputs.map((o) => (o.id === modifiedOutput.id ? modifiedOutput : o)),
    };

    await repo1.saveSnapshot(snap2);

    // Verify storage has been written
    const persisted = storage.load();
    expect(persisted).not.toBeNull();
    expect(persisted?.schemaVersion).toBe(TRACKER_SCHEMA_VERSION);
    expect(persisted?.outputs.find((o) => o.id === modifiedOutput.id)?.assignmentName).toBe(
      'PERSISTED SHOW'
    );

    // Instantiate repo2 representing application reload
    const repo2 = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const reloadedSnap = await repo2.getSnapshot();
    expect(reloadedSnap.outputs.find((o) => o.id === modifiedOutput.id)?.assignmentName).toBe(
      'PERSISTED SHOW'
    );
  });

  it('resets local data back to pristine repository baseline', async () => {
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const snap1 = await repo.getSnapshot();

    const modified = { ...snap1.outputs[0], assignmentName: 'MODIFIED' };
    await repo.saveSnapshot({
      ...snap1,
      outputs: snap1.outputs.map((o) => (o.id === modified.id ? modified : o)),
    });

    expect(storage.load()).not.toBeNull();

    // Reset
    const resetSnap = await repo.resetToBaseline();
    expect(resetSnap.outputs[0].assignmentName).toBe(INITIAL_SNAPSHOT.outputs[0].assignmentName);
    expect(storage.load()).toBeNull();
  });
});

describe('Tabular Serialization Boundary', () => {
  it('builds authoritative export dataset with normalized output, destination, and source rows', () => {
    const dataset = buildAuthoritativeExportDataset(INITIAL_SNAPSHOT);
    expect(dataset.outputs).toHaveLength(INITIAL_SNAPSHOT.outputs.length);
    expect(dataset.destinations).toHaveLength(INITIAL_SNAPSHOT.destinations.length);
    expect(dataset.version).toBe('1.0.0');
    expect(dataset.exportedAt).toBeDefined();

    const json = serializeTrackerSnapshot(INITIAL_SNAPSHOT);
    const deserialized = deserializeTrackerSnapshot(json);
    expect(deserialized.outputs).toHaveLength(INITIAL_SNAPSHOT.outputs.length);
    expect(deserialized.destinations).toHaveLength(INITIAL_SNAPSHOT.destinations.length);
  });
});
