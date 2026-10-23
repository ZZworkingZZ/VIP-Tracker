import { describe, it, expect, beforeEach } from 'vitest';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { SEED_SOURCES } from '../data/seed/sources';
import { diffSnapshots, createChangeSet, changeSetToChangeRecords } from '../domain/diff';
import {
  MemoryTrackerStorage,
  BrowserLocalStorage,
  TRACKER_SCHEMA_VERSION,
  TRACKER_STORAGE_KEY,
  CURRENT_SOURCE_SEED_VERSION,
} from '../services/storage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { checkDestructiveLayoutReduction, findNextAvailableInputBlock } from '../domain/rangeUtils';
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
      upstreamSourceId: null,
      sourceType: 'originating',
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
  it('finds next contiguous available destination window slot on a multiview', () => {
    const outputs = [...INITIAL_SNAPSHOT.outputs];
    // MV-01 has 4 outputs, all Available in initial seed
    const range = findNextAvailableInputBlock('MV-01', 4, outputs);
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
        upstreamSourceId: null,
        sourceType: 'virtual',
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

  it('supplies the seed Source catalog to a fresh repository instance', async () => {
    // Fresh instance: no stored data
    expect(storage.load()).toBeNull();
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const snap = await repo.getSnapshot();

    expect(snap.sources).toHaveLength(SEED_SOURCES.length);
    expect(snap.sources).toHaveLength(231);
    expect(snap.sources[0].id).toBe(SEED_SOURCES[0].id);
  });

  it('bootstraps the authoritative catalog once for an existing pre-seed browser state with sources: []', async () => {
    // Pre-seed legacy storage state: valid V2 payload with sources: [] and no sourceSeedVersion
    storage.save({
      schemaVersion: TRACKER_SCHEMA_VERSION,
      outputs: INITIAL_SNAPSHOT.outputs,
      destinations: INITIAL_SNAPSHOT.destinations,
      sources: [],
      operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
      changeRecords: [],
      savedAt: new Date().toISOString(),
    });

    expect(storage.load()?.sourceSeedVersion).toBeUndefined();
    expect(storage.load()?.sources).toHaveLength(0);

    // Initializing repository should detect legacy pre-seed state and bootstrap authoritative sources
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const snap = await repo.getSnapshot();

    expect(snap.sources).toHaveLength(231);
    expect(snap.sources[0].name).toBe('Bars');

    // Storage is updated with sourceSeedVersion
    const updatedStorage = storage.load();
    expect(updatedStorage?.sourceSeedVersion).toBe(CURRENT_SOURCE_SEED_VERSION);
    expect(updatedStorage?.sources).toHaveLength(231);
  });

  it('preserves subsequent user modifications and intentionally empty catalogs once seeded', async () => {
    // Seeding has already happened (sourceSeedVersion: 1)
    // User intentionally clears the catalog or manages custom sources
    storage.save({
      schemaVersion: TRACKER_SCHEMA_VERSION,
      sourceSeedVersion: CURRENT_SOURCE_SEED_VERSION,
      outputs: INITIAL_SNAPSHOT.outputs,
      destinations: INITIAL_SNAPSHOT.destinations,
      sources: [], // Intentionally empty catalog after user removal
      operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
      changeRecords: [],
      savedAt: new Date().toISOString(),
    });

    // Reload repository
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const snap = await repo.getSnapshot();

    // Must NOT overwrite intentionally empty user catalog because sourceSeedVersion is already at CURRENT_SOURCE_SEED_VERSION
    expect(snap.sources).toHaveLength(0);
  });

  it('ensures existing persisted sources with current seed version are preserved and not replaced by seed data', async () => {
    // Custom user-persisted catalog with current seed version
    const customSources: Source[] = [
      {
        id: 'SRC:CUSTOM_1',
        name: 'CUSTOM_1',
        normalizedName: 'CUSTOM_1',
        category: 'Other',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
      },
    ];

    storage.save({
      schemaVersion: TRACKER_SCHEMA_VERSION,
      sourceSeedVersion: CURRENT_SOURCE_SEED_VERSION,
      outputs: INITIAL_SNAPSHOT.outputs,
      destinations: INITIAL_SNAPSHOT.destinations,
      sources: customSources,
      operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
      changeRecords: [],
      savedAt: new Date().toISOString(),
    });

    // Existing instance reloads
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const snap = await repo.getSnapshot();

    expect(snap.sources).toHaveLength(1);
    expect(snap.sources[0].id).toBe('SRC:CUSTOM_1');
    expect(snap.sources[0].name).toBe('CUSTOM_1');
  });

  it('performs non-destructive V1-to-V2 migration with default upstreamSourceId: null and inferred sourceType', () => {
    // V1 payload with legacy source lacking upstreamSourceId and sourceType
    const legacyV1Payload = {
      schemaVersion: 1,
      outputs: INITIAL_SNAPSHOT.outputs,
      destinations: INITIAL_SNAPSHOT.destinations,
      sources: [
        {
          id: 'SRC:VCAM_01',
          name: 'vCam-01',
          normalizedName: 'VCAM-01',
          category: 'Virtual Camera',
          active: true,
        },
        {
          id: 'SRC:UDX_02',
          name: 'UDX-02',
          normalizedName: 'UDX-02',
          category: 'Other',
          active: true,
        },
        {
          id: 'SRC:BSP_100',
          name: 'BSP-100',
          normalizedName: 'BSP-100',
          category: 'Other',
          active: true,
        },
      ],
      operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
      changeRecords: [],
      savedAt: '2026-10-21T12:00:00.000Z',
    };

    storage.seedRaw(legacyV1Payload);

    const migrated = storage.load();
    expect(migrated).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(2);

    // Verify migrated sources
    const vcam = migrated?.sources.find((s) => s.id === 'SRC:VCAM_01');
    expect(vcam).toBeDefined();
    expect(vcam?.upstreamSourceId).toBeNull();
    expect(vcam?.sourceType).toBe('virtual');

    const udx = migrated?.sources.find((s) => s.id === 'SRC:UDX_02');
    expect(udx).toBeDefined();
    expect(udx?.upstreamSourceId).toBeNull();
    expect(udx?.sourceType).toBe('processing');

    const bsp = migrated?.sources.find((s) => s.id === 'SRC:BSP_100');
    expect(bsp).toBeDefined();
    expect(bsp?.upstreamSourceId).toBeNull();
    expect(bsp?.sourceType).toBe('originating');
  });

  it('preserves all existing persisted entities and assignments during V1-to-V2 migration', () => {
    const legacyV1Payload = {
      schemaVersion: 1,
      outputs: [
        {
          id: 'OUT:MV-01-01',
          multiviewId: 'MV-01',
          outputNumber: 1,
          layoutName: '4 BOX',
          destinationStart: 1,
          destinationEnd: 4,
          assignmentName: 'SUPER SHOW',
          notes: 'Important notes',
          status: 'Assigned',
          locked: true,
          updatedAt: '2026-10-21T10:00:00.000Z',
          updatedBy: null,
        },
      ],
      destinations: [
        {
          id: 'DEST:MV-01-01',
          multiviewId: 'MV-01',
          destinationNumber: 1,
          assignedSourceId: 'SRC:TEST_1',
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
      ],
      sources: [
        {
          id: 'SRC:TEST_1',
          name: 'TEST 1',
          normalizedName: 'TEST 1',
          category: 'Test',
          active: true,
        },
      ],
      operationalAssignments: [
        {
          id: 'ASSIGN:SUPER_SHOW',
          rawName: 'SUPER SHOW',
          displayName: 'SUPER SHOW',
          active: true,
        },
      ],
      changeRecords: [
        {
          id: 'rec_1',
          entityType: 'output',
          entityId: 'OUT:MV-01-01',
          field: 'assignmentName',
          previousValue: null,
          newValue: 'SUPER SHOW',
          reason: 'Initial assignment',
          changedBy: null,
          changedAt: '2026-10-21T10:00:00.000Z',
        },
      ],
      savedAt: '2026-10-21T10:00:00.000Z',
    };

    storage.seedRaw(legacyV1Payload);
    const migrated = storage.load();

    expect(migrated).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.outputs[0].assignmentName).toBe('SUPER SHOW');
    expect(migrated?.outputs[0].locked).toBe(true);
    expect(migrated?.destinations[0].assignedSourceId).toBe('SRC:TEST_1');
    expect(migrated?.operationalAssignments[0].rawName).toBe('SUPER SHOW');
    expect(migrated?.changeRecords).toHaveLength(1);
    expect(migrated?.changeRecords[0].id).toBe('rec_1');
    expect(migrated?.sources[0].id).toBe('SRC:TEST_1');
    expect(migrated?.sources[0].upstreamSourceId).toBeNull();
  });

  it('loads current V2 payload without modification', () => {
    const v2Payload = {
      schemaVersion: 2,
      outputs: INITIAL_SNAPSHOT.outputs,
      destinations: INITIAL_SNAPSHOT.destinations,
      sources: [
        {
          id: 'SRC:ORIGIN_1',
          name: 'BSP-K1-301',
          normalizedName: 'BSP-K1-301',
          category: 'Other',
          active: true,
          upstreamSourceId: null,
          sourceType: 'originating',
        },
        {
          id: 'SRC:UDX_03',
          name: 'UDX-03',
          normalizedName: 'UDX-03',
          category: 'Other',
          active: true,
          upstreamSourceId: 'SRC:ORIGIN_1',
          sourceType: 'processing',
        },
      ],
      operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
      changeRecords: [],
      savedAt: '2026-10-22T10:00:00.000Z',
    };

    storage.seedRaw(v2Payload);
    const loaded = storage.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.sources[1].upstreamSourceId).toBe('SRC:ORIGIN_1');
    expect(loaded?.sources[1].sourceType).toBe('processing');
  });

  it('leaves the original local-storage value untouched on failed migration or corrupt payload', () => {
    // 1. MemoryTrackerStorage test with unmigratable/unsupported data
    const corruptPayload = {
      schemaVersion: 999, // unsupported future schema version
      mysteryData: 'do not touch me',
    };
    storage.seedRaw(corruptPayload);

    const loadResult = storage.load();
    expect(loadResult).toBeNull();
    // Raw storage untouched!
    expect(storage.getRaw()).toEqual(corruptPayload);

    // 2. BrowserLocalStorage test with localStorage mock
    const mockStorageMap = new Map<string, string>();
    const originalLocalStorage = window.localStorage;

    const mockLocalStorage = {
      getItem: (key: string) => mockStorageMap.get(key) ?? null,
      setItem: (key: string, val: string) => mockStorageMap.set(key, val),
      removeItem: (key: string) => mockStorageMap.delete(key),
      clear: () => mockStorageMap.clear(),
      length: 0,
      key: () => null,
    };

    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    try {
      const browserStorage = new BrowserLocalStorage(TRACKER_STORAGE_KEY);

      // Malformed JSON string
      const malformedJson = '{"schemaVersion": 1, "sources": [bad json';
      window.localStorage.setItem(TRACKER_STORAGE_KEY, malformedJson);

      const browserLoadResult = browserStorage.load();
      expect(browserLoadResult).toBeNull();
      // Storage must remain untouched
      expect(window.localStorage.getItem(TRACKER_STORAGE_KEY)).toBe(malformedJson);

      // Unsupported schema
      const unsupportedJson = JSON.stringify({ schemaVersion: 99 });
      window.localStorage.setItem(TRACKER_STORAGE_KEY, unsupportedJson);

      const unsupportedResult = browserStorage.load();
      expect(unsupportedResult).toBeNull();
      expect(window.localStorage.getItem(TRACKER_STORAGE_KEY)).toBe(unsupportedJson);
    } finally {
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
      });
    }
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

describe('Phase 4C: Upstream Source Change Tracking & Persistence', () => {
  it('captures upstream source assignment: unassigned to new upstream', () => {
    const baseline = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)) as TrackerSnapshot;
    const draft = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)) as TrackerSnapshot;

    const vCam1 = draft.sources.find((s) => s.name === 'vCam-01')!;
    const vTie101 = draft.sources.find((s) => s.name === 'vTie-101')!;
    vCam1.upstreamSourceId = vTie101.id;

    const changes = diffSnapshots(baseline, draft);
    expect(changes).toHaveLength(1);

    const change = changes[0];
    expect(change.entityType).toBe('source');
    expect(change.entityId).toBe(vCam1.id);
    expect(change.entityLabel).toBe('vCam-01');
    expect(change.field).toBe('upstreamSourceId');
    expect(change.previousValue).toBe('Unassigned');
    expect(change.newValue).toBe('vTie-101');
    expect(change.description).toBe('vCam-01 upstream changed from Unassigned to vTie-101');
  });

  it('captures upstream source replacement: previous upstream to new upstream', () => {
    const baseline = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)) as TrackerSnapshot;
    const vCam1Base = baseline.sources.find((s) => s.name === 'vCam-01')!;
    const vTie101Base = baseline.sources.find((s) => s.name === 'vTie-101')!;
    vCam1Base.upstreamSourceId = vTie101Base.id;

    const draft = JSON.parse(JSON.stringify(baseline)) as TrackerSnapshot;
    const vCam1Draft = draft.sources.find((s) => s.name === 'vCam-01')!;
    const swr201Draft = draft.sources.find((s) => s.name === 'Swr-201')!;
    vCam1Draft.upstreamSourceId = swr201Draft.id;

    const changes = diffSnapshots(baseline, draft);
    expect(changes).toHaveLength(1);

    const change = changes[0];
    expect(change.previousValue).toBe('vTie-101');
    expect(change.newValue).toBe('Swr-201');
    expect(change.description).toBe('vCam-01 upstream changed from vTie-101 to Swr-201');
  });

  it('captures upstream source cleared: previous upstream to unassigned', () => {
    const baseline = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)) as TrackerSnapshot;
    const vCam1Base = baseline.sources.find((s) => s.name === 'vCam-01')!;
    const vTie101Base = baseline.sources.find((s) => s.name === 'vTie-101')!;
    vCam1Base.upstreamSourceId = vTie101Base.id;

    const draft = JSON.parse(JSON.stringify(baseline)) as TrackerSnapshot;
    const vCam1Draft = draft.sources.find((s) => s.name === 'vCam-01')!;
    vCam1Draft.upstreamSourceId = null;

    const changes = diffSnapshots(baseline, draft);
    expect(changes).toHaveLength(1);

    const change = changes[0];
    expect(change.previousValue).toBe('vTie-101');
    expect(change.newValue).toBe('Unassigned');
    expect(change.description).toBe('vCam-01 upstream cleared from vTie-101');
  });

  it('persists upstream source changes across repository reload', async () => {
    const storage = new MemoryTrackerStorage();
    const repo1 = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const initial = await repo1.getSnapshot();

    const draft = JSON.parse(JSON.stringify(initial)) as TrackerSnapshot;
    const vCam1 = draft.sources.find((s) => s.name === 'vCam-01')!;
    const vTie101 = draft.sources.find((s) => s.name === 'vTie-101')!;
    vCam1.upstreamSourceId = vTie101.id;

    const changeSet = createChangeSet(initial, draft);
    await repo1.saveSnapshot(draft, changeSet);

    // Verify reloaded repository instance sees the persisted upstream relationship
    const repo2 = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const reloaded = await repo2.getSnapshot();
    const reloadedCam = reloaded.sources.find((s) => s.name === 'vCam-01')!;

    expect(reloadedCam.upstreamSourceId).toBe(vTie101.id);
  });

  it('preserves existing VIP destination assignments to direct VIP Source rather than rewriting to upstream or origin', async () => {
    const storage = new MemoryTrackerStorage();
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    const initial = await repo.getSnapshot();

    const draft = JSON.parse(JSON.stringify(initial)) as TrackerSnapshot;
    const vCam1 = draft.sources.find((s) => s.name === 'vCam-01')!;
    const vTie101 = draft.sources.find((s) => s.name === 'vTie-101')!;
    const swr201 = draft.sources.find((s) => s.name === 'Swr-201')!;

    // 1. Assign vCam-01 directly to destination MV-01-01
    const dest1 = draft.destinations.find(
      (d) => d.multiviewId === 'MV-01' && d.destinationNumber === 1
    )!;
    dest1.assignedSourceId = vCam1.id;

    // 2. Establish upstream chain: Swr-201 -> vTie-101 -> vCam-01
    vTie101.upstreamSourceId = swr201.id;
    vCam1.upstreamSourceId = vTie101.id;

    const changeSet = createChangeSet(initial, draft);
    const saved = await repo.saveSnapshot(draft, changeSet);

    // VIP destination assignment MUST remain vCam-01
    const savedDest1 = saved.destinations.find(
      (d) => d.multiviewId === 'MV-01' && d.destinationNumber === 1
    )!;
    expect(savedDest1.assignedSourceId).toBe(vCam1.id);
    expect(savedDest1.assignedSourceId).not.toBe(vTie101.id);
    expect(savedDest1.assignedSourceId).not.toBe(swr201.id);
  });

  it('confirms all 231 seeded sources retain upstreamSourceId: null before operator editing', () => {
    expect(SEED_SOURCES).toHaveLength(231);
    for (const s of SEED_SOURCES) {
      expect(s.upstreamSourceId).toBeNull();
    }
  });

  it('confirms no production upstream mappings were invented in seed or initial data', () => {
    for (const s of INITIAL_SNAPSHOT.sources) {
      expect(s.upstreamSourceId).toBeNull();
    }
  });
});
