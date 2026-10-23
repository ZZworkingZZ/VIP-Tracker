import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { SourceId } from '../domain/identifiers';
import { TrackerSnapshot } from '../domain/models';

function renderApp(repo: LocalTrackerRepository, initialRoute: string = '/directory') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { path: 'sources', element: <DestinationSourcesPage /> },
          { path: 'directory', element: <SourceDirectoryPage /> },
        ],
      },
    ],
    { initialEntries: [initialRoute] }
  );

  return render(
    <TrackerRepositoryProvider repository={repo}>
      <RouterProvider router={router} />
    </TrackerRepositoryProvider>
  );
}

describe('Phase 4C: Source Signal-Flow Editor UI & Workflows', () => {
  let storage: MemoryTrackerStorage;
  let repo: LocalTrackerRepository;

  beforeEach(() => {
    storage = new MemoryTrackerStorage();
    repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
  });

  it('Requirement 1: Source Directory shows an unassigned upstream state initially', async () => {
    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Source Directory/i })).toBeInTheDocument();
    });

    // Check row for vCam-01
    const vCam1Row = screen.getByTestId('source-row-SRC:VCAM-01');
    expect(within(vCam1Row).getByText('vCam-01')).toBeInTheDocument();

    const upstreamCell = screen.getByTestId('upstream-cell-SRC:VCAM-01');
    expect(within(upstreamCell).getByText('Not assigned')).toBeInTheDocument();

    const signalFlowCell = screen.getByTestId('signal-flow-cell-SRC:VCAM-01');
    expect(within(signalFlowCell).getByText('Origin')).toBeInTheDocument();
  });

  it('Requirement 2: Operator can open the routing editor and view metadata, resolved flow, and validation state', async () => {
    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-row-SRC:VCAM-01')).toBeInTheDocument();
    });

    const editBtn = screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01');
    fireEvent.click(editBtn);

    const modal = await screen.findByTestId('source-signal-flow-modal');
    expect(modal).toBeInTheDocument();

    // Verify Read-Only metadata
    expect(within(modal).getAllByText('vCam-01').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getAllByText('Virtual Camera').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getByText('Virtual Source')).toBeInTheDocument();

    // Current upstream & validation state
    expect(within(modal).getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByTestId('modal-validation-state')).toHaveTextContent('Valid');

    // Current signal flow chain
    expect(screen.getByTestId('current-signal-flow-chain')).toHaveTextContent('vCam-01 (Origin)');
  });

  it('Requirement 3, 4, 5: Upstream Source selector receives full catalog, excludes current source, and filters by search', async () => {
    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    // Open modal in edit mode
    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Requirement 5: Current source (vCam-01) must NOT be present as an option
    expect(screen.queryByTestId('upstream-option-SRC:VCAM-01')).not.toBeInTheDocument();

    // Requirement 3: Total eligible sources is 231 - 1 = 230
    expect(screen.getByText(/230 of 230 eligible sources/i)).toBeInTheDocument();

    // Requirement 4: Search filters the selector by source name
    const searchInput = screen.getByTestId('upstream-source-search-input');
    fireEvent.change(searchInput, { target: { value: 'vTie-101' } });

    expect(screen.getByTestId('upstream-option-SRC:VTIE-101')).toBeInTheDocument();
    expect(screen.queryByTestId('upstream-option-SRC:VCAM-02')).not.toBeInTheDocument();
  });

  it('Requirement 6 & 10: Operator can assign an immediate upstream source; preview does not mutate repository state', async () => {
    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Search and select vTie-101
    const searchInput = screen.getByTestId('upstream-source-search-input');
    fireEvent.change(searchInput, { target: { value: 'vTie-101' } });
    fireEvent.click(screen.getByTestId('upstream-option-SRC:VTIE-101'));

    // Requirement 10: Preview updates inside modal WITHOUT mutating repository yet
    const previewChain = screen.getByTestId('preview-signal-flow-chain');
    expect(previewChain).toHaveTextContent('vTie-101 → vCam-01');

    // Raw repository remains null at this point
    const currentPersisted = await repo.getSnapshot();
    const persistedCam = currentPersisted.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    expect(persistedCam.upstreamSourceId).toBeNull();

    // Stage changes
    fireEvent.click(screen.getByTestId('save-signal-flow-btn'));

    // Modal closes and staged state reflects in directory table
    await waitFor(() => {
      expect(screen.queryByTestId('source-signal-flow-modal')).not.toBeInTheDocument();
    });

    const upstreamCell = screen.getByTestId('upstream-cell-SRC:VCAM-01');
    expect(within(upstreamCell).getByText('vTie-101')).toBeInTheDocument();

    const signalFlowCell = screen.getByTestId('signal-flow-cell-SRC:VCAM-01');
    expect(within(signalFlowCell).getByText('vTie-101 → vCam-01')).toBeInTheDocument();
  });

  it('Requirement 7: Operator can replace an upstream Source', async () => {
    // Start with vCam-01 having upstream vTie-101
    const snapshotWithUpstream: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const cam = snapshotWithUpstream.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    cam.upstreamSourceId = 'SRC:VTIE-101' as SourceId;
    await repo.saveSnapshot(snapshotWithUpstream, {
      id: 'cs1',
      timestamp: new Date().toISOString(),
      summary: 'seed upstream',
      changes: [],
    });

    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Replace with Swr-201
    const searchInput = screen.getByTestId('upstream-source-search-input');
    fireEvent.change(searchInput, { target: { value: 'Swr-201' } });
    fireEvent.click(screen.getByTestId('upstream-option-SRC:SWR-201'));

    expect(screen.getByTestId('preview-signal-flow-chain')).toHaveTextContent('Swr-201 → vCam-01');

    fireEvent.click(screen.getByTestId('save-signal-flow-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('source-signal-flow-modal')).not.toBeInTheDocument();
    });

    const upstreamCell = screen.getByTestId('upstream-cell-SRC:VCAM-01');
    expect(within(upstreamCell).getByText('Swr-201')).toBeInTheDocument();
  });

  it('Requirement 8: Operator can clear an upstream Source', async () => {
    const snapshotWithUpstream: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const cam = snapshotWithUpstream.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    cam.upstreamSourceId = 'SRC:VTIE-101' as SourceId;
    await repo.saveSnapshot(snapshotWithUpstream, {
      id: 'cs1',
      timestamp: new Date().toISOString(),
      summary: 'seed upstream',
      changes: [],
    });

    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Click Clear button
    fireEvent.click(screen.getByTestId('clear-upstream-source-btn'));

    expect(screen.getByTestId('preview-signal-flow-chain')).toHaveTextContent('vCam-01 (Origin)');

    fireEvent.click(screen.getByTestId('save-signal-flow-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('source-signal-flow-modal')).not.toBeInTheDocument();
    });

    const upstreamCell = screen.getByTestId('upstream-cell-SRC:VCAM-01');
    expect(within(upstreamCell).getByText('Not assigned')).toBeInTheDocument();
  });

  it('Requirement 9: Cancel leaves the Source unchanged', async () => {
    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Select vTie-101
    const searchInput = screen.getByTestId('upstream-source-search-input');
    fireEvent.change(searchInput, { target: { value: 'vTie-101' } });
    fireEvent.click(screen.getByTestId('upstream-option-SRC:VTIE-101'));

    // Cancel modal
    fireEvent.click(screen.getByTestId('cancel-signal-flow-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('source-signal-flow-modal')).not.toBeInTheDocument();
    });

    // Remained Not assigned
    const upstreamCell = screen.getByTestId('upstream-cell-SRC:VCAM-01');
    expect(within(upstreamCell).getByText('Not assigned')).toBeInTheDocument();
  });

  it('Requirement 11: Valid multi-hop signal flow displays in origin-to-immediate order', async () => {
    // Setup Swr-201 -> vTie-101 in storage
    const snapshot: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const tie = snapshot.sources.find((s) => s.id === 'SRC:VTIE-101')!;
    tie.upstreamSourceId = 'SRC:SWR-201' as SourceId;
    await repo.saveSnapshot(snapshot, {
      id: 'cs1',
      timestamp: new Date().toISOString(),
      summary: 'seed multi-hop',
      changes: [],
    });

    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Propose vTie-101 as upstream for vCam-01
    const searchInput = screen.getByTestId('upstream-source-search-input');
    fireEvent.change(searchInput, { target: { value: 'vTie-101' } });
    fireEvent.click(screen.getByTestId('upstream-option-SRC:VTIE-101'));

    // Must show origin-to-immediate order: Swr-201 -> vTie-101 -> vCam-01
    expect(screen.getByTestId('preview-signal-flow-chain')).toHaveTextContent(
      'Swr-201 → vTie-101 → vCam-01'
    );
  });

  it('Requirement 12 & 13: Direct self-routing and indirect circular routing are rejected with inline error', async () => {
    // Setup vTie-101 fed by vCam-01
    const snapshot: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const tie = snapshot.sources.find((s) => s.id === 'SRC:VTIE-101')!;
    tie.upstreamSourceId = 'SRC:VCAM-01' as SourceId;
    await repo.saveSnapshot(snapshot, {
      id: 'cs1',
      timestamp: new Date().toISOString(),
      summary: 'seed cycle test',
      changes: [],
    });

    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    // Requirement 13: Attempt to feed vCam-01 from vTie-101 (creates cycle vCam-01 -> vTie-101 -> vCam-01)
    const searchInput = screen.getByTestId('upstream-source-search-input');
    fireEvent.change(searchInput, { target: { value: 'vTie-101' } });
    fireEvent.click(screen.getByTestId('upstream-option-SRC:VTIE-101'));

    // Inline error banner must appear with exact cycle path
    const errorBanner = screen.getByTestId('signal-flow-error-banner');
    expect(errorBanner).toHaveTextContent(
      'Cannot save this relationship because it creates a circular signal flow: vCam-01 → vTie-101 → vCam-01.'
    );

    // Save button must be disabled
    const saveBtn = screen.getByTestId('save-signal-flow-btn');
    expect(saveBtn).toBeDisabled();
  });

  it('Requirement 14: Dangling upstream references display safely and can be corrected', async () => {
    // Construct snapshot with dangling upstream reference
    const snapshot: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const cam = snapshot.sources.find((s) => s.id === 'SRC:VCAM-01')!;
    cam.upstreamSourceId = 'SRC:NON_EXISTENT' as SourceId;
    await repo.saveSnapshot(snapshot, {
      id: 'cs1',
      timestamp: new Date().toISOString(),
      summary: 'seed dangling',
      changes: [],
    });

    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId('source-row-SRC:VCAM-01')).toBeInTheDocument();
    });

    // Directory table shows Missing Source badge without crashing
    const upstreamCell = screen.getByTestId('upstream-cell-SRC:VCAM-01');
    expect(within(upstreamCell).getByText('Missing Source')).toBeInTheDocument();

    // Open routing details
    fireEvent.click(screen.getByTestId('edit-signal-flow-btn-SRC:VCAM-01'));
    await screen.findByTestId('source-signal-flow-modal');

    expect(screen.getByTestId('persisted-dangling-alert')).toHaveTextContent(
      "Stored upstream source reference 'SRC:NON_EXISTENT' does not exist in the catalog."
    );

    // Operator can clear or replace the dangling relationship
    fireEvent.click(screen.getByTestId('clear-upstream-source-btn'));
    fireEvent.click(screen.getByTestId('save-signal-flow-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('source-signal-flow-modal')).not.toBeInTheDocument();
    });

    // Dangling issue resolved
    expect(
      within(screen.getByTestId('upstream-cell-SRC:VCAM-01')).getByText('Not assigned')
    ).toBeInTheDocument();
  });

  it('Requirement 15: Maximum-depth state displays safely', async () => {
    // Construct chain of 12 sources in snapshot
    const snapshot: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    const chainIds: SourceId[] = [];
    for (let i = 1; i <= 12; i++) {
      const src = snapshot.sources[i];
      chainIds.push(src.id);
    }
    for (let i = 0; i < chainIds.length - 1; i++) {
      const s = snapshot.sources.find((src) => src.id === chainIds[i])!;
      s.upstreamSourceId = chainIds[i + 1];
    }
    await repo.saveSnapshot(snapshot, {
      id: 'cs1',
      timestamp: new Date().toISOString(),
      summary: 'seed max depth',
      changes: [],
    });

    renderApp(repo, '/directory');

    await waitFor(() => {
      expect(screen.getByTestId(`edit-signal-flow-btn-${chainIds[0]}`)).toBeInTheDocument();
    });

    // Open first node
    fireEvent.click(screen.getByTestId(`edit-signal-flow-btn-${chainIds[0]}`));
    await screen.findByTestId('source-signal-flow-modal');

    // Should display warning without hanging or crashing
    expect(screen.getByTestId('signal-flow-warning-banner')).toHaveTextContent(
      'Proposed signal flow reaches the maximum tracked depth of 10 hops.'
    );
  });
});
