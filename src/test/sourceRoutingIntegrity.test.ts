import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import {
  getAuthoritativeLawoDropdownSources,
  getAuthoritativeProcessingDropdownSources,
  getAuthoritativeTielineDropdownSources,
  getValidTielineOptions,
  resolveDestinationSignalFlows,
} from '../domain/signalFlow';
import { selectDestinationsForMultiview } from '../domain/selectors';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { SourceId, DestinationId } from '../domain/identifiers';
import {
  buildLegacySourceMigrationPlan,
  migrateLegacySourceReferences,
  reconcilePersistedSources,
} from '../services/sourceReconciliation';
import { Destination, Source, TrackerSnapshot } from '../domain/models';

describe('Source Routing Reference Integrity & Legacy Migration', () => {
  it('11. invariant: selectable routable IDs minus canonical resolvable IDs equals empty set', () => {
    const canonicalSourceIds = new Set<string>(INITIAL_SNAPSHOT.sources.map((s) => s.id));

    const lawoSources = getAuthoritativeLawoDropdownSources(INITIAL_SNAPSHOT.sources);
    const procSources = getAuthoritativeProcessingDropdownSources(INITIAL_SNAPSHOT.sources);
    const tielineSources = getAuthoritativeTielineDropdownSources(INITIAL_SNAPSHOT.sources);
    const validTielines = getValidTielineOptions(INITIAL_SNAPSHOT.sources);

    const selectableRoutableIds = new Set<string>([
      ...lawoSources.map((s) => s.id),
      ...procSources.map((s) => s.id),
      ...tielineSources.map((s) => s.id),
      ...validTielines.map((s) => s.id),
    ]);

    const unresolvableIds = Array.from(selectableRoutableIds).filter(
      (id) => !canonicalSourceIds.has(id)
    );

    expect(unresolvableIds).toEqual([]);
    expect(canonicalSourceIds.has('SRC:VCAM_31')).toBe(true);
    expect(canonicalSourceIds.has('SRC:VCAM_32')).toBe(true);
    expect(selectableRoutableIds.has('SRC:VCAM_31')).toBe(true);
    expect(selectableRoutableIds.has('SRC:VCAM_32')).toBe(true);
  });

  it('1, 2, 3, 4, 5. legacy vCam-32 migrates to canonical vCam 32, preserving destination flow and display name', async () => {
    // 1. Create a legacy snapshot with DEST:MV-01-02 pointing to legacy vCam-32
    const legacySnapshot: TrackerSnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      destinations: [
        {
          id: 'DEST:MV-01-02' as DestinationId,
          multiviewId: 'MV-01',
          destinationNumber: 2,
          assignedSourceId: 'SRC:VCAM-32' as SourceId,
          assignmentName: 'CAM 32 RETURN',
          locked: false,
          updatedAt: '2026-10-01T12:00:00Z',
          updatedBy: 'Test Op',
        },
      ],
      sources: [
        {
          id: 'SRC:VCAM-32' as SourceId,
          name: 'vCam-32',
          category: 'Virtual Camera',
          active: true,
          upstreamSourceId: null,
          sourceType: 'virtual',
          router: 'Evertz',
          routeRole: 'tieline',
        },
      ],
      metadata: {
        schemaVersion: 1,
        sourceWorkbook: 'data/import/Evertz VIP Source Tracker.xlsx',
        sourceWorkbookHash: 'legacy-hash',
        generatorVersion: '1.0.0',
      },
    };

    // 2. Perform migration
    const { snapshot: migrated, report } = migrateLegacySourceReferences(
      legacySnapshot,
      INITIAL_SNAPSHOT.sources
    );

    // Assert mapping report
    const mapping = report.safeMappings.find((m) => m.legacyId === 'SRC:VCAM-32');
    expect(mapping).toBeDefined();
    expect(mapping?.canonicalId).toBe('SRC:VCAM_32');
    expect(mapping?.canonicalName).toBe('vCam 32');

    // 3. Persisted reference uses canonical identity
    const dest = migrated.destinations.find((d) => d.id === 'DEST:MV-01-02');
    expect(dest).toBeDefined();
    expect(dest?.assignedSourceId).toBe('SRC:VCAM_32');
    expect(dest?.assignmentName).toBe('CAM 32 RETURN'); // Assignment preserved

    // 4. Reloading snapshot resolves route correctly without unresolvable errors
    const memoryStorage = new MemoryTrackerStorage();
    const repo = new LocalTrackerRepository(migrated, memoryStorage);
    const reloaded = await repo.getSnapshot();
    const reloadedDest = reloaded.destinations.find((d) => d.id === 'DEST:MV-01-02');
    expect(reloadedDest?.assignedSourceId).toBe('SRC:VCAM_32');

    // 5. UI selectors display canonical name "vCam 32"
    const rows = selectDestinationsForMultiview(reloaded, 'MV-01');
    const row02 = rows.find((r) => r.destination.id === 'DEST:MV-01-02');
    expect(row02?.source?.name).toBe('vCam 32');

    const flows = resolveDestinationSignalFlows(reloaded, 'MV-01');
    const flow02 = flows.get('DEST:MV-01-02' as DestinationId);
    expect(flow02?.immediateSource?.name).toBe('vCam 32');
    expect(flow02?.immediateSource?.id).toBe('SRC:VCAM_32');
  });

  it('6. representative legacy mappings from other inventory categories migrate safely', () => {
    const legacySnapshot: TrackerSnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      destinations: [
        {
          id: 'DEST:MV-01-01' as DestinationId,
          multiviewId: 'MV-01',
          destinationNumber: 1,
          assignedSourceId: 'SRC:J2K_CLIP-1A' as SourceId,
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
        {
          id: 'DEST:MV-01-03' as DestinationId,
          multiviewId: 'MV-01',
          destinationNumber: 3,
          assignedSourceId: 'SRC:SWR-203' as SourceId,
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
        {
          id: 'DEST:MV-01-04' as DestinationId,
          multiviewId: 'MV-01',
          destinationNumber: 4,
          assignedSourceId: 'SRC:VINGEST-12' as SourceId,
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
        {
          id: 'DEST:MV-01-05' as DestinationId,
          multiviewId: 'MV-01',
          destinationNumber: 5,
          assignedSourceId: 'SRC:VTIE-118' as SourceId,
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
        {
          id: 'DEST:MV-01-06' as DestinationId,
          multiviewId: 'MV-01',
          destinationNumber: 6,
          assignedSourceId: 'SRC:VPGM-04' as SourceId,
          assignmentName: null,
          locked: false,
          updatedAt: null,
          updatedBy: null,
        },
      ],
      sources: [
        {
          id: 'SRC:J2K_CLIP-1A' as SourceId,
          name: 'J2K Clip-1A',
          normalizedName: 'J2K CLIP-1A',
          category: 'J2K Clip',
          active: true,
          upstreamSourceId: null,
          sourceType: 'originating',
        },
        {
          id: 'SRC:SWR-203' as SourceId,
          name: 'Swr-203',
          normalizedName: 'SWR-203',
          category: 'Switcher',
          active: true,
          upstreamSourceId: null,
          sourceType: 'originating',
        },
        {
          id: 'SRC:VINGEST-12' as SourceId,
          name: 'vIngest-12',
          normalizedName: 'VINGEST-12',
          category: 'Virtual Ingest',
          active: true,
          upstreamSourceId: null,
          sourceType: 'virtual',
        },
        {
          id: 'SRC:VTIE-118' as SourceId,
          name: 'vTie-118',
          normalizedName: 'VTIE-118',
          category: 'Virtual Tie',
          active: true,
          upstreamSourceId: null,
          sourceType: 'virtual',
        },
        {
          id: 'SRC:VPGM-04' as SourceId,
          name: 'vPgm-04',
          normalizedName: 'VPGM-04',
          category: 'Virtual Program',
          active: true,
          upstreamSourceId: null,
          sourceType: 'virtual',
        },
      ],
    };

    const { snapshot: migrated, report } = migrateLegacySourceReferences(
      legacySnapshot,
      INITIAL_SNAPSHOT.sources
    );

    expect(report.safeMappings.length).toBe(5);
    expect(migrated.destinations.find((d) => d.id === 'DEST:MV-01-01')?.assignedSourceId).toBe(
      'SRC:J2K_CLIP_1A'
    );
    expect(migrated.destinations.find((d) => d.id === 'DEST:MV-01-03')?.assignedSourceId).toBe(
      'SRC:SWR_203'
    );
    expect(migrated.destinations.find((d) => d.id === 'DEST:MV-01-04')?.assignedSourceId).toBe(
      'SRC:VINGEST_12'
    );
    expect(migrated.destinations.find((d) => d.id === 'DEST:MV-01-05')?.assignedSourceId).toBe(
      'SRC:VTIE_118'
    );
    expect(migrated.destinations.find((d) => d.id === 'DEST:MV-01-06')?.assignedSourceId).toBe(
      'SRC:VPGM_04'
    );
  });

  it('7. ambiguous mappings are NOT automatically migrated', () => {
    // Construct synthetic seed sources with ambiguous normalized names
    const ambiguousSeedSources: Source[] = [
      {
        id: 'SRC:CAMERA_A' as SourceId,
        name: 'Camera-01',
        normalizedName: 'CAMERA-01',
        category: 'Virtual Camera',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
      },
      {
        id: 'SRC:CAMERA_B' as SourceId,
        name: 'Camera 01',
        normalizedName: 'CAMERA 01',
        category: 'Virtual Camera',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
      },
    ];

    const legacySources: Source[] = [
      {
        id: 'SRC:CAM_01_LEGACY' as SourceId,
        name: 'Camera 01',
        normalizedName: 'CAMERA 01',
        category: 'Virtual Camera',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
      },
    ];

    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01' as DestinationId,
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: 'SRC:CAM_01_LEGACY' as SourceId,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    const { report, legacyToCanonicalMap } = buildLegacySourceMigrationPlan(
      legacySources,
      ambiguousSeedSources,
      destinations
    );

    expect(report.ambiguousMappings.length).toBe(1);
    expect(report.ambiguousMappings[0].legacyId).toBe('SRC:CAM_01_LEGACY');
    expect(report.ambiguousMappings[0].candidates.length).toBe(2);
    expect(legacyToCanonicalMap.has('SRC:CAM_01_LEGACY' as SourceId)).toBe(false);

    // Destination remains untouched
    const reconciled = reconcilePersistedSources(legacySources, ambiguousSeedSources, {
      destinations,
    });
    expect(destinations[0].assignedSourceId).toBe('SRC:CAM_01_LEGACY');
    // Legacy source is preserved because it is still referenced
    expect(reconciled.some((s) => s.id === 'SRC:CAM_01_LEGACY')).toBe(true);
  });

  it('8. unmatched legacy records are NOT deleted and remain intact in sources', () => {
    const unmatchedSources: Source[] = [
      {
        id: 'SRC:TX_TWD_9901' as SourceId,
        name: 'Tx TWD 9901',
        normalizedName: 'TX TWD 9901',
        category: 'Transmission',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
      },
    ];

    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01' as DestinationId,
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: 'SRC:TX_TWD_9901' as SourceId,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    const { report } = buildLegacySourceMigrationPlan(
      unmatchedSources,
      INITIAL_SNAPSHOT.sources,
      destinations
    );

    expect(report.unmatchedRecords.length).toBe(1);
    expect(report.unmatchedRecords[0].legacyId).toBe('SRC:TX_TWD_9901');

    const reconciled = reconcilePersistedSources(unmatchedSources, INITIAL_SNAPSHOT.sources, {
      destinations,
    });
    expect(destinations[0].assignedSourceId).toBe('SRC:TX_TWD_9901');
    expect(reconciled.some((s) => s.id === 'SRC:TX_TWD_9901')).toBe(true);
  });

  it('9. existing canonical flows remain unchanged during migration', () => {
    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01' as DestinationId,
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: 'SRC:VCAM_31' as SourceId, // Already canonical
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    const { report, legacyToCanonicalMap } = buildLegacySourceMigrationPlan(
      INITIAL_SNAPSHOT.sources,
      INITIAL_SNAPSHOT.sources,
      destinations
    );

    expect(report.safeMappings.length).toBe(0);
    expect(legacyToCanonicalMap.size).toBe(0);
    expect(destinations[0].assignedSourceId).toBe('SRC:VCAM_31');
  });

  it('10. snapshot/reference validation remains strict against unresolvable source IDs', () => {
    const destinations: Destination[] = [
      {
        id: 'DEST:MV-01-01' as DestinationId,
        multiviewId: 'MV-01',
        destinationNumber: 1,
        assignedSourceId: 'SRC:TOTALLY_UNKNOWN_SOURCE' as SourceId,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    expect(() => {
      const repo = new GitHubTrackerRepository({
        config: {
          owner: 'test',
          repo: 'VIP-Tracker-Data',
          branch: 'main',
          path: 'data/tracker.json',
        },
        tokenProvider: () => 'token',
      });
      // Call internal pre-write validation directly via synthetic payload
      (
        repo as unknown as { validatePreWriteIntegrity: (s: TrackerSnapshot) => void }
      ).validatePreWriteIntegrity({
        ...INITIAL_SNAPSHOT,
        destinations,
      });
    }).toThrowError(/references unresolvable source ID "SRC:TOTALLY_UNKNOWN_SOURCE"/);
  });
});
