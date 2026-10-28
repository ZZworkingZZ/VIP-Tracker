import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/renderWithProviders';
import { HistoryPage, formatHistoryTime } from '../pages/HistoryPage';
import { AppSidebar } from '../components/layout/AppSidebar';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage, TRACKER_SCHEMA_VERSION } from '../services/storage';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import {
  createChangeSet,
  appendHistoryEntries,
  mergeHistoryEntries,
  mergeSnapshotHistory,
  MAX_HISTORY_ENTRIES,
} from '../domain/diff';
import { HistoryEntry, TrackerSnapshot } from '../domain/models';
import { deserializeTrackerSnapshot } from '../domain/serialization';

describe('History Utility & Change Log', () => {
  it('loads legacy data without history field as an empty array', async () => {
    const legacySnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    delete legacySnapshot.history;

    // 1. Serialization helper
    const deserialized = deserializeTrackerSnapshot(JSON.stringify(legacySnapshot));
    expect(deserialized.history).toEqual([]);

    // 2. LocalTrackerRepository with stored data lacking history
    const memoryStorage = new MemoryTrackerStorage();
    memoryStorage.seedRaw({
      schemaVersion: TRACKER_SCHEMA_VERSION,
      outputs: legacySnapshot.outputs,
      destinations: legacySnapshot.destinations,
      sources: legacySnapshot.sources,
      operationalAssignments: legacySnapshot.operationalAssignments,
      changeRecords: [],
      savedAt: '2026-10-28T10:00:00.000Z',
    });
    const localRepo = new LocalTrackerRepository(legacySnapshot, memoryStorage);
    const loadedLocal = await localRepo.getSnapshot();
    expect(loadedLocal.history).toEqual([]);

    // 3. GitHubTrackerRepository with remote JSON lacking history
    const encoded = Buffer.from(JSON.stringify(legacySnapshot), 'utf-8').toString('base64');
    const ghRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'fake-token',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            type: 'file',
            sha: 'sha-legacy-1',
            content: encoded,
            encoding: 'base64',
          }),
          { status: 200 }
        ),
    });
    const loadedGh = await ghRepo.getSnapshot();
    expect(loadedGh.history).toEqual([]);
  });

  it('appends one history entry per changed entity on save with before -> after summary', async () => {
    const memoryStorage = new MemoryTrackerStorage();
    const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, memoryStorage);
    const baseline = await repo.getSnapshot();
    const draft: TrackerSnapshot = JSON.parse(JSON.stringify(baseline));

    // Edit two fields on MV-01-01 (one entity) and one field on DEST:MV-01-01 (second entity)
    const out01 = draft.outputs.find((o) => o.id === 'OUT:MV-01-01')!;
    out01.layoutName = '10 BOX';
    out01.assignmentName = 'SHOW ALPHA';

    const dest01 = draft.destinations.find((d) => d.id === 'DEST:MV-01-01')!;
    const sampleSource = draft.sources[0];
    dest01.assignedSourceId = sampleSource.id;

    const changeSet = createChangeSet(baseline, draft);
    const saved = await repo.saveSnapshot(draft, changeSet, {
      id: 'op_zach_z',
      displayName: 'Zach Z',
    });

    expect(saved.history).toBeDefined();
    // 2 entities modified -> 2 history entries
    expect(saved.history).toHaveLength(2);

    const outEntry = saved.history!.find((h) => h.entityId === 'MV-01-01')!;
    expect(outEntry).toBeDefined();
    expect(outEntry.operator).toBe('Zach Z');
    expect(outEntry.entityType).toBe('Output/MV');
    expect(outEntry.summary).toContain('→ 10 BOX');
    expect(outEntry.summary).toContain('→ SHOW ALPHA');

    const destEntry = saved.history!.find((h) => h.entityId === 'MV-01-01' && h !== outEntry);
    expect(destEntry).toBeDefined();
    expect(destEntry!.entityType).toBe('Source/Destination State');
    expect(destEntry!.summary).toContain(`→ ${sampleSource.name}`);
  });

  it('sorts history entries newest first', () => {
    const older: HistoryEntry = {
      id: 'hist_1',
      timestamp: '2026-10-27T12:00:00.000Z',
      operator: 'Alex S',
      entityType: 'Layout Assignment',
      entityId: 'MV-01-01',
      action: 'updated',
      summary: 'MV-01-01 Layout: 9 BOX → 10 BOX',
    };
    const newest: HistoryEntry = {
      id: 'hist_3',
      timestamp: '2026-10-28T15:30:00.000Z',
      operator: 'Zach Z',
      entityType: 'Output/MV',
      entityId: 'MV-01-02',
      action: 'updated',
      summary: 'MV-01-02 PIP-03: vIngest-11 → vPgm-04',
    };
    const middle: HistoryEntry = {
      id: 'hist_2',
      timestamp: '2026-10-28T09:15:00.000Z',
      operator: 'Zach Z',
      entityType: 'Production Assignment',
      entityId: 'MV-02-01',
      action: 'created',
      summary: 'MV-02-01 Production Assignment: AVAILABLE → COURT A',
    };

    const sorted = mergeHistoryEntries([older, middle], [newest]);
    expect(sorted.map((e) => e.id)).toEqual(['hist_3', 'hist_2', 'hist_1']);
  });

  it('caps history at 500 entries and trims the oldest entries on save', () => {
    const existing: HistoryEntry[] = [];
    const baseTime = Date.parse('2026-10-01T00:00:00.000Z');

    for (let i = 1; i <= 505; i++) {
      existing.push({
        id: `hist_seed_${i}`,
        timestamp: new Date(baseTime + i * 60000).toISOString(),
        operator: 'Zach Z',
        entityType: 'Output/MV',
        entityId: 'MV-01-01',
        action: 'updated',
        summary: `Edit #${i}`,
      });
    }

    const capped = appendHistoryEntries(
      existing,
      {
        id: 'cs_506',
        timestamp: new Date(baseTime + 506 * 60000).toISOString(),
        summary: '1 change',
        changes: [
          {
            entityType: 'output',
            entityId: 'OUT:MV-01-02',
            entityLabel: 'MV-01-02',
            field: 'layoutName',
            previousValue: '9 BOX',
            newValue: '16 BOX',
            description: 'Layout: 9 BOX → 16 BOX',
          },
        ],
      },
      { id: 'op_zach_z', displayName: 'Zach Z' }
    );

    expect(capped).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(capped[0].id).toBe('hist_cs_506_1');
    // Oldest 6 entries (hist_seed_1 through hist_seed_6) should be trimmed
    expect(capped.some((e) => e.id === 'hist_seed_1')).toBe(false);
    expect(capped.some((e) => e.id === 'hist_seed_6')).toBe(false);
    expect(capped[capped.length - 1].id).toBe('hist_seed_7');
  });

  it('merges entries from both sides without duplicates and preserves newest-first order', () => {
    const sharedEntry: HistoryEntry = {
      id: 'hist_shared',
      timestamp: '2026-10-28T10:00:00.000Z',
      operator: 'Zach Z',
      entityType: 'Output/MV',
      entityId: 'MV-01-01',
      action: 'updated',
      summary: 'Shared change',
    };
    const localOnly: HistoryEntry = {
      id: 'hist_local',
      timestamp: '2026-10-28T11:00:00.000Z',
      operator: 'Zach Z',
      entityType: 'Layout Assignment',
      entityId: 'MV-01-02',
      action: 'updated',
      summary: 'Local layout change',
    };
    const remoteOnly: HistoryEntry = {
      id: 'hist_remote',
      timestamp: '2026-10-28T10:30:00.000Z',
      operator: 'Alex S',
      entityType: 'Production Assignment',
      entityId: 'MV-02-01',
      action: 'created',
      summary: 'Remote production change',
    };

    const snapA: TrackerSnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      history: [localOnly, sharedEntry],
    };
    const snapB: TrackerSnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      history: [remoteOnly, sharedEntry],
    };

    const mergedSnap = mergeSnapshotHistory(snapA, snapB);
    expect(mergedSnap.history).toHaveLength(3);
    expect(mergedSnap.history!.map((e) => e.id)).toEqual([
      'hist_local',
      'hist_remote',
      'hist_shared',
    ]);
  });

  it('activates History in AppSidebar without V1.3 badge while keeping Export disabled with V1.4', () => {
    renderWithProviders(<AppSidebar isOpen={true} />, { route: '/history' });

    const historyLink = screen.getByRole('link', { name: /History/i });
    expect(historyLink).toBeInTheDocument();
    expect(historyLink).toHaveAttribute('href', '/history');
    expect(screen.queryByText('V1.3')).not.toBeInTheDocument();

    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('V1.4')).toBeInTheDocument();
  });

  it('renders HistoryPage empty state and filters entries by search and type', async () => {
    const emptySnapshot: TrackerSnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      history: [],
    };
    const emptyRepo = new LocalTrackerRepository(emptySnapshot, new MemoryTrackerStorage());
    const { unmount } = renderWithProviders(<HistoryPage />, {
      repository: emptyRepo,
      route: '/history',
    });

    expect(await screen.findByTestId('history-empty-state')).toHaveTextContent(
      'No changes recorded yet.'
    );
    unmount();

    const nowIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const olderIso = '2026-10-20T14:00:00.000Z';
    const populatedSnapshot: TrackerSnapshot = {
      ...JSON.parse(JSON.stringify(INITIAL_SNAPSHOT)),
      history: [
        {
          id: 'h_recent',
          timestamp: nowIso,
          operator: 'Zach Z',
          entityType: 'Output/MV',
          entityId: 'MV-01-02',
          action: 'updated',
          summary: 'MV-01-02 PIP-03: vIngest-11 → vPgm-04',
        },
        {
          id: 'h_older',
          timestamp: olderIso,
          operator: 'Alex S',
          entityType: 'Layout Assignment',
          entityId: 'MV-03-01',
          action: 'updated',
          summary: 'MV-03-01 Layout: 9 BOX → 16 BOX',
        },
      ],
    };

    const popRepo = new LocalTrackerRepository(populatedSnapshot, new MemoryTrackerStorage());
    renderWithProviders(<HistoryPage />, { repository: popRepo, route: '/history' });

    expect(await screen.findByTestId('history-row-h_recent')).toBeInTheDocument();
    expect(screen.getByTestId('history-row-h_older')).toBeInTheDocument();
    expect(screen.getByTestId('history-time-h_recent')).toHaveTextContent('5 min ago');

    // Type filter
    fireEvent.change(screen.getByTestId('history-type-filter'), {
      target: { value: 'Layout Assignment' },
    });
    expect(screen.queryByTestId('history-row-h_recent')).not.toBeInTheDocument();
    expect(screen.getByTestId('history-row-h_older')).toBeInTheDocument();

    // Reset type filter and filter by search
    fireEvent.change(screen.getByTestId('history-type-filter'), {
      target: { value: 'ALL' },
    });
    fireEvent.change(screen.getByTestId('history-search-input'), {
      target: { value: 'vPgm-04' },
    });
    expect(screen.getByTestId('history-row-h_recent')).toBeInTheDocument();
    expect(screen.queryByTestId('history-row-h_older')).not.toBeInTheDocument();
  });

  it('formats relative time within 24h and absolute time beyond 24h', () => {
    const now = new Date('2026-10-28T18:00:00.000Z');
    const fiveMinAgo = new Date('2026-10-28T17:55:00.000Z').toISOString();
    const twoDaysAgo = new Date('2026-10-26T14:00:00.000Z').toISOString();

    expect(formatHistoryTime(fiveMinAgo, now).display).toBe('5 min ago');
    expect(formatHistoryTime(twoDaysAgo, now).display).not.toContain('ago');
  });
});
