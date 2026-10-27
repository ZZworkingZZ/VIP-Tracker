import { describe, it, expect } from 'vitest';
import {
  Destination,
  MultiviewOutput,
  TrackerSnapshot,
  TrackerSnapshotMetadata,
  Source,
} from '../domain/models';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { validateSnapshot } from '../domain/validation';
import { serializeTrackerSnapshot, deserializeTrackerSnapshot } from '../domain/serialization';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import {
  MemoryTrackerStorage,
  TRACKER_SCHEMA_VERSION,
  CURRENT_SOURCE_SEED_VERSION,
} from '../services/storage';

describe('Phase 1: Domain / Schema Compatibility', () => {
  const syntheticSource: Source = {
    id: 'SRC:SYNTH_SRC_01' as import('../domain/identifiers').SourceId,
    name: 'SYNTH-SRC-01',
    normalizedName: 'SYNTH-SRC-01',
    category: 'Virtual Camera',
    active: true,
    upstreamSourceId: null,
    sourceType: 'originating',
  };

  describe('Destination lawoSourceName compatibility', () => {
    it('supports Evertz source only without Lawo source', () => {
      const dest: Destination = {
        id: 'DEST:MV-01-01',
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: syntheticSource.id,
        lawoSourceName: null,
        assignmentName: 'SYNTH_ASSIGNMENT',
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(dest.assignedSourceId).toBe(syntheticSource.id);
      expect(dest.lawoSourceName).toBeNull();
    });

    it('supports Lawo source only with assignedSourceId as null', () => {
      const dest: Destination = {
        id: 'DEST:MV-01-02',
        multiviewId: 'MV-01',
        destinationNumber: 2,
        assignedSourceId: null,
        lawoSourceName: 'SYNTH_LAWO_ONLY_SRC',
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(dest.assignedSourceId).toBeNull();
      expect(dest.lawoSourceName).toBe('SYNTH_LAWO_ONLY_SRC');

      // Validation verifies Lawo-only destination does not produce unknown source error
      const findings = validateSnapshot(INITIAL_SNAPSHOT.multiviews, [], [dest], [syntheticSource]);
      const unknownSourceFindings = findings.filter((f) => f.code === 'DESTINATION_UNKNOWN_SOURCE');
      expect(unknownSourceFindings).toHaveLength(0);
    });

    it('supports both Evertz and Lawo sources populated simultaneously', () => {
      const dest: Destination = {
        id: 'DEST:MV-01-03',
        multiviewId: 'MV-01',
        destinationNumber: 3,
        assignedSourceId: syntheticSource.id,
        lawoSourceName: 'SYNTH_LAWO_UPSTREAM_SRC',
        assignmentName: 'TEST_PROGRAM',
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(dest.assignedSourceId).toBe(syntheticSource.id);
      expect(dest.lawoSourceName).toBe('SYNTH_LAWO_UPSTREAM_SRC');
    });

    it('supports neither Evertz nor Lawo populated', () => {
      const dest: Destination = {
        id: 'DEST:MV-01-04',
        multiviewId: 'MV-01',
        destinationNumber: 4,
        assignedSourceId: null,
        lawoSourceName: null,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(dest.assignedSourceId).toBeNull();
      expect(dest.lawoSourceName).toBeNull();
    });

    it('preserves backward compatibility when lawoSourceName is omitted', () => {
      const legacyDest: Destination = {
        id: 'DEST:MV-01-05',
        multiviewId: 'MV-01',
        destinationNumber: 5,
        assignedSourceId: null,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(legacyDest.lawoSourceName).toBeUndefined();
    });
  });

  describe('MultiviewOutput rawDestinationRange compatibility', () => {
    it('supports null destinationStart and destinationEnd with rawDestinationRange="tbd"', () => {
      const output: MultiviewOutput = {
        id: 'OUT:MV-01-01',
        multiviewId: 'MV-01',
        outputNumber: 1,
        layoutName: null,
        destinationStart: null,
        destinationEnd: null,
        rawDestinationRange: 'tbd',
        assignmentName: null,
        notes: null,
        status: 'Available',
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(output.destinationStart).toBeNull();
      expect(output.destinationEnd).toBeNull();
      expect(output.rawDestinationRange).toBe('tbd');
    });

    it('supports structured numeric range alongside rawDestinationRange', () => {
      const output: MultiviewOutput = {
        id: 'OUT:MV-01-02',
        multiviewId: 'MV-01',
        outputNumber: 2,
        layoutName: '4 BOX',
        destinationStart: 1,
        destinationEnd: 4,
        rawDestinationRange: '1-4',
        assignmentName: 'PROD_A',
        notes: null,
        status: 'Assigned',
        locked: false,
        updatedAt: null,
        updatedBy: null,
      };

      expect(output.destinationStart).toBe(1);
      expect(output.destinationEnd).toBe(4);
      expect(output.rawDestinationRange).toBe('1-4');
    });

    it('preserves backward compatibility when rawDestinationRange is omitted', () => {
      const legacyOutput: MultiviewOutput = {
        id: 'OUT:MV-01-03',
        multiviewId: 'MV-01',
        outputNumber: 3,
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

      expect(legacyOutput.rawDestinationRange).toBeUndefined();
    });
  });

  describe('TrackerSnapshot metadata provenance compatibility', () => {
    it('preserves backward compatibility when metadata is omitted', () => {
      expect(INITIAL_SNAPSHOT.metadata).toBeUndefined();

      const snapshotWithoutMeta: TrackerSnapshot = {
        multiviews: INITIAL_SNAPSHOT.multiviews,
        outputs: INITIAL_SNAPSHOT.outputs,
        destinations: INITIAL_SNAPSHOT.destinations,
        sources: INITIAL_SNAPSHOT.sources,
        operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
        changeRecords: [],
        validationFindings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(snapshotWithoutMeta.metadata).toBeUndefined();
    });

    it('accepts valid TrackerSnapshotMetadata with all required fields', () => {
      const syntheticMetadata: TrackerSnapshotMetadata = {
        schemaVersion: 1,
        sourceWorkbook: 'synthetic/test/workbook.xlsx',
        sourceWorkbookHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        generatorVersion: '1.0.0',
        deterministicGeneration: true,
      };

      const snapshotWithMeta: TrackerSnapshot = {
        metadata: syntheticMetadata,
        multiviews: INITIAL_SNAPSHOT.multiviews,
        outputs: INITIAL_SNAPSHOT.outputs,
        destinations: INITIAL_SNAPSHOT.destinations,
        sources: INITIAL_SNAPSHOT.sources,
        operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
        changeRecords: [],
        validationFindings: [],
        generatedAt: new Date().toISOString(),
      };

      expect(snapshotWithMeta.metadata).toBeDefined();
      expect(snapshotWithMeta.metadata?.schemaVersion).toBe(1);
      expect(snapshotWithMeta.metadata?.sourceWorkbook).toBe('synthetic/test/workbook.xlsx');
      expect(snapshotWithMeta.metadata?.sourceWorkbookHash).toHaveLength(64);
      expect(snapshotWithMeta.metadata?.generatorVersion).toBe('1.0.0');
      expect(snapshotWithMeta.metadata?.deterministicGeneration).toBe(true);
    });

    it('serializes and deserializes snapshot preserving metadata, lawoSourceName, and rawDestinationRange', () => {
      const snapshot: TrackerSnapshot = {
        metadata: {
          schemaVersion: 1,
          sourceWorkbook: 'synthetic/test.xlsx',
          sourceWorkbookHash: 'deadbeef1234',
          generatorVersion: '1.0.0',
        },
        multiviews: INITIAL_SNAPSHOT.multiviews,
        outputs: [
          {
            id: 'OUT:MV-01-01',
            multiviewId: 'MV-01',
            outputNumber: 1,
            layoutName: null,
            destinationStart: null,
            destinationEnd: null,
            rawDestinationRange: 'tbd',
            assignmentName: null,
            notes: null,
            status: 'Available',
            locked: false,
            updatedAt: null,
            updatedBy: null,
          },
        ],
        destinations: [
          {
            id: 'DEST:MV-01-01',
            multiviewId: 'MV-01',
            destinationNumber: 1,
            assignedSourceId: null,
            lawoSourceName: 'SYNTH_LAWO_DEST_1',
            assignmentName: null,
            locked: false,
            updatedAt: null,
            updatedBy: null,
          },
        ],
        sources: [],
        operationalAssignments: [],
        changeRecords: [],
        validationFindings: [],
        generatedAt: '2026-01-01T00:00:00.000Z',
      };

      const json = serializeTrackerSnapshot(snapshot);
      const restored = deserializeTrackerSnapshot(json);

      expect(restored.metadata).toEqual(snapshot.metadata);
      expect(restored.outputs[0].rawDestinationRange).toBe('tbd');
      expect(restored.destinations[0].lawoSourceName).toBe('SYNTH_LAWO_DEST_1');
    });

    it('preserves metadata in LocalTrackerRepository across operations', async () => {
      const syntheticMetadata: TrackerSnapshotMetadata = {
        schemaVersion: 1,
        sourceWorkbook: 'synthetic/repo_test.xlsx',
        sourceWorkbookHash: 'hash1234',
        generatorVersion: '1.0.0',
      };

      const initialWithMeta: TrackerSnapshot = {
        ...INITIAL_SNAPSHOT,
        metadata: syntheticMetadata,
      };

      const storage = new MemoryTrackerStorage();
      const repo = new LocalTrackerRepository(initialWithMeta, storage);

      const snapshot = await repo.getSnapshot();
      expect(snapshot.metadata).toEqual(syntheticMetadata);

      // Verify metadata is preserved after saving modifications
      const updated = await repo.saveSnapshot(snapshot);
      expect(updated.metadata).toEqual(syntheticMetadata);

      // Verify metadata is preserved when hydrated from storage
      storage.save({
        schemaVersion: TRACKER_SCHEMA_VERSION,
        sourceSeedVersion: CURRENT_SOURCE_SEED_VERSION,
        outputs: snapshot.outputs,
        destinations: snapshot.destinations,
        sources: snapshot.sources,
        operationalAssignments: snapshot.operationalAssignments,
        changeRecords: [],
        savedAt: new Date().toISOString(),
      });

      const reloadedRepo = new LocalTrackerRepository(initialWithMeta, storage);
      const reloadedSnapshot = await reloadedRepo.getSnapshot();
      expect(reloadedSnapshot.metadata).toEqual(syntheticMetadata);
    });
  });
});
