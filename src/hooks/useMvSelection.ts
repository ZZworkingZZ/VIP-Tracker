import { useContext } from 'react';
import { MvSelectionContext, MvSelectionContextValue } from '../app/mvSelection';

/** Shared "last specific MV" used to carry the MV selection between Multiviewers and Signal Flows. */
export function useLastSpecificMv(): MvSelectionContextValue {
  return useContext(MvSelectionContext);
}
