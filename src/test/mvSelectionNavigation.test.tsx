import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { renderWithProviders } from './helpers/renderWithProviders';

/** Real AppShell/sidebar navigation plus test-only links for explicit ?mvId= deep links. */
const AppUnderTest: React.FC = () => (
  <Routes>
    <Route
      path="/"
      element={
        <>
          <Link to="/sources?mvId=MV-09">go-sources-invalid</Link>
          <Link to="/?mvId=MV-09">go-dashboard-invalid</Link>
          <Link to="/sources?mvId=MV-05">go-sources-mv05</Link>
          <AppShell />
        </>
      }
    >
      <Route index element={<DashboardPage />} />
      <Route path="sources" element={<DestinationSourcesPage />} />
    </Route>
  </Routes>
);

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const isActive = (name: RegExp) => tab(name).getAttribute('aria-selected') === 'true';

async function renderApp(route = '/') {
  renderWithProviders(<AppUnderTest />, { route });
  await screen.findByRole('tab', { name: /All Displays|All VIPs/ });
}

async function goToSignalFlows() {
  fireEvent.click(screen.getByRole('link', { name: /Signal Flows/ }));
  await screen.findByRole('tab', { name: /All VIPs/ });
}

async function goToMultiviewers() {
  fireEvent.click(screen.getByRole('link', { name: /Multiviewers/ }));
  await screen.findByRole('tab', { name: /All Displays/ });
}

describe('Shared last-specific-MV selection between Multiviewers and Signal Flows', () => {
  it('Multiviewers MV-03 -> Signal Flows opens MV-03', async () => {
    await renderApp('/');
    fireEvent.click(tab(/^MV-03$/));
    await goToSignalFlows();
    expect(isActive(/^MV-03/)).toBe(true);
    expect(isActive(/^MV-01/)).toBe(false);
  });

  it('Signal Flows MV-04 -> Multiviewers opens MV-04', async () => {
    await renderApp('/sources');
    fireEvent.click(tab(/^MV-04/));
    await goToMultiviewers();
    expect(isActive(/^MV-04$/)).toBe(true);
    expect(isActive(/All Displays/)).toBe(false);
  });

  it('stays consistent across multiple round trips', async () => {
    await renderApp('/');
    fireEvent.click(tab(/^MV-03$/));
    await goToSignalFlows();
    expect(isActive(/^MV-03/)).toBe(true);
    await goToMultiviewers();
    expect(isActive(/^MV-03$/)).toBe(true);

    fireEvent.click(tab(/^MV-05$/));
    await goToSignalFlows();
    expect(isActive(/^MV-05/)).toBe(true);
    fireEvent.click(tab(/^MV-02/));
    await goToMultiviewers();
    expect(isActive(/^MV-02$/)).toBe(true);
    await goToSignalFlows();
    expect(isActive(/^MV-02/)).toBe(true);
  });

  it('MV-03 -> All Displays -> Signal Flows still opens MV-03', async () => {
    await renderApp('/');
    fireEvent.click(tab(/^MV-03$/));
    fireEvent.click(tab(/All Displays/));
    expect(isActive(/All Displays/)).toBe(true);
    await goToSignalFlows();
    expect(isActive(/^MV-03/)).toBe(true);
    expect(isActive(/All VIPs/)).toBe(false);
  });

  it('MV-03 -> All VIPs -> Multiviewers still opens MV-03', async () => {
    await renderApp('/sources');
    fireEvent.click(tab(/^MV-03/));
    fireEvent.click(tab(/All VIPs/));
    expect(isActive(/All VIPs/)).toBe(true);
    await goToMultiviewers();
    expect(isActive(/^MV-03$/)).toBe(true);
    expect(isActive(/All Displays/)).toBe(false);
  });

  it('keeps existing defaults when nothing is remembered (ALL / MV-01)', async () => {
    await renderApp('/');
    expect(isActive(/All Displays/)).toBe(true);
    await goToSignalFlows();
    expect(isActive(/^MV-01/)).toBe(true);
  });

  it('keeps Multiviewers on All Displays when only All Displays was ever selected', async () => {
    await renderApp('/');
    fireEvent.click(tab(/All Displays/));
    await goToSignalFlows();
    await goToMultiviewers();
    expect(isActive(/All Displays/)).toBe(true);
  });

  it('invalid ?mvId= falls back to the remembered MV, then to the default', async () => {
    // Nothing remembered -> existing default (MV-01)
    await renderApp('/');
    fireEvent.click(screen.getByText('go-sources-invalid'));
    await screen.findByRole('tab', { name: /All VIPs/ });
    expect(isActive(/^MV-01/)).toBe(true);
  });

  it('invalid ?mvId= uses the remembered MV when one exists', async () => {
    await renderApp('/');
    fireEvent.click(tab(/^MV-04$/));
    fireEvent.click(screen.getByText('go-sources-invalid'));
    await screen.findByRole('tab', { name: /All VIPs/ });
    expect(isActive(/^MV-04/)).toBe(true);

    fireEvent.click(screen.getByText('go-dashboard-invalid'));
    await screen.findByRole('tab', { name: /All Displays/ });
    expect(isActive(/^MV-04$/)).toBe(true);
  });

  it('a valid explicit ?mvId= overrides memory and updates it', async () => {
    await renderApp('/');
    fireEvent.click(tab(/^MV-03$/));
    fireEvent.click(screen.getByText('go-sources-mv05'));
    await screen.findByRole('tab', { name: /All VIPs/ });
    expect(isActive(/^MV-05/)).toBe(true);
    expect(isActive(/^MV-03/)).toBe(false);

    await goToMultiviewers();
    expect(isActive(/^MV-05$/)).toBe(true);
  });
});
