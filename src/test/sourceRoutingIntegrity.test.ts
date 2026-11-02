import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import {
  getAuthoritativeLawoDropdownSources,
  getAuthoritativeProcessingDropdownSources,
  getAuthoritativeTielineDropdownSources,
  getValidTielineOptions,
  applyPipTielineStageChange,
  applyPipLawoChainUpdate,
} from '../domain/signalFlow';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { SourceId, DestinationId } from '../domain/identifiers';

describe('Source Routing Reference Integrity', () => {
  it('invariant: selectable routable IDs minus canonical resolvable IDs equals empty set', () => {
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
    expect(selectableRoutableIds.has('SRC:VCAM_31')).toBe(true);
  });

  it('reconciles and saves vCam 31 and other category routes via GitHubTrackerRepository', async () => {
    // Simulate legacy snapshot with only a subset of sources (legacy 267 sources)
    const legacySnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      sources: INITIAL_SNAPSHOT.sources.slice(0, 10), // Only 10 sources
      metadata: {
        schemaVersion: 1,
        sourceWorkbook: 'data/import/Evertz VIP Source Tracker.xlsx',
        sourceWorkbookHash: 'legacy-hash',
        generatorVersion: '1.0.0',
      },
    };

    let savedPayloadContent: string | null = null;
    const repo = new GitHubTrackerRepository({
      config: {
        owner: 'test-owner',
        repo: 'VIP-Tracker-Data',
        branch: 'main',
        path: 'data/tracker.json',
      },
      tokenProvider: () => 'test-token',
      fetchFn: async (_url, init) => {
        if (init?.method === 'PUT') {
          const body = JSON.parse(init.body as string);
          savedPayloadContent = Buffer.from(body.content, 'base64').toString('utf8');
          return new Response(
            JSON.stringify({
              content: { sha: 'updated-sha' },
              commit: { sha: 'commit-sha' },
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            name: 'tracker.json',
            path: 'data/tracker.json',
            sha: 'initial-sha',
            size: 500,
            encoding: 'base64',
            content: Buffer.from(JSON.stringify(legacySnapshot)).toString('base64'),
            type: 'file',
          }),
          { status: 200 }
        );
      },
    });

    const loaded = await repo.loadSnapshot();

    // 1. Verify loaded snapshot automatically reconciled canonical seed sources
    expect(loaded.snapshot.sources.some((s) => s.id === 'SRC:VCAM_31')).toBe(true);
    expect(loaded.snapshot.sources.length).toBeGreaterThanOrEqual(712);

    // 2. Route DEST:MV-01-01 to vCam 31 (SRC:VCAM_31)
    const destId = 'DEST:MV-01-01' as DestinationId;
    const tielineId = 'SRC:VCAM_31' as SourceId;

    const modifiedSnapshot = applyPipTielineStageChange(loaded.snapshot, destId, tielineId, {
      id: 'op-1',
      displayName: 'Test Operator',
    });

    // 3. Save modified snapshot - must succeed without throwing unresolvable source error
    const saved = await repo.saveSnapshot(modifiedSnapshot);
    const dest = saved.destinations.find((d) => d.id === destId);

    expect(dest?.assignedSourceId).toBe('SRC:VCAM_31');
    expect(saved.sources.some((s) => s.id === 'SRC:VCAM_31')).toBe(true);
    expect(savedPayloadContent).not.toBeNull();
  });

  it('saves Lawo source and processing chain updates without unresolvable errors', async () => {
    const memoryStorage = new MemoryTrackerStorage();
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, memoryStorage);

    const snapshot = await repo.getSnapshot();
    const destId = 'DEST:MV-01-01' as DestinationId;

    // Route to a valid tieline
    const tielineId = 'SRC:VCAM_31' as SourceId;
    const afterTieline = applyPipTielineStageChange(snapshot, destId, tielineId);

    // Attach an upstream Lawo source and processing stage
    const lawoSourceId = 'SRC:CAM_01' as SourceId;
    const procStageId = 'SRC:UDX_01' as SourceId;

    const afterChain = applyPipLawoChainUpdate(afterTieline, tielineId, lawoSourceId, [
      procStageId,
    ]);

    const saved = await repo.saveSnapshot(afterChain);
    expect(saved.validationFindings.filter((f) => f.code === 'DESTINATION_UNKNOWN_SOURCE')).toEqual(
      []
    );
  });
});
