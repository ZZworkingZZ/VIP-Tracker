import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/renderWithProviders';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';

const DEST = 'DEST:MV-03-01';
const TRIGGER = `trigger-wall-select-tieline-${DEST}`;

async function openPicker() {
  const repo = new LocalTrackerRepository(INITIAL_SNAPSHOT);
  renderWithProviders(<DestinationSourcesPage />, {
    repository: repo,
    route: '/sources?mvId=MV-03',
  });
  fireEvent.click(await screen.findByTestId(`dest-card-${DEST}`));
  const overlay = await screen.findByTestId('wall-flow-inspector-overlay');
  fireEvent.click(screen.getByTestId(TRIGGER));
  const popover = await screen.findByTestId('source-picker-popover');
  return { overlay, popover };
}

describe('Source picker popover inside the Signal Flow inspector overlay', () => {
  it('1. renders in a body portal outside the overlay, position: fixed, above the overlay z-index', async () => {
    const { overlay, popover } = await openPicker();
    expect(overlay.contains(popover)).toBe(false);
    expect(popover.parentElement).toBe(document.body);
    expect(popover).toHaveStyle({ position: 'fixed' });
    expect(Number(popover.style.zIndex)).toBeGreaterThan(1200);
  });

  it('2. chip row wraps with no scroll or max-height', async () => {
    const { popover } = await openPicker();
    const row = within(popover).getByTestId('category-chips-row');
    expect(row.style.overflowY).toBe('');
    expect(row.style.overflowX).toBe('');
    expect(row.style.maxHeight).toBe('');
    expect(row.style.flexWrap).toBe('wrap');
  });

  it('3. the results list is the only scroll region in the popover', async () => {
    const { popover } = await openPicker();
    const scrollers = Array.from(popover.querySelectorAll<HTMLElement>('*')).filter((el) =>
      ['auto', 'scroll'].includes(el.style.overflowY)
    );
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0]).toBe(within(popover).getByTestId('source-picker-list'));
    expect(scrollers[0].style.maxHeight).toBe('');
  });

  it('4. first Escape closes only the picker, second closes the inspector', async () => {
    const { popover } = await openPicker();
    fireEvent.keyDown(within(popover).getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
    expect(screen.getByTestId('wall-flow-inspector-overlay')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('wall-flow-inspector-overlay')).not.toBeInTheDocument();
  });

  it('5. clicks inside the popover keep both open; outside click closes only the picker', async () => {
    const { popover } = await openPicker();
    const inner = within(popover).getByTestId('category-chips-row');
    fireEvent.mouseDown(inner);
    fireEvent.click(inner);
    expect(screen.getByTestId('source-picker-popover')).toBeInTheDocument();
    expect(screen.getByTestId('wall-flow-inspector-overlay')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId(`wall-inspector-full-path-${DEST}`));
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
    expect(screen.getByTestId('wall-flow-inspector-overlay')).toBeInTheDocument();
  });

  it('6. selecting a source applies the same canonical ID via the same handler', async () => {
    const { popover } = await openPicker();
    const option = within(popover)
      .getAllByTestId(/^source-option-SRC:/)
      .find((el) => el.getAttribute('data-testid') === 'source-option-SRC:VCAM_41')!;
    expect(option).toBeDefined();
    fireEvent.click(option);
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
    expect((screen.getByTestId(`wall-select-tieline-${DEST}`) as HTMLSelectElement).value).toBe(
      'SRC:VCAM_41'
    );
  });

  it('keeps the native select hidden and not tabbable', async () => {
    await openPicker();
    const sel = screen.getByTestId(`wall-select-tieline-${DEST}`);
    expect(sel).toHaveAttribute('tabindex', '-1');
    expect(sel).toHaveStyle({ opacity: '0' });
  });
});
