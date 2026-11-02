import { createContext } from 'react';
import { MultiviewId } from '../domain/identifiers';

/**
 * UI-only, in-memory navigation state: the last specific multiview (MV-01..MV-05) the
 * operator selected in Multiviewers or Signal Flows. Aggregate selections ("All Displays",
 * "All VIPs") are never stored here. Not persisted and not part of the tracker snapshot.
 */
export interface MvSelectionContextValue {
  lastSpecificMv: MultiviewId | null;
  setLastSpecificMv: (mvId: MultiviewId) => void;
}

/** Default (no provider mounted): nothing remembered, writes are ignored. */
export const MvSelectionContext = createContext<MvSelectionContextValue>({
  lastSpecificMv: null,
  setLastSpecificMv: () => undefined,
});
