import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { LayoutAssignmentsPage } from '../pages/LayoutAssignmentsPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { ProductionsPage } from '../pages/ProductionsPage';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { renderWithProviders } from './helpers/renderWithProviders';

function renderWithRepository(
  ui: React.ReactElement,
  initialRoute: string = '/',
  customRepo?: LocalTrackerRepository
) {
  const repo = customRepo ?? new LocalTrackerRepository(INITIAL_SNAPSHOT);
  return render(
    <TrackerRepositoryProvider repository={repo}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </TrackerRepositoryProvider>
  );
}

describe('UI Integration Tests - Displays-First Operational Views', () => {
  it('renders application shell with Evertz top command bar, Local Data badge, and navigation sidebar', async () => {
    renderWithRepository(<AppShell />);

    expect(await screen.findByText('VIP TRACKER')).toBeInTheDocument();
    expect(screen.getByText('Evertz VIP Source Tracker')).toBeInTheDocument();
    expect(screen.getByText('Local Data')).toBeInTheDocument();
    expect(screen.getByText('TECH OPS')).toBeInTheDocument();
    expect(screen.getByText('Multiviewers')).toBeInTheDocument();
    expect(screen.getByText('Layouts')).toBeInTheDocument();
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('Assignments')).toBeInTheDocument();
    expect(screen.getByText('Source Directory')).toBeInTheDocument();
  });

  it('renders Displays page with Evertz 5-column layout, miniature multiviews, and drill-in detail modal', async () => {
    renderWithRepository(<DashboardPage />);

    // Compact status strip
    expect(await screen.findByText('VIP Cards')).toBeInTheDocument();
    expect(screen.queryByText('Destinations')).not.toBeInTheDocument();

    // 5 Evertz multiviewer columns present
    expect(screen.getByTestId('mv-column-MV-01')).toBeInTheDocument();
    expect(screen.getByTestId('mv-column-MV-02')).toBeInTheDocument();
    expect(screen.getByTestId('mv-column-MV-03')).toBeInTheDocument();
    expect(screen.getByTestId('mv-column-MV-04')).toBeInTheDocument();
    expect(screen.getByTestId('mv-column-MV-05')).toBeInTheDocument();

    // Output cards exist and render layout and assignment
    expect(screen.getByText('HOH-WKB-01')).toBeInTheDocument();
    expect(screen.getByTestId('output-card-OUT:MV-04-02')).toBeInTheDocument();

    // Click output card to trigger drill-in detail modal
    const outputCard = screen.getByTestId('output-card-OUT:MV-04-02');
    fireEvent.click(outputCard);

    // Modal appears with high-res display and destination breakdown
    expect(await screen.findByTestId('output-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('Visual Multiview Output Display')).toBeInTheDocument();
    expect(screen.getByText('Covered Destinations & Routed Sources (4)')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByLabelText('Close detail modal');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('output-detail-modal')).not.toBeInTheDocument();

    // Toggle to Table View
    const tableToggle = screen.getByRole('button', { name: 'Table View' });
    fireEvent.click(tableToggle);
    expect(screen.getByLabelText('Multiview Engineering Table')).toBeInTheDocument();
  });

  it('renders Layouts page with visual Evertz layout library and table view toggle', async () => {
    renderWithRepository(<LayoutAssignmentsPage />);

    expect(await screen.findByText('Multiview Layouts & Assignments')).toBeInTheDocument();

    // Visual Library cards present
    expect(screen.getByText('4 BOX')).toBeInTheDocument();
    expect(screen.getByText('3 BOX')).toBeInTheDocument();
    expect(screen.getByText('36 BOX')).toBeInTheDocument();

    // Toggle to Table View
    const tableBtn = screen.getByRole('button', { name: 'Table View' });
    fireEvent.click(tableBtn);

    expect(screen.getByLabelText('Multiview Outputs Table')).toBeInTheDocument();
    expect(screen.getByText('MV-02-01')).toBeInTheDocument();
  });

  it('renders Destination Sources page with MV switcher, active output feeds, and destination windows wall', async () => {
    renderWithRepository(<DestinationSourcesPage />);

    expect(await screen.findByText('Destination Source Matrix')).toBeInTheDocument();

    // Switch to MV-04 (58 inputs, active HOH-WKB layouts)
    const mv4Tab = screen.getByRole('tab', { name: /MV-04/ });
    fireEvent.click(mv4Tab);

    // Active output feeds rendered for MV-04
    expect(screen.getByTestId('output-card-OUT:MV-04-02')).toBeInTheDocument();

    // Destination windows wall rendered
    expect(screen.getByText(/Destination Windows Wall/i)).toBeInTheDocument();

    // Toggle to Table View
    const tableBtn = screen.getByRole('button', { name: 'Table View' });
    fireEvent.click(tableBtn);
    expect(screen.getByLabelText('MV-04 Destinations Table')).toBeInTheDocument();
  });

  it('renders Assignments page with visual assignment packages, miniature feeds, and preserved groupings', async () => {
    renderWithRepository(<ProductionsPage />);

    expect(await screen.findByText('Operational Assignments')).toBeInTheDocument();

    // Verified assignments exist
    expect(screen.getAllByText('BR ALERT 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HOH-WKB-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HOH_WKB-03').length).toBeGreaterThan(0);

    // Output miniature feeds inside assignment cards
    expect(screen.getByTestId('output-card-OUT:MV-04-02')).toBeInTheDocument();
  });

  it('renders Source Directory page with populated source catalog', async () => {
    renderWithRepository(<SourceDirectoryPage />);

    expect(await screen.findByText('Source Directory')).toBeInTheDocument();
    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    expect(screen.getAllByText('231').length).toBe(2);
  });

  it('renders Source Directory page with accessible empty state for unpopulated sources', async () => {
    const emptyRepo = new LocalTrackerRepository({ ...INITIAL_SNAPSHOT, sources: [] });
    renderWithRepository(<SourceDirectoryPage />, '/', emptyRepo);

    expect(await screen.findByText('Source Directory')).toBeInTheDocument();
    expect(screen.getByText(/No router sources currently cataloged/i)).toBeInTheDocument();
  });

  it('verifies MV layout and complete absence of Destination Range across views', async () => {
    renderWithRepository(<DashboardPage />);

    // Toggle to Table View on Dashboard
    const tableToggle = await screen.findByRole('button', { name: 'Table View' });
    fireEvent.click(tableToggle);

    // Main table has MV column and NO Destination Range or Input Range columns
    const mainTable = screen.getByLabelText('Multiview Engineering Table');
    expect(mainTable).toHaveTextContent('Output');
    expect(mainTable).toHaveTextContent('MV');
    expect(mainTable).toHaveTextContent('Status');
    expect(mainTable).toHaveTextContent('Layout');
    expect(mainTable).toHaveTextContent('Assignment');
    expect(mainTable).not.toHaveTextContent('Destination Range');
    expect(mainTable).not.toHaveTextContent('Input Range');
    expect(screen.queryByTestId('mv-config-table')).not.toBeInTheDocument();

    // Switch back to Display View and click an output card
    const displayToggle = screen.getByRole('button', { name: 'Display View' });
    fireEvent.click(displayToggle);

    const card = screen.getByTestId('output-card-OUT:MV-01-01');
    fireEvent.click(card);

    // Detail modal shows NO Destination Range and NO Input Range
    const modal = screen.getByTestId('output-detail-modal');
    expect(modal).not.toHaveTextContent('Destination Range');
    expect(modal).not.toHaveTextContent('Input Range');
  });

  it('renders Layouts page with MV column and no Dest Range or Input Range', async () => {
    renderWithRepository(<LayoutAssignmentsPage />);

    // Toggle to Table View
    const tableBtn = await screen.findByRole('button', { name: 'Table View' });
    fireEvent.click(tableBtn);

    const table = screen.getByLabelText('Multiview Outputs Table');
    expect(table).toHaveTextContent('Output');
    expect(table).toHaveTextContent('MV');
    expect(table).toHaveTextContent('Layout');
    expect(table).toHaveTextContent('Assignment');
    expect(table).not.toHaveTextContent('Dest Range');
    expect(table).not.toHaveTextContent('Destination Range');
    expect(table).not.toHaveTextContent('Input Range');

    // Filter bar has MV label
    expect(screen.getByLabelText('MV')).toBeInTheDocument();
  });

  it('header stats bar does not render a Destinations stat, and renders "VIP Cards" with the correct count', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('VIP Cards')).toBeInTheDocument();
    const vipCardsLabel = screen.getByText('VIP Cards');
    const stripItem = vipCardsLabel.closest('.strip-item');
    expect(stripItem).toHaveTextContent('VIP Cards');
    expect(stripItem).toHaveTextContent('5');

    // Header stats bar does not render a Destinations stat
    const statusStrip = screen.getByLabelText('System Metrics Summary');
    expect(statusStrip).not.toHaveTextContent('Destinations');
    expect(screen.queryByText('Destinations')).not.toBeInTheDocument();
  });
});
