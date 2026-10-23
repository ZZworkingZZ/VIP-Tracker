import { MultiviewId } from './identifiers';

export interface MultiviewConfig {
  id: MultiviewId;
  displayName: string;
  inputCapacity: number;
  outputCapacity: number;
}

/**
 * Authoritative, verified multiview capacities.
 * MV-01: 36 inputs, 4 outputs
 * MV-02: 36 inputs, 4 outputs
 * MV-03: 64 inputs, 8 outputs
 * MV-04: 64 inputs, 8 outputs
 * MV-05: 64 inputs, 8 outputs
 *
 * Totals: 5 multiviews, 32 outputs, 264 destinations.
 */
export const VERIFIED_MULTIVIEWS: readonly MultiviewConfig[] = [
  {
    id: 'MV-01',
    displayName: 'Multiview 01 (MV-01)',
    inputCapacity: 36,
    outputCapacity: 4,
  },
  {
    id: 'MV-02',
    displayName: 'Multiview 02 (MV-02)',
    inputCapacity: 36,
    outputCapacity: 4,
  },
  {
    id: 'MV-03',
    displayName: 'Multiview 03 (MV-03)',
    inputCapacity: 64,
    outputCapacity: 8,
  },
  {
    id: 'MV-04',
    displayName: 'Multiview 04 (MV-04)',
    inputCapacity: 64,
    outputCapacity: 8,
  },
  {
    id: 'MV-05',
    displayName: 'Multiview 05 (MV-05)',
    inputCapacity: 64,
    outputCapacity: 8,
  },
] as const;

/**
 * Deterministically derives the operator-facing Input Range for a given multiview frame.
 * MV-01: MV-01-01 through MV-01-36
 * MV-02: MV-02-01 through MV-02-36
 * MV-03: MV-03-01 through MV-03-64
 * MV-04: MV-04-01 through MV-04-64
 * MV-05: MV-05-01 through MV-05-64
 *
 * Fails clearly if authoritative configuration is missing rather than inventing fallbacks.
 */
export function deriveInputRange(mvId: MultiviewId): string {
  const config = VERIFIED_MULTIVIEWS.find((mv) => mv.id === mvId);
  if (!config) {
    throw new Error(`Authoritative configuration missing for multiview: ${mvId}`);
  }
  const paddedCap = String(config.inputCapacity).padStart(2, '0');
  return `${mvId}-01 through ${mvId}-${paddedCap}`;
}

export const TOTAL_EXPECTED_MULTIVIEWS = 5;
export const TOTAL_EXPECTED_OUTPUTS = 32;
export const TOTAL_EXPECTED_DESTINATIONS = 264;
