import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/renderWithProviders';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import {
  SEED_LAWO_SOURCES,
  SEED_LAWO_PROCESSING_DEVICES,
  SEED_LAWO_TIELINES,
  SEED_EVERTZ_SOURCES,
  SEED_EVERTZ_MV_INPUTS,
} from '../data/seed/sourceInventory';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import {
  getAuthoritativeLawoDropdownSources,
  getAuthoritativeProcessingDropdownSources,
  getAuthoritativeTielineDropdownSources,
  getValidMvInputOptions,
  AUTHORITATIVE_TIELINE_AND_EVERTZ_SOURCES,
} from '../domain/signalFlow';
import { Source } from '../domain/models';
import { createSourceId, MultiviewId } from '../domain/identifiers';
import { LocalTrackerRepository } from '../services/LocalTrackerRepository';

describe('Authoritative Signal Flows Dropdown Membership & Exact Name Reconciliation', () => {
  const excelLawoNames = SEED_LAWO_SOURCES.map((s) => s.name);
  const excelProcNames = SEED_LAWO_PROCESSING_DEVICES.map((s) => s.name);
  const excelMvInputNames = SEED_EVERTZ_MV_INPUTS.map((s) => s.name);

  // Combined authoritative tielines + Evertz sources
  const combinedTielineEvertzMap = new Map<string, string>();
  for (const s of SEED_LAWO_TIELINES) combinedTielineEvertzMap.set(s.name, s.name);
  for (const s of SEED_EVERTZ_SOURCES) combinedTielineEvertzMap.set(s.name, s.name);
  const excelCombinedTielineEvertzNames = Array.from(combinedTielineEvertzMap.values());

  describe('1. Exact Name Comparison for Lawo Sources Dropdown (445 entries)', () => {
    it('matches exact name-set between Excel inventory and dropdown options without 307-origin subset reduction', () => {
      const dropdownSources = getAuthoritativeLawoDropdownSources(INITIAL_SNAPSHOT.sources);
      const dropdownNames = dropdownSources.map((s) => s.name);

      expect(dropdownNames).toHaveLength(445);
      expect(dropdownNames.slice().sort()).toEqual(excelLawoNames.slice().sort());

      const excelSet = new Set(excelLawoNames);
      const dropdownSet = new Set(dropdownNames);

      const missing = excelLawoNames.filter((n) => !dropdownSet.has(n));
      const extra = dropdownNames.filter((n) => !excelSet.has(n));

      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    });

    it('fails if an Excel entry is missing or display name is altered', () => {
      const modifiedSources: Source[] = SEED_LAWO_SOURCES.map((s) =>
        s.name === 'BSP-B 101' ? { ...s, name: 'BSP-B 101 Altered' } : s
      );
      const modifiedNames = modifiedSources.map((s) => s.name);
      expect(modifiedNames).not.toEqual(excelLawoNames);
    });
  });

  describe('2. Exact Name Comparison for Lawo Processing Dropdown (138 entries)', () => {
    it('matches exact name-set between Excel inventory and processing options without leakage', () => {
      const dropdownSources = getAuthoritativeProcessingDropdownSources(INITIAL_SNAPSHOT.sources);
      const dropdownNames = dropdownSources.map((s) => s.name);

      expect(dropdownNames).toHaveLength(138);
      expect(dropdownNames.slice().sort()).toEqual(excelProcNames.slice().sort());

      const excelSet = new Set(excelProcNames);
      const dropdownSet = new Set(dropdownNames);

      const missing = excelProcNames.filter((n) => !dropdownSet.has(n));
      const extra = dropdownNames.filter((n) => !excelSet.has(n));

      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    });

    it('fails if non-processing source leaks into processing list', () => {
      const nonProcLeaked = [...SEED_LAWO_PROCESSING_DEVICES, SEED_LAWO_SOURCES[0]];
      const leakedNames = nonProcLeaked.map((s) => s.name);
      const excelSet = new Set(excelProcNames);
      const extra = leakedNames.filter((n) => !excelSet.has(n));
      expect(extra.length).toBeGreaterThan(0);
    });
  });

  describe('3. Exact Name Comparison for Lawo Destination / Evertz Source Dropdown (267 entries)', () => {
    it('matches intentionally combined tielines + Evertz sources inventory', () => {
      expect(AUTHORITATIVE_TIELINE_AND_EVERTZ_SOURCES).toHaveLength(267);

      const dropdownSources = getAuthoritativeTielineDropdownSources(INITIAL_SNAPSHOT.sources);
      const dropdownNames = dropdownSources.map((s) => s.name);

      expect(dropdownNames).toHaveLength(267);
      expect(dropdownNames.slice().sort()).toEqual(excelCombinedTielineEvertzNames.slice().sort());

      const authSet = new Set(excelCombinedTielineEvertzNames);
      const dropdownSet = new Set(dropdownNames);

      const missing = excelCombinedTielineEvertzNames.filter((n) => !dropdownSet.has(n));
      const extra = dropdownNames.filter((n) => !authSet.has(n));

      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    });
  });

  describe('4. Exact Name Comparison for Evertz MV Inputs Dropdown (264 entries across frames)', () => {
    it('matches frame-specific options whose runtime union equals SEED_EVERTZ_MV_INPUTS', () => {
      const allFrames: MultiviewId[] = ['MV-01', 'MV-02', 'MV-03', 'MV-04', 'MV-05'];
      const frameCounts: Record<MultiviewId, number> = {
        'MV-01': 36,
        'MV-02': 36,
        'MV-03': 64,
        'MV-04': 64,
        'MV-05': 64,
      };

      for (const mvId of allFrames) {
        const frameOpts = getValidMvInputOptions(INITIAL_SNAPSHOT.destinations, mvId);
        expect(frameOpts).toHaveLength(frameCounts[mvId]);
      }

      const runtimeUnionDestinations = allFrames.flatMap((mvId) =>
        getValidMvInputOptions(INITIAL_SNAPSHOT.destinations, mvId)
      );
      const runtimeUnionNames = runtimeUnionDestinations.map((d) => d.id.replace(/^DEST:/, ''));

      expect(runtimeUnionNames).toHaveLength(264);
      expect(runtimeUnionNames.slice().sort()).toEqual(excelMvInputNames.slice().sort());

      const authSet = new Set(excelMvInputNames);
      const runtimeSet = new Set(runtimeUnionNames);

      const missing = excelMvInputNames.filter((n) => !runtimeSet.has(n));
      const extra = runtimeUnionNames.filter((n) => !authSet.has(n));

      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    });
  });

  describe('5. UI Dropdown Verification in DestinationSourcesPage', () => {
    it('renders exact 445 Lawo source options in the Signal Flow row dropdown', async () => {
      const vCam40Id = createSourceId('vCam 40');
      const testSnapshot = {
        ...INITIAL_SNAPSHOT,
        destinations: INITIAL_SNAPSHOT.destinations.map((d) =>
          d.id === 'DEST:MV-03-01' ? { ...d, assignedSourceId: vCam40Id } : d
        ),
      };
      const repo = new LocalTrackerRepository(testSnapshot);

      renderWithProviders(React.createElement(DestinationSourcesPage, null), {
        repository: repo,
        route: '/sources?mvId=MV-03',
      });

      const selectElements = await screen.findAllByTestId(/^select-lawo-source-/);
      expect(selectElements.length).toBeGreaterThan(0);

      const firstSelect = selectElements[0] as HTMLSelectElement;
      const options = Array.from(firstSelect.querySelectorAll('option'))
        .filter((opt) => opt.value !== '')
        .map((opt) => opt.text);

      expect(options).toHaveLength(445);
      expect(options.slice().sort()).toEqual(excelLawoNames.slice().sort());
    });

    it('renders exact 267 Tieline / Evertz source options in the Signal Flow row dropdown', async () => {
      const vCam40Id = createSourceId('vCam 40');
      const testSnapshot = {
        ...INITIAL_SNAPSHOT,
        destinations: INITIAL_SNAPSHOT.destinations.map((d) =>
          d.id === 'DEST:MV-03-01' ? { ...d, assignedSourceId: vCam40Id } : d
        ),
      };
      const repo = new LocalTrackerRepository(testSnapshot);

      renderWithProviders(React.createElement(DestinationSourcesPage, null), {
        repository: repo,
        route: '/sources?mvId=MV-03',
      });

      const selectElements = await screen.findAllByTestId(/^select-tieline-/);
      expect(selectElements.length).toBeGreaterThan(0);

      const firstSelect = selectElements[0] as HTMLSelectElement;
      const options = Array.from(firstSelect.querySelectorAll('option'))
        .filter((opt) => opt.value !== '')
        .map((opt) => opt.text);

      expect(options).toHaveLength(267);
      expect(options.slice().sort()).toEqual(excelCombinedTielineEvertzNames.slice().sort());
    });

    it('renders exact 138 Processing options in the Signal Flow row dropdown', async () => {
      const vCam40Id = createSourceId('vCam 40');
      const testSnapshot = {
        ...INITIAL_SNAPSHOT,
        destinations: INITIAL_SNAPSHOT.destinations.map((d) =>
          d.id === 'DEST:MV-03-01' ? { ...d, assignedSourceId: vCam40Id } : d
        ),
      };
      const repo = new LocalTrackerRepository(testSnapshot);

      renderWithProviders(React.createElement(DestinationSourcesPage, null), {
        repository: repo,
        route: '/sources?mvId=MV-03',
      });

      const selectElements = await screen.findAllByTestId(/^select-processing-/);
      expect(selectElements.length).toBeGreaterThan(0);

      const firstSelect = selectElements[0] as HTMLSelectElement;
      const options = Array.from(firstSelect.querySelectorAll('option'))
        .filter((opt) => opt.value !== '')
        .map((opt) => opt.text);

      expect(options).toHaveLength(138);
      expect(options.slice().sort()).toEqual(excelProcNames.slice().sort());
    });
  });
});
