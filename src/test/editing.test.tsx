import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { LayoutAssignmentsPage } from '../pages/LayoutAssignmentsPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { ProductionsPage } from '../pages/ProductionsPage';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { SourceId } from '../domain/identifiers';
import { TrackerSnapshot } from '../domain/models';

const SNAPSHOT_WITH_SOURCES: TrackerSnapshot = {
  ...INITIAL_SNAPSHOT,
  sources: [
    {
      id: 'SRC:CAM_1' as SourceId,
      name: 'CAM 1',
      normalizedName: 'CAM 1',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: null,
      sourceType: 'virtual',
    },
    {
      id: 'SRC:CAM_2' as SourceId,
      name: 'CAM 2',
      normalizedName: 'CAM 2',
      category: 'Virtual Camera',
      active: true,
      upstreamSourceId: null,
      sourceType: 'virtual',
    },
    {
      id: 'SRC:FS_01' as SourceId,
      name: 'FS 01',
      normalizedName: 'FS 01',
      category: 'Switcher',
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
    },
  ],
};

function renderApp(repo: LocalTrackerRepository, initialRoute: string = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'layouts', element: <LayoutAssignmentsPage /> },
          { path: 'sources', element: <DestinationSourcesPage /> },
          { path: 'productions', element: <ProductionsPage /> },
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

