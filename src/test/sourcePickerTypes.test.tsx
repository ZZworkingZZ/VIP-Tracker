import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { WORKBOOK_SOURCE_INVENTORY } from '../data/seed/sourceInventory';
import {
  getAuthoritativeLawoDropdownSources,
  getAuthoritativeProcessingDropdownSources,
  getAuthoritativeTielineDropdownSources,
} from '../domain/signalFlow';
import { getPickerType, type SourcePickerRole } from '../domain/pickerTypes';
import { SearchableSourcePicker } from '../components/multiview/SearchableSourcePicker';
import { SEED_LAWO_SOURCES } from '../data/seed/sourceInventory';
import type { Source } from '../domain/models';

interface SheetRow {
  readonly name: string;
  readonly type?: string;
}

// Sheet Type columns (authoritative). The tieline picker lists all 267 Evertz sources.
const SHEET: Record<SourcePickerRole, readonly SheetRow[]> = {
  lawoSource: WORKBOOK_SOURCE_INVENTORY.lawoSources,
  lawoProcessing: WORKBOOK_SOURCE_INVENTORY.lawoProcessing,
  tieline: WORKBOOK_SOURCE_INVENTORY.evertzSources,
};

function expectedChips(role: SourcePickerRole): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of SHEET[role]) {
    const key = (row.type ?? '').trim() || 'Uncategorized';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries());
}

function sourcesFor(role: SourcePickerRole): Source[] {
  if (role === 'lawoSource') return getAuthoritativeLawoDropdownSources(INITIAL_SNAPSHOT.sources);
  if (role === 'lawoProcessing') {
    return getAuthoritativeProcessingDropdownSources(INITIAL_SNAPSHOT.sources);
  }
  return getAuthoritativeTielineDropdownSources(INITIAL_SNAPSHOT.sources);
}

function chipTexts(): string[] {
  const row = screen.getByTestId('category-chips-row');
  return within(row)
    .getAllByRole('button')
    .map((b) => b.textContent ?? '');
}

describe('Source picker chips use workbook Type columns', () => {
  const roles: SourcePickerRole[] = ['lawoSource', 'lawoProcessing', 'tieline'];

  for (const role of roles) {
    it(`${role}: chips, order and counts match the sheet exactly, no losses or duplicates`, () => {
      const sources = sourcesFor(role);
      render(
        <SearchableSourcePicker
          sources={sources}
          pickerRole={role}
          selectedSourceId={null}
          onSelectSource={vi.fn()}
        />
      );
      const expected = expectedChips(role);
      const total = SHEET[role].length;
      expect(sources.length).toBe(total);
      expect(chipTexts()).toEqual([
        `All (${total})`,
        ...expected.map(([type, n]) => `${type} (${n})`),
      ]);
      expect(expected.reduce((sum, [, n]) => sum + n, 0)).toBe(total);
      if (!expected.some(([t]) => t === 'Other')) {
        expect(screen.queryByTestId('category-chip-other')).toBeNull();
      }
    });
  }

  it('matches documented sheet counts for Processing and Evertz-source lists', () => {
    const proc = Object.fromEntries(expectedChips('lawoProcessing'));
    expect(proc).toEqual({ Caption: 6, 'Color Corrector': 40, 'Frame Sync': 60, UDX: 32 });
    const tie = Object.fromEntries(expectedChips('tieline'));
    expect(tie).toEqual({
      JXS: 72,
      vCam: 56,
      vTie: 37,
      'VIP Output': 32,
      Playback: 25,
      vIngest: 16,
      Swr: 16,
      vPgm: 8,
      Caption: 3,
      QC: 2,
    });
  });

  it('blank type falls under Uncategorized and is not dropped', () => {
    const blank = { ...SEED_LAWO_SOURCES[0], id: 'SRC:NOT_IN_SHEET' } as unknown as Source;
    expect(getPickerType('lawoSource', blank.id)).toBe('Uncategorized');
    render(
      <SearchableSourcePicker
        sources={[SEED_LAWO_SOURCES[0], blank]}
        pickerRole="lawoSource"
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );
    expect(screen.getByTestId('category-chip-uncategorized')).toHaveTextContent(
      'Uncategorized (1)'
    );
    expect(chipTexts()[0]).toBe('All (2)');
  });

  it('selecting a source emits the same canonical ID', () => {
    const sources = sourcesFor('tieline');
    const target = sources.find((s) => s.name === 'TX TWD 8801') ?? sources[0];
    const onSelect = vi.fn();
    render(
      <SearchableSourcePicker
        sources={sources}
        pickerRole="tieline"
        selectedSourceId={null}
        onSelectSource={onSelect}
      />
    );
    fireEvent.click(screen.getByTestId(`source-option-${target.id}`));
    expect(onSelect).toHaveBeenCalledWith(target.id);
  });

  it('without pickerRole, Source.category chips are unchanged', () => {
    render(
      <SearchableSourcePicker
        sources={sourcesFor('lawoSource')}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );
    expect(screen.getByTestId('category-chip-other')).toBeInTheDocument();
  });
});
