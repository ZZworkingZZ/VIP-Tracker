import { describe, it, expect } from 'vitest';
import { INITIAL_SNAPSHOT } from '../data/seed/snapshot';
import { createSourceId, type SourceId } from '../domain/identifiers';
import type { Destination, Source } from '../domain/models';
import { getPickerType } from '../domain/pickerTypes';
import { getAuthoritativeTielineDropdownSources } from '../domain/signalFlow';
import {
  buildLegacySourceMigrationPlan,
  getTwdPrefixSwapKey,
  reconcilePersistedSources,
} from '../services/sourceReconciliation';

const NUMBERS_99 = Array.from({ length: 36 }, (_, i) => `99${String(i + 1).padStart(2, '0')}`);
const NUMBERS_88 = Array.from({ length: 36 }, (_, i) => `88${String(i + 1).padStart(2, '0')}`);

function legacySource(name: string): Source {
  return {
    id: createSourceId(name),
    name,
    normalizedName: name.toUpperCase(),
    category: 'Transmission',
    active: true,
    upstreamSourceId: null,
    sourceType: 'originating',
  };
}

const legacyName = (n: string) => (n.startsWith('99') ? `Tx TWD ${n}` : `Rx TWD ${n}`);
const canonicalName = (n: string) => (n.startsWith('99') ? `RX TWD ${n}` : `TX TWD ${n}`);
const seedByName = (name: string) => INITIAL_SNAPSHOT.sources.find((s) => s.name === name);

function dest(index: number, assigned: SourceId | null): Destination {
  return { ...INITIAL_SNAPSHOT.destinations[index], assignedSourceId: assigned };
}

describe('TWD Tx/Rx prefix-swap legacy migration', () => {
  const allNumbers = [...NUMBERS_99, ...NUMBERS_88];
  const legacy = allNumbers.map((n) => legacySource(legacyName(n)));
  const persisted = [...INITIAL_SNAPSHOT.sources, ...legacy];

  it('1 & 2. legacy Tx TWD 9901 and Rx TWD 8801 references migrate with assignment preserved', () => {
    const destinations = [
      dest(0, createSourceId('Tx TWD 9901')),
      dest(1, createSourceId('Rx TWD 8801')),
    ];
    const result = reconcilePersistedSources(persisted, INITIAL_SNAPSHOT.sources, { destinations });
    expect(destinations[0].assignedSourceId).toBe(seedByName('RX TWD 9901')!.id);
    expect(destinations[1].assignedSourceId).toBe(seedByName('TX TWD 8801')!.id);
    expect(result.some((s) => s.id === createSourceId('Tx TWD 9901'))).toBe(false);
    expect(result.some((s) => s.id === createSourceId('Rx TWD 8801'))).toBe(false);
  });

  it('3. all 72 mappings resolve one-to-one by 4-digit number', () => {
    const destinations = allNumbers.map((n, i) => dest(i, createSourceId(legacyName(n))));
    const { legacyToCanonicalMap, report } = buildLegacySourceMigrationPlan(
      persisted,
      INITIAL_SNAPSHOT.sources,
      destinations
    );
    expect(legacyToCanonicalMap.size).toBe(72);
    expect(report.ambiguousMappings).toHaveLength(0);
    expect(report.unmatchedRecords).toHaveLength(0);
    expect(new Set(legacyToCanonicalMap.values()).size).toBe(72);
    for (const n of allNumbers) {
      expect(legacyToCanonicalMap.get(createSourceId(legacyName(n)))).toBe(
        seedByName(canonicalName(n))!.id
      );
    }
  });

  it('4. duplicate-number legacy records are not auto-migrated', () => {
    const dup: Source = { ...legacySource('TX TWD 9901'), id: 'SRC:TX_TWD_9901_DUP' as SourceId };
    const destinations = [dest(0, createSourceId('Tx TWD 9901'))];
    const { legacyToCanonicalMap, report } = buildLegacySourceMigrationPlan(
      [...persisted, dup],
      INITIAL_SNAPSHOT.sources,
      destinations
    );
    expect(legacyToCanonicalMap.has(createSourceId('Tx TWD 9901'))).toBe(false);
    expect(report.ambiguousMappings.length).toBeGreaterThan(0);
  });

  it('4b. rule is bounded: out-of-range numbers and non-swapped prefixes are not covered', () => {
    expect(getTwdPrefixSwapKey('Tx TWD 9937')).toBeNull();
    expect(getTwdPrefixSwapKey('Tx TWD 8801')).toBeNull();
    expect(getTwdPrefixSwapKey('Rx TWD 9901')).toBeNull();
    expect(getTwdPrefixSwapKey('Tx TWD 9901')).not.toBeNull();
    expect(getTwdPrefixSwapKey('Rx TWD 8836')).not.toBeNull();
  });

  it('5 & 6. no canonical source is duplicated and persisted routes resolve after reconcile', () => {
    const destinations = allNumbers.map((n, i) => dest(i, createSourceId(legacyName(n))));
    const result = reconcilePersistedSources(persisted, INITIAL_SNAPSHOT.sources, { destinations });
    const ids = result.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const idSet = new Set(ids);
    for (const d of destinations) expect(idSet.has(d.assignedSourceId as SourceId)).toBe(true);
    // Idempotent on reload
    const again = reconcilePersistedSources(result, INITIAL_SNAPSHOT.sources, { destinations });
    expect(again.map((s) => s.id)).toEqual(ids);
  });

  it('8. the 72 TWD records appear under the JXS chip type in the Lawo Dest / Evertz Source picker', () => {
    const jxs = getAuthoritativeTielineDropdownSources(INITIAL_SNAPSHOT.sources).filter(
      (s) => getPickerType('tieline', s.id) === 'JXS'
    );
    const twdIds = allNumbers.map((n) => seedByName(canonicalName(n))!.id).sort();
    expect(jxs.map((s) => s.id).sort()).toEqual(twdIds);
  });
});
