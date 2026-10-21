import { createContext } from 'react';
import { TrackerRepository } from '../services/TrackerRepository';
import { TrackerSnapshot } from '../domain/models';

export interface TrackerRepositoryContextValue {
  repository: TrackerRepository;
  snapshot: TrackerSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const TrackerRepositoryContext = createContext<TrackerRepositoryContextValue | undefined>(
  undefined
);
