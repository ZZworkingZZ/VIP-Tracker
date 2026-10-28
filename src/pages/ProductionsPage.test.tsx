import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../test/helpers/renderWithProviders';
import { ProductionsPage } from './ProductionsPage';
import { EditModeBanner } from '../components/multiview/EditModeBanner';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { MemoryTrackerStorage } from '../services/storage';
import { TrackerSnapshot } from '../domain/models';

function createTestRepo(customSnapshot?: TrackerSnapshot) {
  const snap = customSnapshot ?? JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
  return new LocalTrackerRepository(snap, new MemoryTrackerStorage());
}

describe('ProductionsPage & OutputDetailModal Production Assignment Dropdown', () => {
  it('adds a Production Assignment with spaces on the Assignments page and saves through Review Changes', async () => {
    const repo = createTestRepo();
    renderWithProviders(
      <>
        <EditModeBanner />
        <ProductionsPage />
      </>,
      { repository: repo, route: '/productions' }
    );

    const input = await screen.findByTestId('new-assignment-input');
    fireEvent.change(input, { target: { value: 'SUNDAY NIGHT LIVE 1' } });
    fireEvent.click(screen.getByTestId('add-assignment-btn'));

    expect(await screen.findByText('SUNDAY NIGHT LIVE 1')).toBeInTheDocument();
    expect(screen.getByTestId('edit-mode-banner')).toBeInTheDocument();

    // Open Review & Save
    fireEvent.click(screen.getByTestId('review-save-btn'));
    expect(await screen.findByTestId('review-changes-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-save-btn'));

    const saved = await repo.getSnapshot();
    expect(saved.operationalAssignments.some((a) => a.rawName === 'SUNDAY NIGHT LIVE 1')).toBe(
      true
    );
    expect(
      saved.history?.some(
        (h) =>
          h.entityType === 'Production Assignment' &&
          h.summary.includes('Added Production Assignment: SUNDAY NIGHT LIVE 1')
      )
    ).toBe(true);
  });

  it('rejects duplicate Production Assignment names (case-insensitive and trimmed)', async () => {
    const repo = createTestRepo();
    renderWithProviders(<ProductionsPage />, { repository: repo, route: '/productions' });

    const input = await screen.findByTestId('new-assignment-input');
    // HOH-WKB-01 is in INITIAL_SNAPSHOT
    fireEvent.change(input, { target: { value: '  hoh-wkb-01  ' } });
    fireEvent.click(screen.getByTestId('add-assignment-btn'));

    expect(await screen.findByTestId('add-assignment-error')).toHaveTextContent(/already exists/i);
  });

  it('renames a Production Assignment inline and propagates the new name to all MVs using it in the same save', async () => {
    const repo = createTestRepo();
    renderWithProviders(
      <>
        <EditModeBanner />
        <ProductionsPage />
      </>,
      { repository: repo, route: '/productions' }
    );

    const renameBtn = await screen.findByTestId('rename-assignment-btn-HOH-WKB-01');
    fireEvent.click(renameBtn);

    const renameInput = screen.getByTestId('rename-assignment-input-HOH-WKB-01');
    fireEvent.change(renameInput, { target: { value: 'HOH MAIN SHOW' } });
    fireEvent.click(screen.getByTestId('save-rename-assignment-HOH-WKB-01'));

    expect((await screen.findAllByText('HOH MAIN SHOW')).length).toBeGreaterThan(0);
    expect(screen.queryByText('HOH-WKB-01')).not.toBeInTheDocument();

    // Save through shared Review Changes flow
    fireEvent.click(screen.getByTestId('review-save-btn'));
    fireEvent.click(await screen.findByTestId('confirm-save-btn'));

    const saved = await repo.getSnapshot();
    expect(saved.operationalAssignments.some((a) => a.rawName === 'HOH MAIN SHOW')).toBe(true);
    expect(saved.operationalAssignments.some((a) => a.rawName === 'HOH-WKB-01')).toBe(false);

    // Every MV output that previously had HOH-WKB-01 should now have HOH MAIN SHOW
    const oldOutputs = INITIAL_SNAPSHOT.outputs.filter((o) => o.assignmentName === 'HOH-WKB-01');
    expect(oldOutputs.length).toBeGreaterThan(0);
    for (const orig of oldOutputs) {
      const updatedOut = saved.outputs.find((o) => o.id === orig.id);
      expect(updatedOut?.assignmentName).toBe('HOH MAIN SHOW');
    }
  });

  it('removes an in-use Production Assignment after listing affected MVs in confirmation and clears those MVs', async () => {
    const repo = createTestRepo();
    renderWithProviders(
      <>
        <EditModeBanner />
        <ProductionsPage />
      </>,
      { repository: repo, route: '/productions' }
    );

    const removeBtn = await screen.findByTestId('remove-assignment-btn-HOH-WKB-01');
    fireEvent.click(removeBtn);

    const modal = await screen.findByTestId('remove-assignment-modal');
    const affectedMvs = within(modal).getByTestId('remove-assignment-affected-mvs');
    // MV-04-02 uses HOH-WKB-01 in INITIAL_SNAPSHOT
    expect(affectedMvs).toHaveTextContent('MV-04-02');

    fireEvent.click(within(modal).getByTestId('confirm-remove-assignment-btn'));

    expect(screen.queryByTestId('remove-assignment-modal')).not.toBeInTheDocument();
    expect(screen.queryByText('HOH-WKB-01')).not.toBeInTheDocument();

    // Save changes
    fireEvent.click(screen.getByTestId('review-save-btn'));
    fireEvent.click(await screen.findByTestId('confirm-save-btn'));

    const saved = await repo.getSnapshot();
    expect(saved.operationalAssignments.some((a) => a.rawName === 'HOH-WKB-01')).toBe(false);
    const affectedOut = saved.outputs.find((o) => o.id === 'OUT:MV-04-02');
    expect(affectedOut?.assignmentName).toBeNull();
  });

  it('renders a dropdown in OutputDetailModal with sorted assignments and clears assignment when — None — is selected', async () => {
    const repo = createTestRepo();
    const snap = await repo.getSnapshot();
    const out = snap.outputs.find((o) => o.id === 'OUT:MV-04-02')!;

    renderWithProviders(<OutputDetailModal output={out} onClose={() => {}} />, {
      repository: repo,
    });

    const editBtn = await screen.findByTestId('enter-edit-mode-btn');
    fireEvent.click(editBtn);

    const select = (await screen.findByTestId('production-assignment-input')) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('HOH-WKB-01');

    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options[0]).toBe('— None —');
    const catalogNames = options.slice(1);
    const sortedCopy = [...catalogNames].sort((a, b) => (a ?? '').localeCompare(b ?? ''));
    expect(catalogNames).toEqual(sortedCopy);

    // Selecting — None — clears the assignment
    fireEvent.change(select, { target: { value: '' } });
    expect(select.value).toBe('');
  });

  it('preserves a legacy unknown assignment name on an MV with (not in Assignments) option', async () => {
    const customSnap: TrackerSnapshot = JSON.parse(JSON.stringify(INITIAL_SNAPSHOT));
    customSnap.outputs = customSnap.outputs.map((o) =>
      o.id === 'OUT:MV-01-01' ? { ...o, assignmentName: 'LEGACY MYSTERY SHOW' } : o
    );
    const repo = createTestRepo(customSnap);
    const out1 = customSnap.outputs.find((o) => o.id === 'OUT:MV-01-01')!;

    renderWithProviders(<OutputDetailModal output={out1} onClose={() => {}} />, {
      repository: repo,
    });

    fireEvent.click(await screen.findByTestId('enter-edit-mode-btn'));

    const select = (await screen.findByTestId('production-assignment-input')) as HTMLSelectElement;
    expect(select.value).toBe('LEGACY MYSTERY SHOW');
    const legacyOption = Array.from(select.options).find((o) => o.value === 'LEGACY MYSTERY SHOW');
    expect(legacyOption?.textContent).toBe('LEGACY MYSTERY SHOW (not in Assignments)');
  });
});
