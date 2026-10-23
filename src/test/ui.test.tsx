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
    expect(await screen.findByText('Multiviews')).toBeInTheDocument();
    expect(screen.getByText('Destinations')).toBeInTheDocument();

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

  it('verifies MV and Input Range conceptual layout and complete absence of Destination Range across views', async () => {
    renderWithRepository(<DashboardPage />);

    // Toggle to Table View on Dashboard
    const tableToggle = await screen.findByRole('button', { name: 'Table View' });
    fireEvent.click(tableToggle);

    // Multiview Frame Configuration table layout: MV | Input Range
    const configTable = screen.getByTestId('mv-config-table');
    expect(configTable).toBeInTheDocument();
    expect(configTable).toHaveTextContent('MV');
    expect(configTable).toHaveTextContent('Input Range');
    expect(configTable).toHaveTextContent('MV-01-01 through MV-01-36');
    expect(configTable).toHaveTextContent('MV-02-01 through MV-02-36');
    expect(configTable).toHaveTextContent('MV-03-01 through MV-03-64');
    expect(configTable).toHaveTextContent('MV-04-01 through MV-04-64');
    expect(configTable).toHaveTextContent('MV-05-01 through MV-05-64');

    // Main table has MV and Input Range columns, and NO Destination Range
    const mainTable = screen.getByLabelText('Multiview Engineering Table');
    expect(mainTable).toHaveTextContent('MV');
    expect(mainTable).toHaveTextContent('Input Range');
    expect(screen.queryByText('Destination Range')).not.toBeInTheDocument();

    // Switch back to Display View and click an output card
    const displayToggle = screen.getByRole('button', { name: 'Display View' });
    fireEvent.click(displayToggle);

    const card = screen.getByTestId('output-card-OUT:MV-01-01');
    fireEvent.click(card);

    // Detail modal shows Input Range and NO Destination Range
    const modal = screen.getByTestId('output-detail-modal');
    expect(modal).toHaveTextContent('Input Range');
    expect(modal).toHaveTextContent('MV-01-01 through MV-01-36');
    expect(modal).not.toHaveTextContent('Destination Range');
  });

  it('renders Layouts page with MV and Input Range columns and no Dest Range', async () => {
    renderWithRepository(<LayoutAssignmentsPage />);

    // Toggle to Table View
    const tableBtn = await screen.findByRole('button', { name: 'Table View' });
    fireEvent.click(tableBtn);

    const table = screen.getByLabelText('Multiview Outputs Table');
    expect(table).toHaveTextContent('MV');
    expect(table).toHaveTextContent('Input Range');
    expect(table).not.toHaveTextContent('Dest Range');
    expect(table).not.toHaveTextContent('Destination Range');

    // Filter bar has MV label
    expect(screen.getByLabelText('MV')).toBeInTheDocument();
  });
});
