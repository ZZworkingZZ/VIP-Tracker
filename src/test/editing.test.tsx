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
    fireEvent.change(prodInput, { target: { value: 'CHOPPED SPECIAL' } });

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

    // Change Production Assignment to CHOPPED
    const prodInput = screen.getByTestId('production-assignment-input');
    fireEvent.change(prodInput, { target: { value: 'CHOPPED' } });

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
    expect(within(reviewModal).getByText('CHOPPED')).toBeInTheDocument();
    expect(within(reviewModal).getAllByText('CNN-NYP-Feed-1').length).toBeGreaterThan(0);

    // Confirm save
    const confirmSaveBtn = screen.getByTestId('confirm-save-btn');
    fireEvent.click(confirmSaveBtn);

    // Mode pill returns to ACTIVE
    await waitFor(() => {
      expect(screen.getByTestId('app-mode-pill')).toHaveTextContent('ACTIVE');
    });

    // Output card now immediately renders CHOPPED
    const updatedCard = screen.getByTestId('output-card-OUT:MV-02-01');
    expect(within(updatedCard).getByText('CHOPPED')).toBeInTheDocument();
  });

  it('allows assigning an AVAILABLE output with a layout and destination range', async () => {
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
    fireEvent.change(prodInput, { target: { value: 'STUDIO 21 MONITOR' } });

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

    // OUT:MV-01-01 is now assigned with 4 BOX and STUDIO 21 MONITOR
    const updatedCard = screen.getByTestId('output-card-OUT:MV-01-01');
    expect(updatedCard).toHaveTextContent('4 BOX');
    expect(updatedCard).toHaveTextContent('STUDIO 21 MONITOR');
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
      target: { value: 'UNSAVED DISCARD TEST' },
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
    expect(screen.getByTestId('output-card-OUT:MV-02-01')).not.toHaveTextContent(
      'UNSAVED DISCARD TEST'
    );

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
});
