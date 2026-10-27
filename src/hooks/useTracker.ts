import { useContext } from 'react';
import { TrackerRepositoryContext, TrackerRepositoryContextValue } from '../app/context';
import { TrackerRepository } from '../services/TrackerRepository';

export function useTrackerRepository(): TrackerRepository {
  const context = useContext(TrackerRepositoryContext);
  if (!context) {
    throw new Error('useTrackerRepository must be used within a TrackerRepositoryProvider');
  }
  return context.repository;
}

export function useTrackerSnapshot(): TrackerRepositoryContextValue {
  const context = useContext(TrackerRepositoryContext);
  if (!context) {
    throw new Error('useTrackerSnapshot must be used within a TrackerRepositoryProvider');
  }
  return context;
}

export function useOperator() {
  const {
    currentOperator,
    recentOperators,
    setOperator,
    setOperatorByName,
    clearOperator,
    isOperatorModalOpen,
    openOperatorModal,
    closeOperatorModal,
  } = useTrackerSnapshot();

  return {
    currentOperator,
    recentOperators,
    setOperator,
    setOperatorByName,
    clearOperator,
    isOperatorModalOpen,
    openOperatorModal,
    closeOperatorModal,
  };
}
