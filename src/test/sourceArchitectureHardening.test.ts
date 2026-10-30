import { describe, it, expect } from 'vitest';
import { SEED_SOURCES, RAW_SEED_SOURCE_NAMES } from '../data/seed/sources';
import {
  Source,
  resolveEffectiveSourceAlias,
  MultiviewOutput,
  Destination,
  TrackerSnapshot,
} from '../domain/models';
import {
  getValidTielineOptions,
  getValidLawoSourceOptions,
  getValidProcessingStageOptions,
  resolveSinglePipSignalFlow,
} from '../domain/signalFlow';
import {
  migrateV1ToV2,
  isValidPersistedTrackerData,
  CURRENT_SOURCE_SEED_VERSION,
  TRACKER_SCHEMA_VERSION,
  MemoryTrackerStorage,
} from '../services/storage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { SourceId, PipId, createSourceId } from '../domain/identifiers';

describe('Source Architecture Hardening — Pre-Lawo Import Audits & Invariants', () => {
  describe('Objective 1: Explicit Seed Classification', () => {
    it('ensures all 231 authoritative seed sources have explicit routeRole and router classifications', () => {
      expect(SEED_SOURCES).toHaveLength(RAW_SEED_SOURCE_NAMES.length);

      for (const s of SEED_SOURCES) {
        expect(s.id).toBe(createSourceId(s.name));
        expect(s.id.startsWith('SRC:')).toBe(true);
        expect(s.active).toBe(true);
        expect(s.upstreamSourceId).toBeNull();

        if (/^v/i.test(s.name)) {
          // Virtual Lawo <-> Evertz tielines
          expect(s.routeRole).toBe('tieline');
          expect(s.router).toBe('Both');
          expect(s.sourceType).toBe('virtual');
        } else {
          // Direct Evertz-native sources
          expect(s.routeRole).toBe('evertz_source');
          expect(s.router).toBe('Evertz');
          expect(s.sourceType).toBe('originating');
        }
      }
    });

    it('preserves exact counts of tieline and direct Evertz sources in baseline catalog', () => {
      const tielines = SEED_SOURCES.filter((s) => s.routeRole === 'tieline');
      const evertzSources = SEED_SOURCES.filter((s) => s.routeRole === 'evertz_source');

      expect(tielines.length + evertzSources.length).toBe(SEED_SOURCES.length);
      expect(tielines.length).toBe(117);
      expect(evertzSources.length).toBe(114);
    });
  });

  describe('Objective 2: Source Routing Selector Scope & Evertz Invariants', () => {
    const lawoOrigin: Source = {
      id: 'SRC:LAWO_CAM_01' as SourceId,
      name: 'Sony Cam 01',
      normalizedName: 'SONY CAM 01',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
      routeRole: 'lawo_source',
      router: 'Lawo',
    };

    const lawoProcessing: Source = {
      id: 'SRC:LAWO_UDX_01' as SourceId,
      name: 'UDX-01',
      normalizedName: 'UDX-01',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'processing',
      routeRole: 'processing',
      router: 'Lawo',
    };

    const tielineSource: Source = {
      id: 'SRC:vCam-01' as SourceId,
      name: 'vCam-01',
      normalizedName: 'VCAM-01',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: null,
      sourceType: 'virtual',
      routeRole: 'tieline',
      router: 'Both',
    };

    const directEvertzSource: Source = {
      id: 'SRC:BARS' as SourceId,
      name: 'Bars',
      normalizedName: 'BARS',
      category: 'Test',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
      routeRole: 'evertz_source',
      router: 'Evertz',
    };

    const testSources: Source[] = [lawoOrigin, lawoProcessing, tielineSource, directEvertzSource];

    it('exposes ONLY tielines and evertz_sources to Evertz MV Inputs via getValidTielineOptions', () => {
      const options = getValidTielineOptions(testSources);
      const optionIds = options.map((s) => s.id);

      expect(optionIds).toContain(tielineSource.id);
      expect(optionIds).toContain(directEvertzSource.id);

      // Must NEVER expose originating Lawo sources or processing resources to Evertz MV Input selectors
      expect(optionIds).not.toContain(lawoOrigin.id);
      expect(optionIds).not.toContain(lawoProcessing.id);
    });

    it('maintains distinct options across Signal Flows stages', () => {
      const lawoOptions = getValidLawoSourceOptions(testSources);
      expect(lawoOptions.map((s) => s.id)).toEqual([lawoOrigin.id]);

      const procOptions = getValidProcessingStageOptions(testSources);
      expect(procOptions.map((s) => s.id)).toEqual([lawoProcessing.id]);

      const tielineOptions = getValidTielineOptions(testSources);
      expect(tielineOptions.map((s) => s.id).sort()).toEqual(
        [tielineSource.id, directEvertzSource.id].sort()
      );
    });
  });

  describe('Objective 3: Consistent Alias / UMD Resolution', () => {
    const lawoWithAlias: Source = {
      id: 'SRC:LAWO_CAM_01' as SourceId,
      name: 'Sony Cam 01',
      alias: 'Main Host Cam',
      normalizedName: 'SONY CAM 01',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
      routeRole: 'lawo_source',
    };

    const lawoWithoutAlias: Source = {
      id: 'SRC:LAWO_CAM_02' as SourceId,
      name: 'Sony Cam 02',
      alias: null,
      normalizedName: 'SONY CAM 02',
      category: 'Other',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
      routeRole: 'lawo_source',
    };

    const tielineWithAlias: Source = {
      id: 'SRC:vCam-01' as SourceId,
      name: 'vCam-01',
      alias: 'Fallback Tie UMD',
      normalizedName: 'VCAM-01',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: null,
      sourceType: 'virtual',
      routeRole: 'tieline',
    };

    const tielineWithoutAlias: Source = {
      id: 'SRC:vCam-02' as SourceId,
      name: 'vCam-02',
      alias: null,
      normalizedName: 'VCAM-02',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: null,
      sourceType: 'virtual',
      routeRole: 'tieline',
    };

    it('prefers originating Lawo Source alias when available, otherwise falls back to tieline alias', () => {
      // 1. Both have alias -> prefers originating Lawo source alias
      expect(resolveEffectiveSourceAlias(lawoWithAlias, tielineWithAlias)).toBe('Main Host Cam');

      // 2. Only Lawo has alias -> returns Lawo source alias
      expect(resolveEffectiveSourceAlias(lawoWithAlias, tielineWithoutAlias)).toBe('Main Host Cam');

      // 3. Only Tieline has alias -> returns Tieline alias
      expect(resolveEffectiveSourceAlias(lawoWithoutAlias, tielineWithAlias)).toBe(
        'Fallback Tie UMD'
      );

      // 4. Neither has alias -> returns null
      expect(resolveEffectiveSourceAlias(lawoWithoutAlias, tielineWithoutAlias)).toBeNull();

      // 5. Handles null/undefined cleanly
      expect(resolveEffectiveSourceAlias(null, null)).toBeNull();
      expect(resolveEffectiveSourceAlias(undefined, tielineWithAlias)).toBe('Fallback Tie UMD');
    });

    it('resolves consistent effective alias inside resolveSinglePipSignalFlow', () => {
      const tiedCam: Source = {
        ...tielineWithAlias,
        upstreamSourceId: lawoWithAlias.id,
      };

      const baseDest = INITIAL_SNAPSHOT.destinations[0];
      const dest: Destination = {
        ...baseDest,
        assignedSourceId: tiedCam.id,
      };

      const baseOutput = INITIAL_SNAPSHOT.outputs[0];
      const output: MultiviewOutput = {
        ...baseOutput,
        layoutName: '4 BOX',
        pipAssignments: { 'PIP-01': dest.id },
      };

      const snapshot: TrackerSnapshot = {
        ...INITIAL_SNAPSHOT,
        outputs: [output],
        destinations: [dest],
        sources: [lawoWithAlias, tiedCam],
      };

      const flow = resolveSinglePipSignalFlow(output, 'PIP-01' as PipId, 0, snapshot);
      expect(flow.alias).toBe('Main Host Cam');
      expect(flow.aliasSource?.id).toBe(lawoWithAlias.id);
    });
  });

  describe('Objective 4: Storage Field Preservation', () => {
    it('preserves all 12 Source properties through migrateV1ToV2', () => {
      const fullSource: Record<string, unknown> = {
        id: 'SRC:TEST_FULL',
        name: 'Test Full Source',
        alias: 'TFS UMD',
        normalizedName: 'TEST FULL SOURCE',
        category: 'Transmission',
        active: true,
        upstreamSourceId: 'SRC:UPSTREAM_01',
        sourceType: 'virtual',
        routeRole: 'tieline',
        deviceType: 'UDX',
        vendor: 'Lawo',
        router: 'Both',
        inputLabel: 'In 1',
        outputLabel: 'Out 1',
        metadata: { facility: 'DC', port: 101, valid: true },
        updatedAt: '2026-10-30T10:00:00Z',
        updatedBy: 'Tech Ops',
        operatorId: 'OP:TECH_OPS',
      };

      const v1Data = {
        schemaVersion: 1,
        outputs: [],
        destinations: [],
        sources: [fullSource],
        operationalAssignments: [],
        changeRecords: [],
        savedAt: '2026-10-30T10:00:00Z',
      };

      const migrated = migrateV1ToV2(v1Data);
      expect(migrated).not.toBeNull();
      const s = migrated!.sources[0];

      expect(s.id).toBe('SRC:TEST_FULL');
      expect(s.name).toBe('Test Full Source');
      expect(s.alias).toBe('TFS UMD');
      expect(s.normalizedName).toBe('TEST FULL SOURCE');
      expect(s.category).toBe('Transmission');
      expect(s.active).toBe(true);
      expect(s.upstreamSourceId).toBe('SRC:UPSTREAM_01');
      expect(s.sourceType).toBe('virtual');
      expect(s.routeRole).toBe('tieline');
      expect(s.deviceType).toBe('UDX');
      expect(s.vendor).toBe('Lawo');
      expect(s.router).toBe('Both');
      expect(s.inputLabel).toBe('In 1');
      expect(s.outputLabel).toBe('Out 1');
      expect(s.metadata).toEqual({ facility: 'DC', port: 101, valid: true });
      expect(s.updatedAt).toBe('2026-10-30T10:00:00Z');
      expect(s.updatedBy).toBe('Tech Ops');
      expect(s.operatorId).toBe('OP:TECH_OPS');

      expect(isValidPersistedTrackerData(migrated)).toBe(true);
    });

    it('upgrades existing stored sources missing routeRole or router on LocalTrackerRepository load', async () => {
      const storage = new MemoryTrackerStorage();
      const legacySource: Source = {
        id: 'SRC:BARS' as SourceId,
        name: 'Bars',
        normalizedName: 'BARS',
        category: 'Test',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
        // routeRole and router intentionally omitted (simulating V1 persisted data)
      };

      storage.save({
        schemaVersion: TRACKER_SCHEMA_VERSION,
        sourceSeedVersion: 1, // Prior seed version
        outputs: INITIAL_SNAPSHOT.outputs,
        destinations: INITIAL_SNAPSHOT.destinations,
        sources: [legacySource],
        operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
        changeRecords: [],
        savedAt: new Date().toISOString(),
      });

      const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
      const snap = await repo.getSnapshot();

      expect(snap.sources).toHaveLength(1);
      const bars = snap.sources[0];
      expect(bars.id).toBe('SRC:BARS');
      // Should have been safely upgraded from initialSnapshot seed metadata
      expect(bars.routeRole).toBe('evertz_source');
      expect(bars.router).toBe('Evertz');

      // Updated in storage with bumped version
      expect(storage.load()?.sourceSeedVersion).toBe(CURRENT_SOURCE_SEED_VERSION);
    });
  });
});
