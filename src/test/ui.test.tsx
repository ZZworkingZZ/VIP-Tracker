import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrackerRepositoryProvider } from '../app/TrackerRepositoryContext';
import { AppHeader } from '../components/layout/AppHeader';
import { DashboardPage } from '../pages/DashboardPage';
import { LayoutAssignmentsPage } from '../pages/LayoutAssignmentsPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { ProductionsPage } from '../pages/ProductionsPage';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';

function renderWithRepository(ui: React.ReactElement, initialRoute: string = '/') {
  const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT);
  return render(
    <TrackerRepositoryProvider repository={repo}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </TrackerRepositoryProvider>
  );
}

describe('UI Integration Tests', () => {
  it('renders application shell header with Local Data badge and navigation', async () => {
    renderWithRepository(<AppHeader />);

    expect(await screen.findByText('Evertz VIP Source Tracker')).toBeInTheDocument();
    expect(screen.getByText('Local Data')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Layouts & Assignments')).toBeInTheDocument();
    expect(screen.getByText('Destination Sources')).toBeInTheDocument();
    expect(screen.getByText('Productions & Assignments')).toBeInTheDocument();
    expect(screen.getByText('Source Directory')).toBeInTheDocument();
  });

  it('renders dashboard with all 5 multiview cards and summary statistics', async () => {
    renderWithRepository(<DashboardPage />);

    expect(await screen.findByText('Multiview Operations Dashboard')).toBeInTheDocument();

    // 5 Multiview cards
    expect(screen.getByText('Multiview 01 (MV-01)')).toBeInTheDocument();
    expect(screen.getByText('Multiview 02 (MV-02)')).toBeInTheDocument();
    expect(screen.getByText('Multiview 03 (MV-03)')).toBeInTheDocument();
    expect(screen.getByText('Multiview 04 (MV-04)')).toBeInTheDocument();
    expect(screen.getByText('Multiview 05 (MV-05)')).toBeInTheDocument();

    // Metric counts
    expect(screen.getByText('Total Outputs')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
  });

  it('renders Layouts & Assignments page with all 32 outputs and functional filters', async () => {
    renderWithRepository(<LayoutAssignmentsPage />);

    expect(await screen.findByText('Multiview Layouts & Assignments')).toBeInTheDocument();

    // Table rows
    expect(screen.getByText('MV-02-01')).toBeInTheDocument();
    expect(screen.getByText('BR ALERT 1')).toBeInTheDocument();

    // Filter by Multiview
    const mvSelect = screen.getByLabelText('Multiview');
    fireEvent.change(mvSelect, { target: { value: 'MV-01' } });

    // MV-01 has 4 available outputs
    expect(screen.getByText('MV-01-01')).toBeInTheDocument();
    expect(screen.queryByText('MV-02-01')).not.toBeInTheDocument();

    // Available state displayed
    const availableBadges = screen.getAllByText('Available');
    expect(availableBadges.length).toBeGreaterThan(0);
  });

  it('renders Destination Sources page with MV switcher and destination rows', async () => {
    renderWithRepository(<DestinationSourcesPage />);

    expect(await screen.findByText('Destination Source Matrix')).toBeInTheDocument();

    // Default MV-01 selected (36 inputs)
    expect(screen.getByText('MV-01-01')).toBeInTheDocument();
    expect(screen.getByText('MV-01-36')).toBeInTheDocument();

    // Switch to MV-03 (64 inputs)
    const mv3Tab = screen.getByRole('tab', { name: /MV-03/ });
    fireEvent.click(mv3Tab);

    expect(screen.getByText('MV-03-01')).toBeInTheDocument();
    expect(screen.getByText('MV-03-64')).toBeInTheDocument();
  });

  it('renders Productions & Assignments page with preserved assignment groupings', async () => {
    renderWithRepository(<ProductionsPage />);

    expect(await screen.findByText('Productions & Operational Assignments')).toBeInTheDocument();

    // Verified assignments exist
    expect(screen.getByText('BR ALERT 1')).toBeInTheDocument();
    expect(screen.getByText('HOH-WKB-01')).toBeInTheDocument();
    expect(screen.getByText('HOH_WKB-03')).toBeInTheDocument();
  });

  it('renders Source Directory page with accessible empty state for unpopulated sources', async () => {
    renderWithRepository(<SourceDirectoryPage />);

    expect(await screen.findByText('Source Directory')).toBeInTheDocument();

    // Empty state message explaining reference CSV status
    expect(screen.getByText(/No router sources currently cataloged/i)).toBeInTheDocument();
  });
});
