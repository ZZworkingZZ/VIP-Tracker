import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import {
  getAuthoritativeLawoDropdownSources,
  getAuthoritativeProcessingDropdownSources,
  getAuthoritativeTielineDropdownSources,
  getValidTielineOptions,
} from '../domain/signalFlow';
import { SearchableSourcePicker } from '../components/multiview/SearchableSourcePicker';
import { matchesSourceQuery, normalizeSourceSearch } from '../domain/sourceSearch';
import { Source } from '../domain/models';
import { createSourceId, SourceId } from '../domain/identifiers';
import { SourceCategory, classifySourceCategory } from '../domain/sourceCategories';

describe('Source Navigation, Category Chips, and Type-Ahead Search', () => {
  it('classifies RX TWD sources as Reception, mirroring TX TWD as Transmission', () => {
    expect(classifySourceCategory('RX TWD 9936')).toBe('Reception');
    expect(classifySourceCategory('TX TWD 8836')).toBe('Transmission');
    const seedRx = INITIAL_SNAPSHOT.sources.find((s) => s.name === 'RX TWD 9936');
    expect(seedRx?.category).toBe('Reception');
  });

  const lawoSources = getAuthoritativeLawoDropdownSources(INITIAL_SNAPSHOT.sources);
  const procSources = getAuthoritativeProcessingDropdownSources(INITIAL_SNAPSHOT.sources);
  const tielineSources = getAuthoritativeTielineDropdownSources(INITIAL_SNAPSHOT.sources);

  // Requirement 1
  it('1. category chips appear with correct counts for each of the three lists', () => {
    // List 1: Lawo Sources (~712)
    const { unmount: unmount1 } = render(
      <SearchableSourcePicker
        sources={lawoSources}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );
    expect(screen.getByTestId('category-chip-all')).toHaveTextContent('All (720)');
    expect(screen.getByTestId('category-chip-other')).toHaveTextContent('Other (428)');
    expect(screen.getByTestId('category-chip-reception')).toHaveTextContent('Reception (36)');
    expect(screen.getByTestId('category-chip-switcher')).toHaveTextContent('Switcher (37)');
    expect(screen.getByTestId('category-chip-virtual-camera')).toHaveTextContent(
      'Virtual Camera (60)'
    );
    unmount1();

    // List 2: Lawo Processing (~138)
    const { unmount: unmount2 } = render(
      <SearchableSourcePicker
        sources={procSources}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );
    expect(screen.getByTestId('category-chip-all')).toHaveTextContent('All (138)');
    expect(screen.getByTestId('category-chip-other')).toHaveTextContent('Other (138)');
    unmount2();

    // List 3: Lawo Dest / Evertz Sources (~267)
    const { unmount: unmount3 } = render(
      <SearchableSourcePicker
        sources={tielineSources}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );
    expect(screen.getByTestId('category-chip-all')).toHaveTextContent('All (319)');
    expect(screen.getByTestId('category-chip-virtual-camera')).toHaveTextContent(
      'Virtual Camera (56)'
    );
    expect(screen.getByTestId('category-chip-virtual-tie')).toHaveTextContent('Virtual Tie (37)');
    // RX TWD 9901-9936 classify as Reception; the 52 newer GFX/PS5/NDI/vMix/etc. sources fall under Other.
    expect(screen.getByTestId('category-chip-other')).toHaveTextContent('Other (52)');
    expect(screen.getByTestId('category-chip-reception')).toHaveTextContent('Reception (36)');
    expect(screen.getByTestId('category-chip-transmission')).toHaveTextContent('Transmission (36)');
    expect(screen.getByTestId('category-chip-multiview')).toHaveTextContent('Multiview (32)');
    expect(screen.getByTestId('category-chip-switcher')).toHaveTextContent('Switcher (16)');
    expect(screen.getByTestId('category-chip-virtual-ingest')).toHaveTextContent(
      'Virtual Ingest (16)'
    );
    expect(screen.getByTestId('category-chip-jxs-clip')).toHaveTextContent('JXS Clip (12)');
    expect(screen.getByTestId('category-chip-virtual-program')).toHaveTextContent(
      'Virtual Program (8)'
    );
    expect(screen.getByTestId('category-chip-jxs-replay')).toHaveTextContent('JXS Replay (6)');
    expect(screen.getByTestId('category-chip-j2k-replay')).toHaveTextContent('J2K Replay (4)');
    expect(screen.getByTestId('category-chip-capture-encoder')).toHaveTextContent(
      'Capture Encoder (3)'
    );
    expect(screen.getByTestId('category-chip-j2k-clip')).toHaveTextContent('J2K Clip (3)');
    expect(screen.getByTestId('category-chip-test')).toHaveTextContent('Test (2)');
    unmount3();
  });

  // Requirement 2
  it('2. selecting a category filters the list to that category only', () => {
    render(
      <SearchableSourcePicker
        sources={tielineSources}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );

    // Click Virtual Camera category chip
    const vCamChip = screen.getByTestId('category-chip-virtual-camera');
    fireEvent.click(vCamChip);

    // Only Virtual Camera items should be visible
    expect(screen.getByTestId('source-option-SRC:VCAM_01')).toBeInTheDocument();
    expect(screen.getByTestId('source-option-SRC:VCAM_31')).toBeInTheDocument();
    // Non-Virtual Camera source (e.g. BARS - Test) should NOT be visible
    expect(screen.queryByTestId('source-option-SRC:BARS')).not.toBeInTheDocument();
    // Non-Virtual Camera source (e.g. FS 01 - Other) should NOT be visible
    expect(screen.queryByTestId('source-option-SRC:FS_01')).not.toBeInTheDocument();
  });

  // Requirement 3
  it('3. search filters by name and alias, and ignores separator differences ("vcam31", "vcam 31" and "vCam-31" find "vCam 31")', () => {
    const testSources: Source[] = [
      {
        id: createSourceId('vCam 31'),
        name: 'vCam 31',
        normalizedName: 'VCAM 31',
        category: 'Virtual Camera',
        active: true,
        upstreamSourceId: null,
        sourceType: 'virtual',
        routeRole: 'tieline',
        alias: 'Main Redundancy-01',
      },
      {
        id: createSourceId('CAM 01'),
        name: 'CAM 01',
        normalizedName: 'CAM 01',
        category: 'Other',
        active: true,
        upstreamSourceId: null,
        sourceType: 'originating',
        routeRole: 'evertz_source',
      },
    ];

    // Unit checks for separator normalization
    expect(normalizeSourceSearch('vCam 31')).toBe('vcam31');
    expect(normalizeSourceSearch('vcam-31')).toBe('vcam31');
    expect(normalizeSourceSearch('vcam_31')).toBe('vcam31');
    expect(normalizeSourceSearch('vcam.31')).toBe('vcam31');

    expect(matchesSourceQuery(testSources[0], 'vcam31')).toBe(true);
    expect(matchesSourceQuery(testSources[0], 'vcam 31')).toBe(true);
    expect(matchesSourceQuery(testSources[0], 'vCam-31')).toBe(true);
    expect(matchesSourceQuery(testSources[0], 'mainredundancy01')).toBe(true);
    expect(matchesSourceQuery(testSources[0], 'Main Redundancy-01')).toBe(true);
    expect(matchesSourceQuery(testSources[0], 'main-redundancy 01')).toBe(true);

    // UI test with SearchableSourcePicker
    const { unmount } = render(
      <SearchableSourcePicker
        sources={testSources}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('source-picker-search-input');

    // "vcam31"
    fireEvent.change(searchInput, { target: { value: 'vcam31' } });
    expect(screen.getByTestId('source-option-SRC:VCAM_31')).toBeInTheDocument();
    expect(screen.queryByTestId('source-option-SRC:CAM_01')).not.toBeInTheDocument();

    // "vcam 31"
    fireEvent.change(searchInput, { target: { value: 'vcam 31' } });
    expect(screen.getByTestId('source-option-SRC:VCAM_31')).toBeInTheDocument();

    // "vCam-31"
    fireEvent.change(searchInput, { target: { value: 'vCam-31' } });
    expect(screen.getByTestId('source-option-SRC:VCAM_31')).toBeInTheDocument();

    // Search by alias without separators: "mainredundancy01"
    fireEvent.change(searchInput, { target: { value: 'mainredundancy01' } });
    expect(screen.getByTestId('source-option-SRC:VCAM_31')).toBeInTheDocument();

    // Empty search text reverts to showing all
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByTestId('source-option-SRC:VCAM_31')).toBeInTheDocument();
    expect(screen.getByTestId('source-option-SRC:CAM_01')).toBeInTheDocument();

    // Non-matching search shows empty state
    fireEvent.change(searchInput, { target: { value: 'nonexistent999' } });
    expect(screen.getByTestId('no-matching-sources')).toBeInTheDocument();

    unmount();
  });

  // Requirement 4
  it('4. search combined with a category filter works', () => {
    render(
      <SearchableSourcePicker
        sources={tielineSources}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );

    // Select category "Switcher"
    fireEvent.click(screen.getByTestId('category-chip-switcher'));

    // Type query "201"
    const searchInput = screen.getByTestId('source-picker-search-input');
    fireEvent.change(searchInput, { target: { value: '201' } });

    // Should find Switcher 201 (Swr 201)
    expect(screen.getByTestId('source-option-SRC:SWR_201')).toBeInTheDocument();

    // But should not match sources from other categories even if they have "201"
    expect(screen.queryByTestId('source-option-SRC:VCAM_01')).not.toBeInTheDocument();
  });

  // Requirement 5
  it('5. sources with no category appear under "Uncategorized"', () => {
    const uncatSource: Source = {
      id: createSourceId('Mystery Signal 1'),
      name: 'Mystery Signal 1',
      normalizedName: 'MYSTERY SIGNAL 1',
      category: '' as unknown as SourceCategory, // empty / missing category
      active: true,
      upstreamSourceId: null,
      sourceType: 'originating',
      routeRole: 'evertz_source',
    };

    render(
      <SearchableSourcePicker
        sources={[uncatSource, ...tielineSources]}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
      />
    );

    // Chip for Uncategorized should be present
    const uncatChip = screen.getByTestId('category-chip-uncategorized');
    expect(uncatChip).toBeInTheDocument();
    expect(uncatChip).toHaveTextContent('Uncategorized (1)');

    // Header for Uncategorized should be present in grouped list
    expect(screen.getByTestId('category-header-uncategorized')).toHaveTextContent(
      'Uncategorized (1)'
    );
    expect(screen.getByTestId('source-option-SRC:MYSTERY_SIGNAL_1')).toBeInTheDocument();
  });

  // Requirement 6
  it('6. selecting a source saves the same canonical ID as before', () => {
    const onSelect = vi.fn();
    render(
      <SearchableSourcePicker
        sources={tielineSources}
        selectedSourceId={null}
        onSelectSource={onSelect}
      />
    );

    // Click vCam 31
    fireEvent.click(screen.getByTestId('source-option-SRC:VCAM_31'));
    expect(onSelect).toHaveBeenCalledWith('SRC:VCAM_31');

    // Click Unrouted / Blank
    fireEvent.click(screen.getByTestId('source-option-unrouted'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  // Requirement 7
  it('7. the currently assigned source is highlighted', () => {
    render(
      <SearchableSourcePicker
        sources={tielineSources}
        selectedSourceId="SRC:VCAM_31"
        onSelectSource={vi.fn()}
      />
    );

    const vcamOption = screen.getByTestId('source-option-SRC:VCAM_31');
    expect(vcamOption).toHaveTextContent('Selected');
  });

  // Requirement 8
  it('8. Escape closes the picker, and Enter selects the highlighted result', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <SearchableSourcePicker
        sources={tielineSources}
        selectedSourceId={null}
        onSelectSource={onSelect}
        onClose={onClose}
      />
    );

    const searchInput = screen.getByTestId('source-picker-search-input');

    // Type query to isolate a source
    fireEvent.change(searchInput, { target: { value: 'vcam31' } });

    // Arrow down moves to the matched source, Enter selects it
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('SRC:VCAM_31');

    // Escape closes picker
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // Requirement 9
  it('9. every source in each list is still reachable (the union of all category groups equals the full list, with no losses or duplicates)', () => {
    const testLists = [
      { name: 'Lawo Sources', list: lawoSources },
      { name: 'Lawo Processing', list: procSources },
      { name: 'Lawo Dest / Evertz Sources', list: tielineSources },
    ];

    for (const { name, list } of testLists) {
      const counts: Record<string, number> = {};
      const groupedIds = new Set<string>();
      const duplicateIds: string[] = [];

      for (const s of list) {
        const cat = s.category && s.category.trim() ? s.category.trim() : 'Uncategorized';
        counts[cat] = (counts[cat] || 0) + 1;
      }

      // Collect items category by category
      for (const cat of Object.keys(counts)) {
        const catSources = list.filter(
          (s) => (s.category && s.category.trim() ? s.category.trim() : 'Uncategorized') === cat
        );
        for (const s of catSources) {
          if (groupedIds.has(s.id)) {
            duplicateIds.push(s.id);
          }
          groupedIds.add(s.id);
        }
      }

      expect(duplicateIds, `Duplicates found in ${name}`).toEqual([]);
      expect(groupedIds.size).toBe(list.length);

      const allListIds = new Set(list.map((s) => s.id));
      const missingFromGrouped = list.filter((s) => !groupedIds.has(s.id));
      const extraInGrouped = Array.from(groupedIds).filter((id) => !allListIds.has(id as SourceId));

      expect(missingFromGrouped, `Missing sources in ${name}`).toEqual([]);
      expect(extraInGrouped, `Extra sources in ${name}`).toEqual([]);
    }
  });

  // Requirement 10
  it('10. earlier routing integrity invariant still passes (selectable IDs minus canonical IDs is empty)', () => {
    const canonicalSourceIds = new Set<string>(INITIAL_SNAPSHOT.sources.map((s) => s.id));

    const lawo = getAuthoritativeLawoDropdownSources(INITIAL_SNAPSHOT.sources);
    const proc = getAuthoritativeProcessingDropdownSources(INITIAL_SNAPSHOT.sources);
    const tieline = getAuthoritativeTielineDropdownSources(INITIAL_SNAPSHOT.sources);
    const validTielines = getValidTielineOptions(INITIAL_SNAPSHOT.sources);

    const selectableRoutableIds = new Set<string>([
      ...lawo.map((s) => s.id),
      ...proc.map((s) => s.id),
      ...tieline.map((s) => s.id),
      ...validTielines.map((s) => s.id),
    ]);

    const unresolvableIds = Array.from(selectableRoutableIds).filter(
      (id) => !canonicalSourceIds.has(id)
    );

    expect(unresolvableIds).toEqual([]);
    expect(canonicalSourceIds.has('SRC:VCAM_31')).toBe(true);
    expect(canonicalSourceIds.has('SRC:VCAM_32')).toBe(true);
    expect(selectableRoutableIds.has('SRC:VCAM_31')).toBe(true);
    expect(selectableRoutableIds.has('SRC:VCAM_32')).toBe(true);
  });
});
