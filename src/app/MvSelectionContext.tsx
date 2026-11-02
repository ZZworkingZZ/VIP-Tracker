import React, { useCallback, useMemo, useState } from 'react';
import { MultiviewId, isMultiviewId } from '../domain/identifiers';
import { MvSelectionContext } from './mvSelection';

export const MvSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastSpecificMv, setLastSpecificMvState] = useState<MultiviewId | null>(null);

  const setLastSpecificMv = useCallback((mvId: MultiviewId) => {
    if (isMultiviewId(mvId)) setLastSpecificMvState(mvId);
  }, []);

  const value = useMemo(
    () => ({ lastSpecificMv, setLastSpecificMv }),
    [lastSpecificMv, setLastSpecificMv]
  );

  return <MvSelectionContext.Provider value={value}>{children}</MvSelectionContext.Provider>;
};