describe('Active Edit Mode & Interactive Staging Workflows', () => {
  let storage: MemoryTrackerStorage;
  let repo: LocalTrackerRepository;

  beforeEach(() => {
    storage = new MemoryTrackerStorage();
    repo = new LocalTrackerRepository(INITIAL_SNAPSHOT, storage);
  });

  it('displays ACTIVE status pill normally, and transitions to EDIT MODE and EDIT MODE • UNSAVED during editing', async () => {
    renderApp(repo);

    // Wait for baseline to finish loading
    expect(await screen.findByTestId('output-card-OUT:MV-02-01')).toBeInTheDocument();

    // Baseline mode is ACTIVE
    const modePill = screen.getByTestId('app-mode-pill');
    expect(modePill).toHaveTextContent('ACTIVE');

    // Click "Edit Displays" button to enter Edit Mode
    const editToggle = screen.getByTestId('toggle-edit-mode-btn');
    fireEvent.click(editToggle);

    // Banner and mode pill update
    expect(await screen.findByTestId('edit-mode-banner')).toBeInTheDocument();
    expect(modePill).toHaveTextContent('EDIT MODE');

    // Open an output card (OUT:MV-02-01)
    const card = screen.getByTestId('output-card-OUT:MV-02-01');
    fireEvent.click(card);

    expect(await screen.findByTestId('output-detail-modal')).toBeInTheDocument();

    // Modify production assignment
    const prodInput = screen.getByTestId('production-assignment-input');
    fireEvent.change(prodInput, { target: { value: 'RANKINGS' } });

    // Mode pill should now reflect unsaved changes
    expect(modePill).toHaveTextContent('EDIT MODE • UNSAVED');
  });

  it('allows editing an existing output, routing sources, and generating accurate review diffs', async () => {
    renderApp(repo);

    expect(await screen.findByTestId('output-card-OUT:MV-02-01')).toBeInTheDocument();

    // Open OUT:MV-02-01
    const card = screen.getByTestId('output-card-OUT:MV-02-01');
    fireEvent.click(card);

    // Click "Edit Output" in modal
    const editBtn = await screen.findByTestId('enter-edit-mode-btn');
    fireEvent.click(editBtn);

    // Change Production Assignment to RANKINGS
    const prodInput = screen.getByTestId('production-assignment-input');
    fireEvent.change(prodInput, { target: { value: 'RANKINGS' } });

    // Click Route button on Window 1
    const routeBtn0 = screen.getByTestId('route-btn-0');
    fireEvent.click(routeBtn0);

    // Source routing modal opens
    expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();

    // Catalog and apply a new source: CNN-NYP-Feed-1
    const showAddFormBtn = screen.getByTestId('show-add-source-form-btn');
    fireEvent.click(showAddFormBtn);

    const newSourceInput = screen.getByTestId('new-source-name-input');
    fireEvent.change(newSourceInput, { target: { value: 'CNN-NYP-Feed-1' } });

    const saveSourceBtn = screen.getByTestId('save-new-source-btn');
    fireEvent.click(saveSourceBtn);

    // Close detail modal
    const closeDetail = screen.getByLabelText('Close detail modal');
    fireEvent.click(closeDetail);

    // Click "Review & Save Changes" on sticky edit banner
    const reviewBtn = screen.getByTestId('review-save-btn');
    fireEvent.click(reviewBtn);

    // Review modal should be open and display actual generated differences
    const reviewModal = await screen.findByTestId('review-changes-modal');
    expect(within(reviewModal).getByText('Production Assignment')).toBeInTheDocument();
    expect(within(reviewModal).getByText('RANKINGS')).toBeInTheDocument();
    expect(within(reviewModal).getAllByText('CNN-NYP-Feed-1').length).toBeGreaterThan(0);

    // Confirm save
    const confirmSaveBtn = screen.getByTestId('confirm-save-btn');
    fireEvent.click(confirmSaveBtn);

    // Mode pill returns to ACTIVE
    await waitFor(() => {
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
    });

    // Output card now immediately renders RANKINGS
    const updatedCard = screen.getByTestId('output-card-OUT:MV-02-01');
    expect(within(updatedCard).getByText('RANKINGS')).toBeInTheDocument();
  });

  it('allows assigning an AVAILABLE output with a layout and windows', async () => {
    renderApp(repo);

    // MV-01-01 is AVAILABLE in seed
    const availCard = await screen.findByTestId('output-card-OUT:MV-01-01');
    expect(availCard).toHaveTextContent('AVAILABLE');
    fireEvent.click(availCard);

    // Open detail modal and click "+ Assign Layout & Windows"
    const assignBtn = await screen.findByTestId('assign-layout-placeholder-btn');
    fireEvent.click(assignBtn);

    // Layout selector modal appears
    expect(await screen.findByTestId('layout-selector-modal')).toBeInTheDocument();

    // Pick "4 BOX"
    const fourBoxOption = screen.getByTestId('layout-option-4 BOX');
    fireEvent.click(fourBoxOption);

    // Production assignment is set
    const prodInput = screen.getByTestId('production-assignment-input');
    fireEvent.change(prodInput, { target: { value: 'RANKINGS' } });

    // Close detail modal
    const closeBtn = screen.getByLabelText('Close detail modal');
    fireEvent.click(closeBtn);

    // Save changes
    const reviewBtn = screen.getByTestId('review-save-btn');
    fireEvent.click(reviewBtn);

    const saveBtn = screen.getByTestId('confirm-save-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
    });

    // OUT:MV-01-01 is now assigned with 4 BOX and RANKINGS
    const updatedCard = screen.getByTestId('output-card-OUT:MV-01-01');
    expect(updatedCard).toHaveTextContent('4 BOX');
    expect(updatedCard).toHaveTextContent('RANKINGS');
  });

  it('warns user before destructive layout reductions truncate populated sources', async () => {
    renderApp(repo);

    // Open OUT:MV-02-01 (6 BOX, destinations 1-3)
    const card = await screen.findByTestId('output-card-OUT:MV-02-01');
    fireEvent.click(card);

    const editBtn = await screen.findByTestId('enter-edit-mode-btn');
    fireEvent.click(editBtn);

    // Route a source to window 3 (Destination #3)
    const routeBtn2 = screen.getByTestId('route-btn-2');
    fireEvent.click(routeBtn2);

    const showAddFormBtn = screen.getByTestId('show-add-source-form-btn');
    fireEvent.click(showAddFormBtn);

    fireEvent.change(screen.getByTestId('new-source-name-input'), {
      target: { value: 'TEST-SOURCE-3' },
    });
    fireEvent.click(screen.getByTestId('save-new-source-btn'));

    // Now try to reduce layout to "1 BOX"
    const changeLayoutBtn = screen.getByTestId('change-layout-btn');
    fireEvent.click(changeLayoutBtn);

    const oneBox = screen.getByTestId('layout-option-1 BOX');
    fireEvent.click(oneBox);

    // Reduction warning must appear
    const warning = await screen.findByTestId('layout-reduction-warning');
    expect(within(warning).getByText(/TEST-SOURCE-3/i)).toBeInTheDocument();

    // Confirm reduction
    const confirmReductBtn = screen.getByTestId('confirm-reduction-btn');
    fireEvent.click(confirmReductBtn);

    expect(screen.queryByTestId('layout-reduction-warning')).not.toBeInTheDocument();
  });

  it('allows discarding changes without mutating baseline state', async () => {
    renderApp(repo);

    expect(await screen.findByTestId('output-card-OUT:MV-02-01')).toBeInTheDocument();

    // Enter edit mode
    fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

    // Modify an output
    fireEvent.click(screen.getByTestId('output-card-OUT:MV-02-01'));
    fireEvent.change(screen.getByTestId('production-assignment-input'), {
      target: { value: 'RANKINGS' },
    });
    fireEvent.click(screen.getByLabelText('Close detail modal'));

    // Verify unsaved pill
    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');

    // Mock confirm to accept discard
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const discardBtn = screen.getByTestId('discard-changes-btn');
    fireEvent.click(discardBtn);

    // Mode returns to ACTIVE
    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
    expect(screen.getByTestId('output-card-OUT:MV-02-01')).not.toHaveTextContent('RANKINGS');

    confirmSpy.mockRestore();
  });

  it('resets local data back to repository baseline via Settings modal', async () => {
    renderApp(repo);

    // Open settings from sidebar
    const settingsBtn = await screen.findByTestId('sidebar-settings-btn');
    fireEvent.click(settingsBtn);

    // Settings modal appears
    expect(await screen.findByTestId('settings-modal')).toBeInTheDocument();
    expect(screen.getByText(/Reset Local Configuration to Baseline/i)).toBeInTheDocument();

    // Click Reset Local Data
    const resetBtn = screen.getByTestId('reset-local-data-btn');
    fireEvent.click(resetBtn);

    // Confirmation box appears
    expect(screen.getByTestId('reset-confirm-box')).toBeInTheDocument();

    // Confirm reset
    const confirmResetBtn = screen.getByTestId('confirm-reset-btn');
    fireEvent.click(confirmResetBtn);

    // Success message displayed
    expect(await screen.findByTestId('reset-success-message')).toBeInTheDocument();
  });

  it('protects against accidental discard when toggling edit mode on Dashboard', async () => {
    renderApp(repo);

    expect(await screen.findByTestId('output-card-OUT:MV-02-01')).toBeInTheDocument();

    const editToggle = screen.getByTestId('toggle-edit-mode-btn');

    // 1. Entering and exiting edit mode with NO staged changes requires no confirmation
    fireEvent.click(editToggle);
    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE');

    const confirmSpy = vi.spyOn(window, 'confirm');
    fireEvent.click(editToggle);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');

    // 2. Enter edit mode and make a change
    fireEvent.click(editToggle);
    fireEvent.click(screen.getByTestId('output-card-OUT:MV-02-01'));
    fireEvent.change(screen.getByTestId('production-assignment-input'), {
      target: { value: 'RANKINGS' },
    });
    fireEvent.click(screen.getByLabelText('Close detail modal'));

    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');

    // 3. User cancels the discard prompt -> change remains preserved
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(editToggle);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Discard all staged changes'));
    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');
    expect(screen.getByTestId('output-card-OUT:MV-02-01')).toHaveTextContent('RANKINGS');

    // 4. User confirms discard -> changes are discarded
    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(editToggle);

    expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
    expect(screen.getByTestId('output-card-OUT:MV-02-01')).not.toHaveTextContent('RANKINGS');

    confirmSpy.mockRestore();
  });

  it('confirms Destination Range is completely removed from the UI and detail modal renders cleanly', async () => {
    renderApp(repo);

    // MV-02 has 36 inputs capacity
    const card = await screen.findByTestId('output-card-OUT:MV-02-01');
    fireEvent.click(card);

    const editBtn = await screen.findByTestId('enter-edit-mode-btn');
    fireEvent.click(editBtn);

    // Verify Destination Range does not exist in the modal or on the page
    const modal = screen.getByTestId('output-detail-modal');
    expect(within(modal).queryByText(/Destination Range/i)).not.toBeInTheDocument();
    expect(within(modal).queryByText(/Input Range/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Destination Range/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Input Range/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('dest-start-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-range-display')).not.toBeInTheDocument();

    // Verify active editing fields exist and render cleanly
    expect(within(modal).getByText('Output Identity (Hardware)')).toBeInTheDocument();
    expect(within(modal).getByText('Layout Assignment')).toBeInTheDocument();
    expect(within(modal).getByText('Production Assignment')).toBeInTheDocument();
  });

  it('informs user and preserves destination routes when releasing an output unless explicitly cleared', async () => {
    renderApp(repo);

    // Open OUT:MV-02-01, enter edit mode, and route a source to Window 1
    const card = await screen.findByTestId('output-card-OUT:MV-02-01');
    fireEvent.click(card);

    const editBtn = await screen.findByTestId('enter-edit-mode-btn');
    fireEvent.click(editBtn);

    // Route a source to window 0
    fireEvent.click(screen.getByTestId('route-btn-0'));
    fireEvent.click(screen.getByTestId('show-add-source-form-btn'));
    fireEvent.change(screen.getByTestId('new-source-name-input'), {
      target: { value: 'PRESERVED-FEED-1' },
    });
    fireEvent.click(screen.getByTestId('save-new-source-btn'));

    // Verify source is routed in window 1
    expect(screen.getAllByText('PRESERVED-FEED-1').length).toBeGreaterThan(0);

    const confirmSpy = vi.spyOn(window, 'confirm');

    // Confirm release (prompt 1 = true), but decline clearing routes (prompt 2 = false)
    confirmSpy.mockImplementation((message?: string) => {
      if (message?.includes('Release output')) return true;
      if (message?.includes('clear (unroute)')) return false; // Preserve routes!
      return false;
    });

    const releaseBtn = screen.getByTestId('release-output-btn');
    fireEvent.click(releaseBtn);

    // Output is now AVAILABLE in modal
    const detailModal = screen.getByTestId('output-detail-modal');
    expect(within(detailModal).getByText('AVAILABLE')).toBeInTheDocument();
    expect(within(detailModal).getByTestId('assign-layout-placeholder-btn')).toBeInTheDocument();

    // Close detail modal
    fireEvent.click(screen.getByLabelText('Close detail modal'));

    // Open Review Changes modal to verify staged differences
    fireEvent.click(screen.getByTestId('review-save-btn'));
    const reviewModal = await screen.findByTestId('review-changes-modal');

    // Output layout was removed
    expect(within(reviewModal).getByText('Layout')).toBeInTheDocument();
    // Destination 1 was NOT unrouted (its source routing difference to PRESERVED-FEED-1 remains staged!)
    expect(within(reviewModal).getByText('Source Routing')).toBeInTheDocument();
    expect(within(reviewModal).getAllByText('PRESERVED-FEED-1').length).toBeGreaterThan(0);

    confirmSpy.mockRestore();
  });

  it('clears destination routes when operator explicitly chooses to clear them on output release', async () => {
    renderApp(repo);

    const card = await screen.findByTestId('output-card-OUT:MV-02-01');
    fireEvent.click(card);

    fireEvent.click(await screen.findByTestId('enter-edit-mode-btn'));

    // Route a source
    fireEvent.click(screen.getByTestId('route-btn-0'));
    fireEvent.click(screen.getByTestId('show-add-source-form-btn'));
    fireEvent.change(screen.getByTestId('new-source-name-input'), {
      target: { value: 'CLEARED-FEED-1' },
    });
    fireEvent.click(screen.getByTestId('save-new-source-btn'));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true); // Confirm both release and clear!

    const releaseBtn = screen.getByTestId('release-output-btn');
    fireEvent.click(releaseBtn);

    const detailModal = screen.getByTestId('output-detail-modal');
    expect(within(detailModal).getByText('AVAILABLE')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close detail modal'));

    // Open Review Changes modal to verify staged differences
    fireEvent.click(screen.getByTestId('review-save-btn'));
    const reviewModal = await screen.findByTestId('review-changes-modal');

    // Output was released to Available
    expect(within(reviewModal).getByText('Layout')).toBeInTheDocument();
    // Destination 1 routes WERE cleared, so no Destination source routing difference exists
    expect(within(reviewModal).queryByText('Source Routing')).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  describe('Phase 3B — Direct Destination / Source Routing from Sources Page', () => {
    it('ensures destination routing controls are unavailable outside Edit Mode on Sources page', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');

      // Routing controls are not present
      expect(screen.queryByTestId('dest-route-btn-DEST:MV-01-01')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dest-clear-btn-DEST:MV-01-01')).not.toBeInTheDocument();

      // Clicking destination card in view mode does not open routing modal
      fireEvent.click(screen.getByTestId('dest-card-DEST:MV-01-01'));
      expect(screen.queryByTestId('source-routing-modal')).not.toBeInTheDocument();

      // Switch to Table View
      fireEvent.click(screen.getByRole('button', { name: 'Table View' }));
      expect(await screen.findByTestId('dest-table-row-DEST:MV-01-01')).toBeInTheDocument();

      // Routing column header and action buttons are not present
      expect(screen.queryByText('Routing')).not.toBeInTheDocument();
      expect(screen.queryByTestId('table-route-dest-DEST:MV-01-01')).not.toBeInTheDocument();
    });

    it('allows assigning an existing source to an unassigned destination in Edit Mode', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));
      expect(await screen.findByTestId('edit-mode-banner')).toBeInTheDocument();
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE');

      // Click Route on DEST:MV-01-01
      const routeBtn = screen.getByTestId('dest-route-btn-DEST:MV-01-01');
      fireEvent.click(routeBtn);

      expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();
      expect(screen.getByText(/Destination #1 \(DEST:MV-01-01\)/i)).toBeInTheDocument();

      // Pick CAM 1 and apply
      fireEvent.click(screen.getByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('source-routing-modal')).not.toBeInTheDocument();
      });

      const card = screen.getByTestId('dest-card-DEST:MV-01-01');
      expect(within(card).getByText('CAM 1')).toBeInTheDocument();
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');
    });

    it('allows changing an existing destination route in Edit Mode', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // First route to CAM 1
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();

      // Now change to FS 01
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('source-option-SRC:FS_01'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('source-routing-modal')).not.toBeInTheDocument();
      });

      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('FS 01')
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).queryByText('CAM 1')
      ).not.toBeInTheDocument();
    });

    it('allows clearing a destination route back to null via quick clear button and via selector modal', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // Route to CAM 1
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();

      // Clear via quick clear button
      const clearBtn = screen.getByTestId('dest-clear-btn-DEST:MV-01-01');
      fireEvent.click(clearBtn);

      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('Unassigned')
      ).toBeInTheDocument();

      // Route again to CAM 2
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_2'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 2')
      ).toBeInTheDocument();

      // Clear via modal: select "— Unrouted / Blank"
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('source-option-unrouted'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('source-routing-modal')).not.toBeInTheDocument();
      });
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('Unassigned')
      ).toBeInTheDocument();
    });

    it('does not modify draft state when cancelling the source selector modal', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE');

      // Open routing modal
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();

      // Select CAM 1 without applying
      fireEvent.click(screen.getByTestId('source-option-SRC:CAM_1'));

      // Click Cancel
      fireEvent.click(screen.getByTestId('cancel-source-routing-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('source-routing-modal')).not.toBeInTheDocument();
      });

      // Destination remains Unassigned and no unsaved changes exist
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('Unassigned')
      ).toBeInTheDocument();
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE');
    });

    it('ensures destination changes affect draftSnapshot rather than committed repository snapshot', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      // Repository committed snapshot is still unassigned
      const committedSnapshot = await testRepo.getSnapshot();
      const committedDest = committedSnapshot.destinations.find((d) => d.id === 'DEST:MV-01-01');
      expect(committedDest?.assignedSourceId).toBeNull();

      // Draft UI reflects change
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');
    });

    it('displays staged destination routing changes in the Review Changes modal', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      // Open review modal
      fireEvent.click(screen.getByTestId('review-save-btn'));
      const reviewModal = await screen.findByTestId('review-changes-modal');

      expect(within(reviewModal).getByText('MV-01-01')).toBeInTheDocument();
      expect(within(reviewModal).getByText('Source Routing')).toBeInTheDocument();
      expect(within(reviewModal).getByText(/Unrouted/i)).toBeInTheDocument();
      expect(within(reviewModal).getByText(/CAM 1/i)).toBeInTheDocument();
    });

    it('restores previous destination routing when discarding staged changes', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      fireEvent.click(screen.getByTestId('discard-changes-btn'));

      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('Unassigned')
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).queryByText('CAM 1')
      ).not.toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    it('persists destination routing to repository storage when saving staged changes', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      // Open review and save
      fireEvent.click(screen.getByTestId('review-save-btn'));
      fireEvent.click(await screen.findByTestId('confirm-save-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
      });

      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();

      // Check repository persistence
      const savedSnapshot = await testRepo.getSnapshot();
      const savedDest = savedSnapshot.destinations.find((d) => d.id === 'DEST:MV-01-01');
      expect(savedDest?.assignedSourceId).toBe('SRC:CAM_1');
    });

    it('persists staged destination routes across route navigation before saving or discarding', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // Stage route change on /sources
      fireEvent.click(screen.getByTestId('dest-route-btn-DEST:MV-01-01'));
      fireEvent.click(await screen.findByTestId('source-option-SRC:CAM_1'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();

      // Navigate to Layouts page
      fireEvent.click(screen.getByRole('link', { name: /Layouts/i }));
      expect(await screen.findByText('Multiview Layouts & Assignments')).toBeInTheDocument();

      // Staged state is preserved
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');
      expect(screen.getByTestId('edit-mode-banner')).toBeInTheDocument();

      // Navigate back to Signal Flows page
      fireEvent.click(screen.getByRole('link', { name: /Signal Flows/i }));
      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();

      // DEST:MV-01-01 still shows CAM 1
      expect(
        within(screen.getByTestId('dest-card-DEST:MV-01-01')).getByText('CAM 1')
      ).toBeInTheDocument();

      // Change is still in review modal
      fireEvent.click(screen.getByTestId('review-save-btn'));
      const reviewModal = await screen.findByTestId('review-changes-modal');
      expect(within(reviewModal).getByText('MV-01-01')).toBeInTheDocument();
      expect(within(reviewModal).getByText('Source Routing')).toBeInTheDocument();
    });

    it('supports direct destination routing and clearing from the Table View interface in Edit Mode', async () => {
      const testRepo = new LocalTrackerRepository(
        SNAPSHOT_WITH_SOURCES,
        new MemoryTrackerStorage()
      );
      renderApp(testRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // Switch to Table View
      fireEvent.click(screen.getByRole('button', { name: 'Table View' }));
      expect(await screen.findByTestId('dest-table-row-DEST:MV-01-01')).toBeInTheDocument();

      // Routing column header is present
      expect(screen.getByRole('columnheader', { name: 'Routing' })).toBeInTheDocument();

      // Click Route button in table row
      const tableRouteBtn = screen.getByTestId('table-route-dest-DEST:MV-01-01');
      fireEvent.click(tableRouteBtn);

      expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('source-option-SRC:FS_01'));
      fireEvent.click(screen.getByTestId('apply-source-route-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('source-routing-modal')).not.toBeInTheDocument();
      });

      const row = screen.getByTestId('dest-table-row-DEST:MV-01-01');
      expect(within(row).getByText('FS 01')).toBeInTheDocument();

      // Quick clear from table row
      const tableClearBtn = screen.getByTestId('table-clear-dest-DEST:MV-01-01');
      fireEvent.click(tableClearBtn);

      expect(within(row).getByText('Unassigned (Blank in CSV)')).toBeInTheDocument();
    });

    it('Source Routing Selector receives the populated seed source catalog in edit mode', async () => {
      // Clean fresh repository using default INITIAL_SNAPSHOT seed
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo, '/sources');

      expect(await screen.findByTestId('dest-card-DEST:MV-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // Click Route button on destination card
      const routeBtn = screen.getByTestId('dest-route-btn-DEST:MV-01-01');
      fireEvent.click(routeBtn);

      // Modal appears
      expect(await screen.findByTestId('source-routing-modal')).toBeInTheDocument();

      // Verify populated facility sources across categories are present in the selector
      expect(screen.getByTestId('source-option-SRC:VCAM-01')).toBeInTheDocument();
      expect(screen.getByTestId('source-option-SRC:BARS')).toBeInTheDocument();
      expect(screen.getByTestId('source-option-SRC:SWR-201')).toBeInTheDocument();
      expect(screen.getByTestId('source-option-SRC:J2K_CLIP-1A')).toBeInTheDocument();
      expect(screen.getByTestId('source-option-SRC:VTIE-101')).toBeInTheDocument();
    });
  });

  describe('Production Assignment Input Natural Space Typing UX', () => {
    it('allows typing "BR BIG BOARD" character-by-character preserving spaces on the Assignments page and selecting it in OutputDetailModal', async () => {
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo, '/productions');

      const newAssignInput = (await screen.findByTestId(
        'new-assignment-input'
      )) as HTMLInputElement;

      const keystrokes = [
        'B',
        'BR',
        'BR ',
        'BR B',
        'BR BI',
        'BR BIG',
        'BR BIG ',
        'BR BIG B',
        'BR BIG BO',
        'BR BIG BOA',
        'BR BIG BOAR',
        'BR BIG BOARD',
      ];

      for (const stroke of keystrokes) {
        fireEvent.change(newAssignInput, { target: { value: stroke } });
        expect(newAssignInput.value).toBe(stroke);
      }

      fireEvent.click(screen.getByTestId('add-assignment-btn'));
      expect(await screen.findByText('BR BIG BOARD')).toBeInTheDocument();

      // Navigate to Multiviewers and verify it appears in OutputDetailModal dropdown
      fireEvent.click(screen.getByRole('link', { name: /Multiviewers/i }));
      expect(await screen.findByTestId('output-card-OUT:MV-02-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('output-card-OUT:MV-02-01'));

      const prodSelect = (await screen.findByTestId(
        'production-assignment-input'
      )) as HTMLSelectElement;
      fireEvent.change(prodSelect, { target: { value: 'BR BIG BOARD' } });
      expect(prodSelect.value).toBe('BR BIG BOARD');
    });

    it('trims leading/trailing whitespace when adding an assignment while preserving internal spaces', async () => {
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo, '/productions');

      const newAssignInput = (await screen.findByTestId(
        'new-assignment-input'
      )) as HTMLInputElement;

      fireEvent.change(newAssignInput, { target: { value: '  TEST PRODUCTION A  ' } });
      expect(newAssignInput.value).toBe('  TEST PRODUCTION A  ');

      fireEvent.click(screen.getByTestId('add-assignment-btn'));
      expect(await screen.findByText('TEST PRODUCTION A')).toBeInTheDocument();
    });

    it('allows multiple outputs to share the same multi-word assignment from the dropdown', async () => {
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo);

      expect(await screen.findByTestId('output-card-OUT:MV-02-01')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // Output 1 -> 'BR ALERT 2'
      fireEvent.click(screen.getByTestId('output-card-OUT:MV-02-01'));
      const prodSelect1 = (await screen.findByTestId(
        'production-assignment-input'
      )) as HTMLSelectElement;
      fireEvent.change(prodSelect1, { target: { value: 'BR ALERT 2' } });
      fireEvent.click(screen.getByLabelText('Close detail modal'));

      // Output 2 -> 'BR ALERT 2'
      fireEvent.click(screen.getByTestId('output-card-OUT:MV-01-01'));
      const prodSelect2 = (await screen.findByTestId(
        'production-assignment-input'
      )) as HTMLSelectElement;
      fireEvent.change(prodSelect2, { target: { value: 'BR ALERT 2' } });
      fireEvent.click(screen.getByLabelText('Close detail modal'));

      // Review changes modal verifies both outputs share 'BR ALERT 2'
      fireEvent.click(screen.getByTestId('review-save-btn'));
      expect(await screen.findByTestId('review-changes-modal')).toBeInTheDocument();
      const matches = screen.getAllByText('BR ALERT 2');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Production Assignment Display Independence from Layout Assignment', () => {
    it('displays production assignment on MV output card with active layout', async () => {
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo);

      // OUT:MV-02-01 in seed has layout '6 BOX' and assignment 'BR ALERT 1'
      const card = await screen.findByTestId('output-card-OUT:MV-02-01');
      expect(within(card).getByText('BR ALERT 1')).toBeInTheDocument();
      expect(within(card).getByText('6 BOX')).toBeInTheDocument();
    });

    it('displays production assignment on MV output card with NO layout (Available / unassigned layout)', async () => {
      // Create seed snapshot where an output has assignmentName but no layoutName (status Available)
      const customSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
      const targetOut = customSnapshot.outputs.find(
        (o: import('../domain/models').MultiviewOutput) => o.id === 'OUT:MV-01-04'
      );
      targetOut.assignmentName = 'TEST PRODUCTION';
      targetOut.layoutName = null;
      targetOut.status = 'Available';

      const repo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(repo);

      const card = await screen.findByTestId('output-card-OUT:MV-01-04');
      // Must visibly display Production Assignment
      expect(within(card).getByText('TEST PRODUCTION')).toBeInTheDocument();
      // Must preserve existing available/no-layout presentation
      expect(within(card).getByText('AVAILABLE')).toBeInTheDocument();
      expect(within(card).getByText('No layout assigned')).toBeInTheDocument();
      // Does not show "Available" as the assignment label because it has an assignment
      expect(within(card).queryByText('Available', { selector: '.ev-card-assignment' })).toBeNull();
    });

    it('displays production assignment on MV output card with inactive / unassigned layout status', async () => {
      const customSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
      const targetOut = customSnapshot.outputs.find(
        (o: import('../domain/models').MultiviewOutput) => o.id === 'OUT:MV-01-03'
      );
      targetOut.assignmentName = 'TEST PRODUCTION';
      targetOut.status = 'Unassigned';
      targetOut.layoutName = null;

      const repo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(repo);

      const card = await screen.findByTestId('output-card-OUT:MV-01-03');
      expect(within(card).getByText('TEST PRODUCTION')).toBeInTheDocument();
      expect(within(card).getByText('AVAILABLE')).toBeInTheDocument();
    });

    it('shows layout info normally and does not invent production assignment when output has layout but no assignment', async () => {
      const customSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
      const targetOut = customSnapshot.outputs.find(
        (o: import('../domain/models').MultiviewOutput) => o.id === 'OUT:MV-02-01'
      );
      targetOut.assignmentName = null;
      targetOut.layoutName = '4 BOX';

      const repo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(repo);

      const card = await screen.findByTestId('output-card-OUT:MV-02-01');
      expect(within(card).getByText('4 BOX')).toBeInTheDocument();
      expect(within(card).getByText('Unassigned')).toBeInTheDocument();
    });

    it('preserves existing available/unassigned presentation when output has no layout and no assignment', async () => {
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo);

      // OUT:MV-01-04 in seed has no layout and no assignment
      const card = await screen.findByTestId('output-card-OUT:MV-01-04');
      expect(within(card).getByText('AVAILABLE')).toBeInTheDocument();
      expect(within(card).getByText('No layout assigned')).toBeInTheDocument();
      expect(
        within(card).getByText('Available', { selector: '.ev-card-assignment' })
      ).toBeInTheDocument();
    });

    it('immediately displays production assignment in draft UI when assigned in Edit Mode without a layout', async () => {
      const freshRepo = new LocalTrackerRepository(INITIAL_SNAPSHOT, new MemoryTrackerStorage());
      renderApp(freshRepo);

      // OUT:MV-01-04 is available with no layout
      const cardBefore = await screen.findByTestId('output-card-OUT:MV-01-04');
      expect(
        within(cardBefore).getByText('Available', { selector: '.ev-card-assignment' })
      ).toBeInTheDocument();

      // Enter edit mode
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));

      // Click card to open modal
      fireEvent.click(screen.getByTestId('output-card-OUT:MV-01-04'));

      // Select production assignment without selecting a layout
      const prodInput = (await screen.findByTestId(
        'production-assignment-input'
      )) as HTMLSelectElement;
      fireEvent.change(prodInput, { target: { value: 'RANKINGS' } });

      // Close modal
      fireEvent.click(screen.getByLabelText('Close detail modal'));

      // Card immediately displays 'RANKINGS' while remaining in available placeholder
      const cardAfter = screen.getByTestId('output-card-OUT:MV-01-04');
      expect(within(cardAfter).getByText('RANKINGS')).toBeInTheDocument();
      expect(within(cardAfter).getByText('AVAILABLE')).toBeInTheDocument();
      expect(within(cardAfter).getByText('No layout assigned')).toBeInTheDocument();
    });

    it('displays shared production name across multiple outputs with no layouts assigned', async () => {
      const customSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
      const out1 = customSnapshot.outputs.find(
        (o: import('../domain/models').MultiviewOutput) => o.id === 'OUT:MV-01-03'
      );
      const out2 = customSnapshot.outputs.find(
        (o: import('../domain/models').MultiviewOutput) => o.id === 'OUT:MV-01-04'
      );
      out1.assignmentName = 'TEST PRODUCTION';
      out1.layoutName = null;
      out2.assignmentName = 'TEST PRODUCTION';
      out2.layoutName = null;

      const repo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(repo);

      const card1 = await screen.findByTestId('output-card-OUT:MV-01-03');
      const card2 = await screen.findByTestId('output-card-OUT:MV-01-04');

      expect(within(card1).getByText('TEST PRODUCTION')).toBeInTheDocument();
      expect(within(card2).getByText('TEST PRODUCTION')).toBeInTheDocument();
    });
  });

  describe('Drag and Drop MV Inputs into Multiview Layout (Operator Feedback #1)', () => {
    function createMockDataTransfer() {
      const store: Record<string, string> = {};
      return {
        effectAllowed: 'uninitialized',
        dropEffect: 'none',
        setData: (type: string, val: string) => {
          store[type] = val;
        },
        getData: (type: string) => store[type] ?? '',
      };
    }

    it('Test 1 & Test 5 & Test 6: drags an MV input/source from Sources onto an empty MV layout box, saves via Review & Save, and persists across reload', async () => {
      const customSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(SNAPSHOT_WITH_SOURCES));
      const dest5 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-05')!;
      dest5.assignedSourceId = 'SRC:CAM_1' as SourceId;

      const sharedStorage = new MemoryTrackerStorage();
      const testRepo = new LocalTrackerRepository(customSnapshot, sharedStorage);
      const { unmount } = renderApp(testRepo, '/sources');

      const mv2Tab = await screen.findByRole('tab', { name: /MV-02/i });
      fireEvent.click(mv2Tab);

      const destCard = await screen.findByTestId('dest-card-DEST:MV-02-05');
      expect(destCard).toHaveAttribute('draggable', 'true');
      expect(within(destCard).getByText('CAM 1')).toBeInTheDocument();

      const outputCard = screen.getByTestId('output-card-OUT:MV-02-01');
      const emptyBox = within(outputCard).getByTestId('layout-window-3');
      expect(emptyBox).toHaveAttribute('data-pip-id', 'PIP-04');
      expect(emptyBox).toHaveAttribute('data-drop-target', 'true');
      expect(within(emptyBox).queryByText('CAM 1')).not.toBeInTheDocument();

      const dataTransfer = createMockDataTransfer();
      fireEvent.dragStart(destCard, { dataTransfer });
      expect(dataTransfer.getData('application/vip-dest-id')).toBe('DEST:MV-02-05');
      expect(dataTransfer.effectAllowed).toBe('copyMove');

      expect(emptyBox.className).toContain('drop-target-active');

      fireEvent.dragOver(emptyBox, { dataTransfer });
      expect(emptyBox).toHaveAttribute('data-drag-over', 'true');
      expect(emptyBox.className).toContain('drag-over');

      fireEvent.drop(emptyBox, { dataTransfer });
      fireEvent.dragEnd(destCard, { dataTransfer });

      expect(within(emptyBox).getByText('CAM 1')).toBeInTheDocument();
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('EDIT MODE • UNSAVED');

      fireEvent.click(screen.getByTestId('review-save-btn'));
      const reviewModal = await screen.findByTestId('review-changes-modal');
      expect(within(reviewModal).getByText(/MV-02-05 Input/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-save-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
      });

      unmount();
      const reloadedRepo = new LocalTrackerRepository(customSnapshot, sharedStorage);
      renderApp(reloadedRepo, '/sources');

      fireEvent.click(await screen.findByRole('tab', { name: /MV-02/i }));
      const reloadedOutputCard = await screen.findByTestId('output-card-OUT:MV-02-01');
      const reloadedPip4 = within(reloadedOutputCard).getByTestId('layout-window-3');
      expect(within(reloadedPip4).getByText('CAM 1')).toBeInTheDocument();
    });

    it('Test 2: dragging a different source onto an already-populated MV layout box replaces its assignment using existing reassignment rules', async () => {
      const customSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(SNAPSHOT_WITH_SOURCES));
      const dest1 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-01')!;
      const dest6 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-06')!;
      dest1.assignedSourceId = 'SRC:CAM_1' as SourceId;
      dest6.assignedSourceId = 'SRC:FS_01' as SourceId;

      const testRepo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(testRepo, '/sources');

      fireEvent.click(await screen.findByRole('tab', { name: /MV-02/i }));

      const outputCard = await screen.findByTestId('output-card-OUT:MV-02-01');
      const pip1Box = within(outputCard).getByTestId('layout-window-0');
      expect(within(pip1Box).getByText('CAM 1')).toBeInTheDocument();

      const dest6Card = screen.getByTestId('dest-card-DEST:MV-02-06');
      const dataTransfer = createMockDataTransfer();
      fireEvent.dragStart(dest6Card, { dataTransfer });
      fireEvent.dragOver(pip1Box, { dataTransfer });
      fireEvent.drop(pip1Box, { dataTransfer });
      fireEvent.dragEnd(dest6Card, { dataTransfer });

      expect(within(pip1Box).getByText('FS 01')).toBeInTheDocument();
      expect(within(pip1Box).queryByText('CAM 1')).not.toBeInTheDocument();
    });

    it('Test 3: releasing a dragged source outside a valid MV layout box makes no assignment and preserves existing state', async () => {
      const customSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(SNAPSHOT_WITH_SOURCES));
      const dest1 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-01')!;
      const dest5 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-05')!;
      dest1.assignedSourceId = 'SRC:CAM_1' as SourceId;
      dest5.assignedSourceId = 'SRC:CAM_2' as SourceId;

      const testRepo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(testRepo, '/sources');

      fireEvent.click(await screen.findByRole('tab', { name: /MV-02/i }));

      const outputCard = await screen.findByTestId('output-card-OUT:MV-02-01');
      const pip1Box = within(outputCard).getByTestId('layout-window-0');
      const pip4Box = within(outputCard).getByTestId('layout-window-3');
      expect(within(pip1Box).getByText('CAM 1')).toBeInTheDocument();
      expect(within(pip4Box).queryByText('CAM 2')).not.toBeInTheDocument();

      const dest5Card = screen.getByTestId('dest-card-DEST:MV-02-05');
      const dataTransfer = createMockDataTransfer();
      fireEvent.dragStart(dest5Card, { dataTransfer });
      fireEvent.drop(screen.getByRole('heading', { name: 'Signal Flows' }), { dataTransfer });
      fireEvent.dragEnd(dest5Card, { dataTransfer });

      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
      expect(within(pip1Box).getByText('CAM 1')).toBeInTheDocument();
      expect(within(pip4Box).queryByText('CAM 2')).not.toBeInTheDocument();
    });

    it('Test 4: supports both drag-and-drop and pre-existing dropdown assignment in OutputDetailModal', async () => {
      const customSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(SNAPSHOT_WITH_SOURCES));
      const dest5 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-05')!;
      const dest6 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-06')!;
      dest5.assignedSourceId = 'SRC:CAM_1' as SourceId;
      dest6.assignedSourceId = 'SRC:FS_01' as SourceId;

      const testRepo = new LocalTrackerRepository(customSnapshot, new MemoryTrackerStorage());
      renderApp(testRepo, '/sources');

      fireEvent.click(await screen.findByRole('tab', { name: /MV-02/i }));

      fireEvent.click(await screen.findByTestId('output-card-OUT:MV-02-01'));
      const modal = await screen.findByTestId('output-detail-modal');

      const paletteItem5 = within(modal).getByTestId('palette-input-DEST:MV-02-05');
      const modalPip4 = within(modal).getByTestId('layout-window-3');
      const dataTransfer = createMockDataTransfer();

      fireEvent.dragStart(paletteItem5, { dataTransfer });
      fireEvent.dragOver(modalPip4, { dataTransfer });
      expect(dataTransfer.dropEffect).toBe('move');
      fireEvent.drop(modalPip4, { dataTransfer });
      fireEvent.dragEnd(paletteItem5, { dataTransfer });

      expect(within(modalPip4).getByText('CAM 1')).toBeInTheDocument();

      const paletteItem6 = within(modal).getByTestId('palette-input-DEST:MV-02-06');
      const assignSelect = within(paletteItem6).getByRole('combobox');
      fireEvent.change(assignSelect, { target: { value: 'PIP-05' } });

      const modalPip5 = within(modal).getByTestId('layout-window-4');
      expect(within(modalPip5).getByText('FS 01')).toBeInTheDocument();
    });

    it('displays State column as "In Use" (for routed) and "Available" (for unrouted) and updates across save', async () => {
      const customSnapshot: TrackerSnapshot = JSON.parse(JSON.stringify(SNAPSHOT_WITH_SOURCES));
      const dest1 = customSnapshot.destinations.find((d) => d.id === 'DEST:MV-02-01')!;
      dest1.assignedSourceId = 'SRC:CAM_1' as SourceId;

      const sharedStorage = new MemoryTrackerStorage();
      const repoA = new LocalTrackerRepository(customSnapshot, sharedStorage);
      const { unmount } = renderApp(repoA, '/sources');

      fireEvent.click(await screen.findByRole('tab', { name: /MV-02/i }));

      // Switch to Table View
      fireEvent.click(screen.getByRole('button', { name: 'Table View' }));

      // DEST:MV-02-01 has a source -> State: "In Use" with badge-assigned
      const row1 = screen.getByTestId('dest-table-row-DEST:MV-02-01');
      const badge1 = within(row1).getByText('In Use');
      expect(badge1).toHaveClass('status-badge', 'badge-assigned');

      // DEST:MV-02-02 has no source -> State: "Available" with badge-available
      const row2 = screen.getByTestId('dest-table-row-DEST:MV-02-02');
      const badge2 = within(row2).getByText('Available');
      expect(badge2).toHaveClass('status-badge', 'badge-available');

      // Verify no remaining "Open" or "Patched" state badges in the table
      expect(within(row1).queryByText('Patched')).not.toBeInTheDocument();
      expect(within(row2).queryByText('Open')).not.toBeInTheDocument();

      // Enter edit mode and unroute DEST:MV-02-01 in Browser A
      fireEvent.click(screen.getByTestId('toggle-edit-mode-btn'));
      const clearBtn = within(row1).getByTestId('table-clear-dest-DEST:MV-02-01');
      fireEvent.click(clearBtn);

      // Now row1 becomes Available in draft
      expect(within(row1).getByText('Available')).toHaveClass('status-badge', 'badge-available');

      // Save changes
      fireEvent.click(screen.getByTestId('review-save-btn'));
      fireEvent.click(await screen.findByTestId('confirm-save-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
      });

      unmount();

      // Browser B loads the saved state from shared storage
      const repoB = new LocalTrackerRepository(customSnapshot, sharedStorage);
      renderApp(repoB, '/sources');

      fireEvent.click(await screen.findByRole('tab', { name: /MV-02/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Table View' }));

      const reloadedRow1 = screen.getByTestId('dest-table-row-DEST:MV-02-01');
      expect(within(reloadedRow1).getByText('Available')).toHaveClass(
        'status-badge',
        'badge-available'
      );
    });
  });
});
