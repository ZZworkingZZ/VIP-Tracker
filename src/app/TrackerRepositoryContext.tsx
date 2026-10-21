import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { TrackerRepository } from '../services/TrackerRepository';
import { defaultRepository } from '../services/LocalTrackerRepository';
import { TrackerSnapshot } from '../domain/models';
import { TrackerRepositoryContext } from './context';

export interface TrackerRepositoryProviderProps {
  repository?: TrackerRepository;
  children: React.ReactNode;
}

export const TrackerRepositoryProvider: React.FC<TrackerRepositoryProviderProps> = ({
  repository = defaultRepository,
  children,
}) => {
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await repository.getSnapshot();
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load VIP Tracker snapshot.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const value = useMemo(
    () => ({
      repository,
      snapshot,
      isLoading,
      error,
      refresh: fetchSnapshot,
    }),
    [repository, snapshot, isLoading, error, fetchSnapshot]
  );

  return (
    <TrackerRepositoryContext.Provider value={value}>{children}</TrackerRepositoryContext.Provider>
  );
};
