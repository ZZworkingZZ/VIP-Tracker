import { MultiviewId } from './identifiers';

export interface MultiviewConfig {
  id: MultiviewId;
  displayName: string;
  destinationCapacity: number;
  outputCapacity: number;
}

/**
 * Authoritative, verified multiview capacities.
 * MV-01: 36 destinations, 4 outputs
 * MV-02: 36 destinations, 4 outputs
 * MV-03: 64 destinations, 8 outputs
 * MV-04: 64 destinations, 8 outputs
 * MV-05: 64 destinations, 8 outputs
 *
 * Totals: 5 multiviews, 32 outputs, 264 destinations.
 */
export const VERIFIED_MULTIVIEWS: readonly MultiviewConfig[] = [
  {
    id: 'MV-01',
    displayName: 'Multiview 01 (MV-01)',
    destinationCapacity: 36,
    outputCapacity: 4,
  },
  {
    id: 'MV-02',
    displayName: 'Multiview 02 (MV-02)',
    destinationCapacity: 36,
    outputCapacity: 4,
  },
  {
    id: 'MV-03',
    displayName: 'Multiview 03 (MV-03)',
    destinationCapacity: 64,
    outputCapacity: 8,
  },
  {
    id: 'MV-04',
    displayName: 'Multiview 04 (MV-04)',
    destinationCapacity: 64,
    outputCapacity: 8,
  },
  {
    id: 'MV-05',
    displayName: 'Multiview 05 (MV-05)',
    destinationCapacity: 64,
    outputCapacity: 8,
  },
] as const;

export const TOTAL_EXPECTED_MULTIVIEWS = 5;
export const TOTAL_EXPECTED_OUTPUTS = 32;
export const TOTAL_EXPECTED_DESTINATIONS = 264;
