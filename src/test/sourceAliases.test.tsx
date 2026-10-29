import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { GitHubTrackerRepository } from '../services/GitHubTrackerRepository';
import { MemoryTrackerStorage, isValidPersistedTrackerData } from '../services/storage';
import { MemoryOperatorStorage } from '../services/operatorStorage';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { TrackerSnapshot, formatSourceCompact, getSourceAlias } from '../domain/models';
import { TrackerRepository } from '../services/TrackerRepository';

function renderTrackerApp(
  repo: TrackerRepository,
  initialRoute: string = '/directory',
  operatorStorage?: MemoryOperatorStorage
) {
  const opStorage = operatorStorage ?? new MemoryOperatorStorage();
  if (!opStorage.loadOperator()) {
    opStorage.saveOperator({ id: 'op_zach_z', displayName: 'Zach Z' });
  }

  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'sources', element: <DestinationSourcesPage /> },
          { path: 'directory', element: <SourceDirectoryPage /> },
        ],
      },
    ],
    { initialEntries: [initialRoute] }
  );

  return render(
    <TrackerRepositoryProvider repository={repo} operatorStorage={opStorage}>
      <RouterProvider router={router} />
    </TrackerRepositoryProvider>
  );
}

describe('Source Aliases Feature', () => {
  let storage: MemoryTrackerStorage;
  let repo: LocalTrackerRepository;

  beforeEach(() => {
    storage = new MemoryTrackerStorage();
    repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
  });

  it('TEST 1 & TEST 9: Existing source with no Alias loads and displays cleanly without placeholders or empty parentheses', async () => {
    renderTrackerApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-row-SRC:VCAM-01')).toBeInTheDocument();
    });

    const row = screen.getByTestId('source-row-SRC:VCAM-01');
    expect(within(row).getByText('vCam-01')).toBeInTheDocument();

    // No secondary alias label rendered when no alias exists
    expect(screen.queryByTestId('source-alias-label-SRC:VCAM-01')).not.toBeInTheDocument();

    // Input value is empty string, no "N/A", "No Alias", or "()"
    const aliasInput = screen.getByTestId('source-alias-input-SRC:VCAM-01') as HTMLInputElement;
    expect(aliasInput.value).toBe('');
    expect(within(row).queryByText(/N\/A/i)).not.toBeInTheDocument();
    expect(within(row).queryByText(/No Alias/i)).not.toBeInTheDocument();
    expect(within(row).queryByText(/\(\)/)).not.toBeInTheDocument();

    // Domain formatting helpers return clean source name with no parentheses
    const snapshot = await repo.getSnapshot();
    const vcam1 = snapshot.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    expect(getSourceAlias(vcam1)).toBeNull();
    expect(formatSourceCompact(vcam1)).toBe('vCam-01');
    expect(formatSourceCompact(vcam1)).not.toContain('()');
  });

  it('TEST 2 & TEST 3: Create Alias via check mark performs shared save, preserves source record, and persists across reload', async () => {
    const saveSpy = vi.spyOn(repo, 'saveSnapshot');
    const { unmount } = renderTrackerApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-input-SRC:VCAM-01')).toBeInTheDocument();
    });

    const aliasInput = screen.getByTestId('source-alias-input-SRC:VCAM-01');
    const saveBtn = screen.getByTestId('save-source-alias-btn-SRC:VCAM-01');

    // Typing does NOT immediately trigger a shared save
    fireEvent.change(aliasInput, { target: { value: 'Haivision 1' } });
    expect(saveSpy).not.toHaveBeenCalled();

    // Clicking the check mark performs the shared save
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    // Verify persisted source record in repository and storage
    const savedSnapshot = await repo.getSnapshot();
    const updatedSource = savedSnapshot.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    expect(updatedSource.name).toBe('vCam-01');
    expect(updatedSource.alias).toBe('Haivision 1');
    expect(updatedSource.category).toBe('Virtual Camera');
    expect(updatedSource.sourceType).toBe('virtual');

    // TEST 3: Reload from storage in a new repository instance
    unmount();
    const reloadedRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
    renderTrackerApp(reloadedRepo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-label-SRC:VCAM-01')).toHaveTextContent('Haivision 1');
    });
    expect((screen.getByTestId('source-alias-input-SRC:VCAM-01') as HTMLInputElement).value).toBe(
      'Haivision 1'
    );
  });

  it('TEST 4: Cross-browser shared-state behavior via GitHubTrackerRepository', async () => {
    let remoteFileContent = JSON.stringify(INITIAL_SNAPSHOT, null, 2);
    let currentRemoteSha = 'sha_initial_100';

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const url = String(input);

      if (url.includes('/contents/') && method === 'GET') {
        const base64 = btoa(unescape(encodeURIComponent(remoteFileContent)));
        return new Response(
          JSON.stringify({
            type: 'file',
            name: 'tracker.json',
            path: 'data/tracker.json',
            sha: currentRemoteSha,
            content: base64,
            encoding: 'base64',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/contents/') && method === 'PUT') {
        const body = JSON.parse(String(init?.body));
        expect(body.sha).toBe(currentRemoteSha);
        remoteFileContent = decodeURIComponent(escape(atob(body.content)));
        currentRemoteSha = 'sha_updated_200';
        return new Response(
          JSON.stringify({
            content: { sha: currentRemoteSha },
            commit: { sha: 'commit_200' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;

    // Browser A saves an Alias using the check mark
    const browserARepo = new GitHubTrackerRepository({
      tokenProvider: () => 'test-token',
      fetchFn: mockFetch,
    });

    const { unmount } = renderTrackerApp(browserARepo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-input-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('source-alias-input-SRC:VCAM-01'), {
      target: { value: 'Haivision 1' },
    });
    fireEvent.click(screen.getByTestId('save-source-alias-btn-SRC:VCAM-01'));

    await waitFor(() => {
      expect(currentRemoteSha).toBe('sha_updated_200');
    });
    unmount();

    // Browser B loads the shared state from GitHub and receives the updated Alias
    const browserBRepo = new GitHubTrackerRepository({
      tokenProvider: () => 'test-token',
      fetchFn: mockFetch,
    });

    const browserBSnapshot = await browserBRepo.getSnapshot();
    const sharedSource = browserBSnapshot.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    expect(sharedSource.alias).toBe('Haivision 1');
  });

  it('TEST 5 & TEST 6: Search by Alias and search by actual source name both find the source', async () => {
    renderTrackerApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-input-SRC:VCAM-01')).toBeInTheDocument();
    });

    // Assign alias "Haivision 1" to vCam-01
    fireEvent.change(screen.getByTestId('source-alias-input-SRC:VCAM-01'), {
      target: { value: 'Haivision 1' },
    });
    fireEvent.click(screen.getByTestId('save-source-alias-btn-SRC:VCAM-01'));

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-label-SRC:VCAM-01')).toHaveTextContent('Haivision 1');
    });

    const searchInput = screen.getByLabelText(/Search Source/i);

    // TEST 5: Search by Alias
    fireEvent.change(searchInput, { target: { value: 'Haivision 1' } });
    expect(screen.getByTestId('source-row-SRC:VCAM-01')).toBeInTheDocument();
    expect(screen.queryByTestId('source-row-SRC:VCAM-02')).not.toBeInTheDocument();

    // TEST 6: Search by actual technical source name
    fireEvent.change(searchInput, { target: { value: 'vCam-01' } });
    expect(screen.getByTestId('source-row-SRC:VCAM-01')).toBeInTheDocument();

    // Sources without an Alias continue to work normally in search
    fireEvent.change(searchInput, { target: { value: 'vCam-02' } });
    expect(screen.getByTestId('source-row-SRC:VCAM-02')).toBeInTheDocument();
    expect(screen.queryByTestId('source-row-SRC:VCAM-01')).not.toBeInTheDocument();
  });

  it('TEST 7: Duplicate Aliases are allowed across multiple different sources without uniqueness errors', async () => {
    renderTrackerApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-input-SRC:VCAM-01')).toBeInTheDocument();
    });

    // Assign "Haivision 1" to vCam-01
    fireEvent.change(screen.getByTestId('source-alias-input-SRC:VCAM-01'), {
      target: { value: 'Haivision 1' },
    });
    fireEvent.click(screen.getByTestId('save-source-alias-btn-SRC:VCAM-01'));

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-label-SRC:VCAM-01')).toHaveTextContent('Haivision 1');
    });

    // Assign the exact same alias "Haivision 1" to vCam-02
    fireEvent.change(screen.getByTestId('source-alias-input-SRC:VCAM-02'), {
      target: { value: 'Haivision 1' },
    });
    fireEvent.click(screen.getByTestId('save-source-alias-btn-SRC:VCAM-02'));

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-label-SRC:VCAM-02')).toHaveTextContent('Haivision 1');
    });

    expect(screen.queryByTestId('directory-save-error-banner')).not.toBeInTheDocument();

    const snapshot = await repo.getSnapshot();
    expect(snapshot.sources.find((s) => s.id === 'SRC:VCAM-01')?.alias).toBe('Haivision 1');
    expect(snapshot.sources.find((s) => s.id === 'SRC:VCAM-02')?.alias).toBe('Haivision 1');
  });

  it('TEST 8: Alias displays alongside actual source name across Multiview cards, detail modal, destination matrix, and compact selectors', async () => {
    // Route vCam-01 (with alias "Haivision 1") to DEST:MV-01-01 (which is covered by OUT:MV-01-01)
    const seeded: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const vcam1 = seeded.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    vcam1.alias = 'Haivision 1';
    const dest1 = seeded.destinations.find((d) => d.id === 'DEST:MV-01-01')!;
    dest1.assignedSourceId = 'SRC:VCAM-01';
    const out1 = seeded.outputs.find((o) => o.id === 'OUT:MV-01-01')!;
    out1.layoutName = '4 BOX';
    out1.status = 'Assigned';
    out1.destinationStart = 1;
    out1.destinationEnd = 4;
    out1.pipAssignments = {
      'PIP-01': 'DEST:MV-01-01',
      'PIP-02': 'DEST:MV-01-02',
      'PIP-03': 'DEST:MV-01-03',
      'PIP-04': 'DEST:MV-01-04',
    };

    const customRepo = new LocalTrackerRepository(seeded, storage);
    renderTrackerApp(customRepo, '/sources');

    // 1. Multiview Card PIP window (spacious 2-line display: technical name + alias)
    await waitFor(() => {
      expect(screen.getByTestId('output-card-OUT:MV-01-01')).toBeInTheDocument();
    });
    const outputCard = screen.getByTestId('output-card-OUT:MV-01-01');
    expect(within(outputCard).getByText('vCam-01')).toBeInTheDocument();
    expect(within(outputCard).getByTestId('pip-source-alias-PIP-01')).toHaveTextContent(
      'Haivision 1'
    );

    // 2. Destination Matrix Tile (spacious 2-line display)
    const destTile = screen.getByTestId('dest-card-DEST:MV-01-01');
    expect(within(destTile).getByText('vCam-01')).toBeInTheDocument();
    expect(within(destTile).getByText('Haivision 1')).toBeInTheDocument();

    // 3. Output Detail Modal (spacious PIP detail + Covered Destinations table + compact MV Inputs palette)
    fireEvent.click(outputCard);
    const detailModal = await screen.findByTestId('output-detail-modal');
    expect(within(detailModal).getByTestId('detail-pip-source-alias-PIP-01')).toHaveTextContent(
      'Haivision 1'
    );

    // Compact MV Inputs palette item: "Source: vCam-01 (Haivision 1)"
    const paletteItem = within(detailModal).getByTestId('palette-input-DEST:MV-01-01');
    expect(paletteItem).toHaveTextContent('Source: vCam-01 (Haivision 1)');

    // Covered Destinations table row shows both vCam-01 and Haivision 1
    const breakdownRow = within(detailModal).getByTestId('window-row-0');
    expect(within(breakdownRow).getByText('vCam-01')).toBeInTheDocument();
    expect(within(breakdownRow).getByText('Haivision 1')).toBeInTheDocument();

    // 4. Compact Source Routing Selector Modal displays "vCam-01 (Haivision 1)"
    fireEvent.click(within(detailModal).getByTestId('enter-edit-mode-btn'));
    fireEvent.click(within(detailModal).getByTestId('route-btn-0'));
    const routingModal = await screen.findByTestId('source-routing-modal');
    const sourceOption = within(routingModal).getByTestId('source-option-SRC:VCAM-01');
    expect(sourceOption).toHaveTextContent('vCam-01 (Haivision 1)');
  });

  it('TEST 10: Clearing an existing Alias and clicking check mark saves and removes Alias everywhere', async () => {
    const seeded: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const vcam1 = seeded.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    vcam1.alias = 'Haivision 1';

    const customRepo = new LocalTrackerRepository(seeded, storage);
    renderTrackerApp(customRepo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-label-SRC:VCAM-01')).toHaveTextContent('Haivision 1');
    });

    const aliasInput = screen.getByTestId('source-alias-input-SRC:VCAM-01') as HTMLInputElement;
    expect(aliasInput.value).toBe('Haivision 1');

    // Clear the Alias input and click check mark
    fireEvent.change(aliasInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('save-source-alias-btn-SRC:VCAM-01'));

    await waitFor(() => {
      expect(screen.queryByTestId('source-alias-label-SRC:VCAM-01')).not.toBeInTheDocument();
    });

    expect(aliasInput.value).toBe('');
    const row = screen.getByTestId('source-row-SRC:VCAM-01');
    expect(within(row).getByText('vCam-01')).toBeInTheDocument();
    expect(within(row).queryByText('Haivision 1')).not.toBeInTheDocument();
    expect(within(row).queryByText(/\(\)/)).not.toBeInTheDocument();

    const updatedSnapshot = await customRepo.getSnapshot();
    const clearedSource = updatedSnapshot.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    expect(getSourceAlias(clearedSource)).toBeNull();
    expect(formatSourceCompact(clearedSource)).toBe('vCam-01');
  });

  it('TEST 11: Free-form typing with spaces works normally without premature commit or lost state', async () => {
    const saveSpy = vi.spyOn(repo, 'saveSnapshot');
    renderTrackerApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-alias-input-SRC:VCAM-01')).toBeInTheDocument();
    });

    const aliasInput = screen.getByTestId('source-alias-input-SRC:VCAM-01') as HTMLInputElement;

    // Simulate progressive typing with spaces
    fireEvent.change(aliasInput, { target: { value: 'Studio ' } });
    expect(aliasInput.value).toBe('Studio ');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('source-alias-label-SRC:VCAM-01')).not.toBeInTheDocument();

    fireEvent.change(aliasInput, { target: { value: 'Studio X ' } });
    expect(aliasInput.value).toBe('Studio X ');
    expect(saveSpy).not.toHaveBeenCalled();

    fireEvent.change(aliasInput, { target: { value: 'Studio X Camera 1' } });
    expect(aliasInput.value).toBe('Studio X Camera 1');
    expect(saveSpy).not.toHaveBeenCalled();

    // Commit by clicking check mark
    fireEvent.click(screen.getByTestId('save-source-alias-btn-SRC:VCAM-01'));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('source-alias-label-SRC:VCAM-01')).toHaveTextContent(
        'Studio X Camera 1'
      );
    });

    const savedSnapshot = await repo.getSnapshot();
    expect(savedSnapshot.sources.find((s) => s.id === 'SRC:VCAM-01')?.alias).toBe(
      'Studio X Camera 1'
    );
  });

  it('Backward compatibility: storage validation accepts missing, null, empty, or populated alias fields', () => {
    const baseData = {
      schemaVersion: 2,
      sourceSeedVersion: 1,
      outputs: INITIAL_SNAPSHOT.outputs,
      destinations: INITIAL_SNAPSHOT.destinations,
      sources: [
        { ...INITIAL_SNAPSHOT.sources[0] }, // alias missing
        { ...INITIAL_SNAPSHOT.sources[1], alias: null }, // alias null
        { ...INITIAL_SNAPSHOT.sources[2], alias: '' }, // alias empty string
        { ...INITIAL_SNAPSHOT.sources[3], alias: 'Haivision 1' }, // alias populated
      ],
      operationalAssignments: INITIAL_SNAPSHOT.operationalAssignments,
      changeRecords: [],
      savedAt: new Date().toISOString(),
    };

    expect(isValidPersistedTrackerData(baseData)).toBe(true);
  });
});
