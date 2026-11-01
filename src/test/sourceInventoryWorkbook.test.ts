import { describe, it, expect } from 'vitest';
import {
  WORKBOOK_SOURCE_INVENTORY,
  SOURCE_INVENTORY_METADATA,
  SEED_ALL_SOURCES,
  SEED_LAWO_SOURCES,
  SEED_LAWO_PROCESSING_DEVICES,
  SEED_EVERTZ_SOURCES,
} from '../data/seed/sourceInventory';
import { SEED_SOURCES } from '../data/seed/sources';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { createSourceId } from '../domain/identifiers';
import {
  getValidLawoSourceOptions,
  getValidProcessingStageOptions,
  getValidTielineOptions,
  resolveSignalFlow,
} from '../domain/signalFlow';
import { selectFilteredSources } from '../domain/selectors';

describe('Source Inventory Workbook Ingestion & Invariants (Phase 6 Validation)', () => {
  describe('1 & 2. Workbook Inventories Parsing & Non-fabrication', () => {
    it('parses exact counts for each independent inventory list from the workbook', () => {
      expect(WORKBOOK_SOURCE_INVENTORY.lawoSources).toHaveLength(445);
      expect(WORKBOOK_SOURCE_INVENTORY.lawoProcessing).toHaveLength(138);
      expect(WORKBOOK_SOURCE_INVENTORY.lawoTielines).toHaveLength(117);
      expect(WORKBOOK_SOURCE_INVENTORY.evertzSources).toHaveLength(267);
      expect(WORKBOOK_SOURCE_INVENTORY.evertzMvInputs).toHaveLength(264);

      // Verify authoritative derived seed collections
      expect(SEED_ALL_SOURCES).toHaveLength(712);
      expect(SEED_LAWO_SOURCES).toHaveLength(307);
      expect(SEED_LAWO_PROCESSING_DEVICES).toHaveLength(138);
      expect(SEED_EVERTZ_SOURCES).toHaveLength(267);

      expect(SOURCE_INVENTORY_METADATA.counts.lawoSources).toBe(445);
      expect(SOURCE_INVENTORY_METADATA.counts.lawoProcessing).toBe(138);
      expect(SOURCE_INVENTORY_METADATA.counts.lawoTielines).toBe(117);
      expect(SOURCE_INVENTORY_METADATA.counts.evertzSources).toBe(267);
      expect(SOURCE_INVENTORY_METADATA.counts.evertzMvInputs).toBe(264);
      expect(SOURCE_INVENTORY_METADATA.counts.unifiedSources).toBe(712);
    });

    it('ensures no blank rows or empty cells created bogus inventory entries', () => {
      const allItems = [
        ...WORKBOOK_SOURCE_INVENTORY.lawoSources,
        ...WORKBOOK_SOURCE_INVENTORY.lawoProcessing,
        ...WORKBOOK_SOURCE_INVENTORY.lawoTielines,
        ...WORKBOOK_SOURCE_INVENTORY.evertzSources,
        ...WORKBOOK_SOURCE_INVENTORY.evertzMvInputs,
      ];

      for (const item of allItems) {
        expect(item.name.trim().length).toBeGreaterThan(0);
        expect(item.displayName.trim().length).toBeGreaterThan(0);
        expect(item.type.trim().length).toBeGreaterThan(0);
        expect(item.id.trim().length).toBeGreaterThan(0);
        expect(item.name).not.toMatch(/^(UNKNOWN|N\/A|TBD|Admin)$/i);
      }
    });
  });

  describe('3. Display Names Preservation', () => {
    it('preserves exact operator-facing display names from Excel without unwanted normalization', () => {
      const evertzNames = new Set(WORKBOOK_SOURCE_INVENTORY.evertzSources.map((s) => s.name));
      const lawoNames = new Set(WORKBOOK_SOURCE_INVENTORY.lawoSources.map((s) => s.name));
      const procNames = new Set(WORKBOOK_SOURCE_INVENTORY.lawoProcessing.map((s) => s.name));
      const mvInputNames = new Set(WORKBOOK_SOURCE_INVENTORY.evertzMvInputs.map((s) => s.name));

      // Spaced names in Excel are preserved as spaced names
      expect(evertzNames.has('vCam 01')).toBe(true);
      expect(evertzNames.has('vTie 101')).toBe(true);
      expect(evertzNames.has('TX TWD 8801')).toBe(true);
      expect(evertzNames.has('RX TWD 9901')).toBe(true);
      expect(evertzNames.has('Swr 201')).toBe(true);
      expect(evertzNames.has('Caption Enc 01')).toBe(true);
      expect(evertzNames.has('MV 01-01')).toBe(true);

      // Lawo source names
      expect(lawoNames.has('BSP-B 101')).toBe(true);
      expect(lawoNames.has('LiveU 101')).toBe(true);
      expect(lawoNames.has('Caption-01 Closed')).toBe(true);

      // Processing names
      expect(procNames.has('UDX 01')).toBe(true);
      expect(procNames.has('FS 101')).toBe(true);
      expect(procNames.has('CC 01')).toBe(true);
      expect(procNames.has('Caption-01 Closed')).toBe(true);

      // Evertz MV Inputs
      expect(mvInputNames.has('MV-01-01')).toBe(true);
      expect(mvInputNames.has('MV-05-64')).toBe(true);
    });
  });

  describe('4. Types Mapping', () => {
    it('preserves exact type strings from Excel on all inventory items', () => {
      const lawoTypes = new Set(WORKBOOK_SOURCE_INVENTORY.lawoSources.map((s) => s.type));
      expect(lawoTypes).toContain('BSP');
      expect(lawoTypes).toContain('Frame Sync');
      expect(lawoTypes).toContain('Color Corrector');
      expect(lawoTypes).toContain('UDX');
      expect(lawoTypes).toContain('Haivision');
      expect(lawoTypes).toContain('LiveU');

      const procTypes = new Set(WORKBOOK_SOURCE_INVENTORY.lawoProcessing.map((s) => s.type));
      expect(Array.from(procTypes).sort()).toEqual(
        ['Caption', 'Color Corrector', 'Frame Sync', 'UDX'].sort()
      );

      const tielineTypes = new Set(WORKBOOK_SOURCE_INVENTORY.lawoTielines.map((s) => s.type));
      expect(Array.from(tielineTypes).sort()).toEqual(['vCam', 'vIngest', 'vPgm', 'vTie'].sort());

      const mvInputTypes = new Set(WORKBOOK_SOURCE_INVENTORY.evertzMvInputs.map((s) => s.type));
      expect(Array.from(mvInputTypes).sort()).toEqual(
        ['MV 01', 'MV 02', 'MV 03', 'MV 04', 'MV 05'].sort()
      );
    });
  });

  describe('5 & 6. Deterministic IDs & Duplicate Prevention', () => {
    it('generates strictly unique, stable, deterministic IDs for all 712 unified sources', () => {
      expect(SEED_ALL_SOURCES).toHaveLength(712);
      const idSet = new Set<string>();

      for (const s of SEED_ALL_SOURCES) {
        expect(s.id).toBe(createSourceId(s.name));
        expect(s.id.startsWith('SRC:')).toBe(true);
        expect(idSet.has(s.id)).toBe(false);
        idSet.add(s.id);
      }

      expect(idSet.size).toBe(712);
    });

    it('ensures zero duplicate display names within each discrete inventory list', () => {
      const verifyNoDuplicates = (names: string[], label: string) => {
        const seen = new Set<string>();
        for (const name of names) {
          expect(seen.has(name), `Duplicate ${name} in ${label}`).toBe(false);
          seen.add(name);
        }
      };

      verifyNoDuplicates(
        WORKBOOK_SOURCE_INVENTORY.lawoSources.map((s) => s.name),
        'Lawo Sources'
      );
      verifyNoDuplicates(
        WORKBOOK_SOURCE_INVENTORY.lawoProcessing.map((s) => s.name),
        'Lawo Processing'
      );
      verifyNoDuplicates(
        WORKBOOK_SOURCE_INVENTORY.lawoTielines.map((s) => s.name),
        'Lawo Tielines'
      );
      verifyNoDuplicates(
        WORKBOOK_SOURCE_INVENTORY.evertzSources.map((s) => s.name),
        'Evertz Sources'
      );
      verifyNoDuplicates(
        WORKBOOK_SOURCE_INVENTORY.evertzMvInputs.map((s) => s.name),
        'Evertz MV Inputs'
      );
    });
  });

  describe('7 & 8. Category Independence & Zero Row-Coupling Invariant', () => {
    it('keeps inventory categories logically distinguishable without merging', () => {
      const evertzOnly = SEED_ALL_SOURCES.filter((s) => s.routeRole === 'evertz_source');
      const tielines = SEED_ALL_SOURCES.filter((s) => s.routeRole === 'tieline');
      const lawoOrigin = SEED_ALL_SOURCES.filter((s) => s.routeRole === 'lawo_source');
      const processing = SEED_ALL_SOURCES.filter((s) => s.routeRole === 'processing');

      expect(evertzOnly).toHaveLength(150);
      expect(tielines).toHaveLength(117);
      expect(lawoOrigin).toHaveLength(307);
      expect(processing).toHaveLength(138);

      expect(evertzOnly.length + tielines.length + lawoOrigin.length + processing.length).toBe(712);
    });

    it('DOES NOT infer signal-flow relationships from Excel row position (Row 2 is not connected)', () => {
      // Row 2 in Excel contains:
      // Col 1: 'BSP-B 101'
      // Col 3: 'Caption-01 Closed'
      // Col 5: 'vCam 01'
      // Col 7: 'vCam 01'
      // Col 9: 'MV-01-01'
      // Per Important Data Model Rule: A row is NOT an end-to-end signal flow.
      const bspB101 = SEED_SOURCES.find((s) => s.name === 'BSP-B 101')!;
      const caption01Closed = SEED_SOURCES.find((s) => s.name === 'Caption-01 Closed')!;
      const vCam01 = SEED_SOURCES.find((s) => s.name === 'vCam 01')!;
      const dest01 = INITIAL_SNAPSHOT.destinations.find((d) => d.id === 'DEST:MV-01-01')!;

      expect(bspB101).toBeDefined();
      expect(caption01Closed).toBeDefined();
      expect(vCam01).toBeDefined();
      expect(dest01).toBeDefined();

      // Invariant: all seeded sources default to upstreamSourceId: null
      expect(bspB101.upstreamSourceId).toBeNull();
      expect(caption01Closed.upstreamSourceId).toBeNull();
      expect(vCam01.upstreamSourceId).toBeNull();

      // Invariant: destinations do not fabricate source assignments based on row position
      expect(dest01.assignedSourceId).toBeNull();

      // Invariant: resolving signal flow for vCam 01 does NOT link to BSP-B 101
      const flow = resolveSignalFlow(vCam01.id, SEED_SOURCES);
      expect(flow.hops.map((h) => h.id)).toEqual([vCam01.id]);
      expect(flow.originSource?.id).toBe(vCam01.id);
    });
  });

  describe('9. Source Directory Functionality', () => {
    it('supports category filtering, inventory group filtering, and search in Source Directory', () => {
      // 1. All sources
      const all = selectFilteredSources(SEED_SOURCES, 'ALL', '');
      expect(all).toHaveLength(712);

      // 2. Filter by inventory group
      const lawoSources = selectFilteredSources(SEED_SOURCES, 'ALL', '', 'lawo-source');
      expect(lawoSources).toHaveLength(445);

      const processing = selectFilteredSources(SEED_SOURCES, 'ALL', '', 'lawo-processing');
      expect(processing).toHaveLength(138);

      const tielines = selectFilteredSources(SEED_SOURCES, 'ALL', '', 'lawo-destination/tieline');
      expect(tielines).toHaveLength(117);

      const evertz = selectFilteredSources(SEED_SOURCES, 'ALL', '', 'evertz-source');
      expect(evertz).toHaveLength(267);

      // 3. Search query
      const searchBsp = selectFilteredSources(SEED_SOURCES, 'ALL', 'BSP-B 101');
      expect(searchBsp).toHaveLength(1);
      expect(searchBsp[0].name).toBe('BSP-B 101');

      const searchUdx = selectFilteredSources(SEED_SOURCES, 'ALL', 'UDX');
      expect(searchUdx.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('10. Signal Flows Stage Selectors Scope', () => {
    it('restricts Signal Flows selectors strictly to their authoritative roles', () => {
      const lawoOpts = getValidLawoSourceOptions(SEED_SOURCES);
      const procOpts = getValidProcessingStageOptions(SEED_SOURCES);
      const tielineOpts = getValidTielineOptions(SEED_SOURCES);

      // 1. Lawo source stage only contains originating Lawo sources
      expect(lawoOpts).toHaveLength(307);
      expect(lawoOpts.every((s) => s.routeRole === 'lawo_source')).toBe(true);

      // 2. Processing stage only contains processing devices
      expect(procOpts).toHaveLength(138);
      expect(procOpts.every((s) => s.routeRole === 'processing')).toBe(true);

      // 3. Tieline / Evertz stage only contains tielines and Evertz sources
      expect(tielineOpts).toHaveLength(267);
      expect(
        tielineOpts.every((s) => s.routeRole === 'tieline' || s.routeRole === 'evertz_source')
      ).toBe(true);
    });
  });
});
