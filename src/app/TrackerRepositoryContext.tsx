import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { TrackerRepository } from '../services/TrackerRepository';
import { createDefaultTrackerRepository } from '../services/repositoryConfig';
import { TrackerSnapshot, MultiviewOutput, Source } from '../domain/models';
import {
  MultiviewId,
  SourceId,
  OutputId,
  DestinationId,
  PipId,
  createAssignmentId,
} from '../domain/identifiers';
import { TrackerRepositoryContext } from './context';
import { diffSnapshots, createChangeSet } from '../domain/diff';
import { validateSnapshot } from '../domain/validation';
import { assignPipInput, movePipInput } from '../domain/pipRouting';
import { getLayoutDefinition } from '../domain/layoutDefinitions';
import { Operator, createOperator } from '../domain/operator';
import { isRosterOperatorId } from '../domain/operatorRoster';
import { OperatorStorage, defaultOperatorStorage } from '../services/operatorStorage';

export interface TrackerRepositoryProviderProps {
  repository?: TrackerRepository;
  operatorStorage?: OperatorStorage;
  children: React.ReactNode;
}

export const TrackerRepositoryProvider: React.FC<TrackerRepositoryProviderProps> = ({
  repository: explicitRepository,
  operatorStorage = defaultOperatorStorage,
  children,
}) => {
  const repository = useMemo(
    () => explicitRepository ?? createDefaultTrackerRepository(),
    [explicitRepository]
  );
  const isReadOnly = Boolean(repository.isReadOnly);
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<TrackerSnapshot | null>(null);
  const [lastLoadedSha, setLastLoadedSha] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Trust-based Operator Identity State
  const [currentOperator, setCurrentOperator] = useState<Operator | null>(() =>
    operatorStorage.loadOperator()
  );
  const [recentOperators, setRecentOperators] = useState<Operator[]>(() =>
    operatorStorage.loadRecentOperators()
  );
  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState<boolean>(
    () => !operatorStorage.loadOperator()
  );

  const setOperator = useCallback(
    (op: Operator) => {
      operatorStorage.saveOperator(op);
      setCurrentOperator(op);
      setRecentOperators(operatorStorage.loadRecentOperators());
      setIsOperatorModalOpen(false);
    },
    [operatorStorage]
  );

  const setOperatorByName = useCallback(
    (name: string) => {
      const op = createOperator(name);
      setOperator(op);
      return op;
    },
    [setOperator]
  );

  const clearOperator = useCallback(() => {
    operatorStorage.clearOperator();
    setCurrentOperator(null);
    setRecentOperators(operatorStorage.loadRecentOperators());
  }, [operatorStorage]);

  const openOperatorModal = useCallback(() => {
    setIsOperatorModalOpen(true);
  }, []);

  const closeOperatorModal = useCallback(() => {
    // Only allow closing if a valid roster operator has been chosen
    if (currentOperator && isRosterOperatorId(currentOperator.id)) {
      setIsOperatorModalOpen(false);
    }
  }, [currentOperator]);

  const fetchSnapshot = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await repository.getSnapshot();
      setSnapshot(data);
      if (repository.getLastLoadedSha) {
        setLastLoadedSha(repository.getLastLoadedSha());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load VIP Tracker snapshot.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Compute staged differences
  const stagedChanges = useMemo(() => {
    if (!isEditMode || !draftSnapshot || !snapshot) {
      return [];
    }
    return diffSnapshots(snapshot, draftSnapshot);
  }, [isEditMode, draftSnapshot, snapshot]);

  const hasUnsavedChanges = stagedChanges.length > 0;

  // Browser unsaved-change protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Enter Edit Mode (blocked if underlying repository is read-only)
  const enterEditMode = useCallback(() => {
    if (isReadOnly) return;
    if (!snapshot) return;
    if (!draftSnapshot) {
      setDraftSnapshot(JSON.parse(JSON.stringify(snapshot)));
    }
    setIsEditMode(true);
  }, [isReadOnly, snapshot, draftSnapshot]);

  // Exit Edit Mode without necessarily discarding draft
  const exitEditMode = useCallback(() => {
    if (hasUnsavedChanges) {
      // Keep edit mode if unsaved changes exist unless explicitly discarded
      return;
    }
    setIsEditMode(false);
    setDraftSnapshot(null);
  }, [hasUnsavedChanges]);

  // Discard all changes
  const discardChanges = useCallback(() => {
    setDraftSnapshot(null);
    setIsEditMode(false);
  }, []);

  // Update a single output in draft state
  const updateDraftOutput = useCallback(
    (output: MultiviewOutput) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const nextOutputs = current.outputs.map((o: MultiviewOutput) =>
          o.id === output.id ? output : o
        );

        // If assignment name changed and is not in operational assignments, track it
        const nextAssignments = [...current.operationalAssignments];
        if (
          output.assignmentName &&
          !nextAssignments.some((a) => a.rawName === output.assignmentName)
        ) {
          nextAssignments.push({
            id: createAssignmentId(output.assignmentName),
            rawName: output.assignmentName,
            displayName: output.assignmentName,
            active: true,
          });
        }

        const findings = validateSnapshot(
          current.multiviews,
          nextOutputs,
          current.destinations,
          current.sources
        );

        return {
          ...current,
          outputs: nextOutputs,
          operationalAssignments: nextAssignments,
          validationFindings: findings,
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Assign an MV Input to a specific PIP on an output in draft state
  const assignDraftPipInput = useCallback(
    (outputId: OutputId, pipId: PipId, destinationId: DestinationId | null) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const nextOutputs = current.outputs.map((o: MultiviewOutput) => {
          if (o.id === outputId) {
            const layout = getLayoutDefinition(o.layoutName, current.customLayouts);
            return assignPipInput(o, pipId, destinationId, layout);
          }
          return o;
        });

        const findings = validateSnapshot(
          current.multiviews,
          nextOutputs,
          current.destinations,
          current.sources
        );

        return {
          ...current,
          outputs: nextOutputs,
          validationFindings: findings,
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Clear an MV Input from a PIP on an output in draft state
  const clearDraftPipInput = useCallback(
    (outputId: OutputId, pipId: PipId) => {
      assignDraftPipInput(outputId, pipId, null);
    },
    [assignDraftPipInput]
  );

  // Move an MV Input from one PIP to another on an output in draft state
  const moveDraftPipInput = useCallback(
    (outputId: OutputId, fromPipId: PipId, toPipId: PipId) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const nextOutputs = current.outputs.map((o: MultiviewOutput) => {
          if (o.id === outputId) {
            const layout = getLayoutDefinition(o.layoutName, current.customLayouts);
            return movePipInput(o, fromPipId, toPipId, layout);
          }
          return o;
        });

        const findings = validateSnapshot(
          current.multiviews,
          nextOutputs,
          current.destinations,
          current.sources
        );

        return {
          ...current,
          outputs: nextOutputs,
          validationFindings: findings,
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Update a single destination's assigned source in draft state
  const updateDraftDestination = useCallback(
    (multiviewId: MultiviewId, destinationNumber: number, sourceId: SourceId | null) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const nextDests = current.destinations.map((d: import('../domain/models').Destination) => {
          if (d.multiviewId === multiviewId && d.destinationNumber === destinationNumber) {
            return {
              ...d,
              assignedSourceId: sourceId,
            };
          }
          return d;
        });

        const findings = validateSnapshot(
          current.multiviews,
          current.outputs,
          nextDests,
          current.sources
        );

        return {
          ...current,
          destinations: nextDests,
          validationFindings: findings,
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Update multiple destinations in one batch
  const updateDraftDestinationsBatch = useCallback(
    (
      updates: { multiviewId: MultiviewId; destinationNumber: number; sourceId: SourceId | null }[]
    ) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const updateMap = new Map<string, SourceId | null>();
        for (const u of updates) {
          updateMap.set(`${u.multiviewId}:${u.destinationNumber}`, u.sourceId);
        }

        const nextDests = current.destinations.map((d: import('../domain/models').Destination) => {
          const key = `${d.multiviewId}:${d.destinationNumber}`;
          if (updateMap.has(key)) {
            return {
              ...d,
              assignedSourceId: updateMap.get(key)!,
            };
          }
          return d;
        });

        const findings = validateSnapshot(
          current.multiviews,
          current.outputs,
          nextDests,
          current.sources
        );

        return {
          ...current,
          destinations: nextDests,
          validationFindings: findings,
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Add a newly cataloged source to draft directory
  const addDraftSource = useCallback(
    (source: Source) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        if (current.sources.some((s: Source) => s.id === source.id)) {
          return current;
        }

        return {
          ...current,
          sources: [...current.sources, source],
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Update a single source's upstream source in draft state
  const updateDraftSourceUpstream = useCallback(
    (sourceId: SourceId, upstreamSourceId: SourceId | null) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const nextSources = current.sources.map((s: Source) => {
          if (s.id === sourceId) {
            return {
              ...s,
              upstreamSourceId,
            };
          }
          return s;
        });

        const findings = validateSnapshot(
          current.multiviews,
          current.outputs,
          current.destinations,
          nextSources
        );

        return {
          ...current,
          sources: nextSources,
          validationFindings: findings,
        };
      });
      setIsEditMode(true);
    },
    [snapshot]
  );

  // Save all staged changes to repository with active operator attribution
  const saveDraftChanges = useCallback(async () => {
    if (isReadOnly) {
      setError('VIP Tracker is in read-only shared mode. Edits cannot be saved.');
      return;
    }
    if (!snapshot || !draftSnapshot) return;

    try {
      setIsLoading(true);
      setError(null);

      const changeSet = createChangeSet(snapshot, draftSnapshot);
      const updated = await repository.saveSnapshot(draftSnapshot, changeSet, currentOperator);

      setSnapshot(updated);
      setDraftSnapshot(null);
      setIsEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsLoading(false);
    }
  }, [isReadOnly, repository, snapshot, draftSnapshot, currentOperator]);

  // Reset local data back to baseline repository seed
  const resetToBaseline = useCallback(async () => {
    if (isReadOnly) {
      setError('VIP Tracker is in read-only shared mode. Resetting baseline is not supported.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const baseline = await repository.resetToBaseline();
      setSnapshot(baseline);
      setDraftSnapshot(null);
      setIsEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset local data.');
    } finally {
      setIsLoading(false);
    }
  }, [isReadOnly, repository]);

  // Save a custom layout definition
  const saveCustomLayout = useCallback(
    async (layout: import('../domain/layoutDefinitions').LayoutDefinition) => {
      if (isReadOnly) {
        setError('VIP Tracker is in read-only shared mode. Custom layouts cannot be saved.');
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        if (repository.saveCustomLayout) {
          const updated = await repository.saveCustomLayout(layout);
          setSnapshot(updated);
          if (draftSnapshot) {
            setDraftSnapshot((prev) => {
              if (!prev) return null;
              const currentCustoms = [...(prev.customLayouts ?? [])];
              const idx = currentCustoms.findIndex(
                (l) => l.id === layout.id || l.name.toUpperCase() === layout.name.toUpperCase()
              );
              if (idx >= 0) {
                currentCustoms[idx] = layout;
              } else {
                currentCustoms.push(layout);
              }
              return {
                ...prev,
                customLayouts: currentCustoms,
              };
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save custom layout.');
      } finally {
        setIsLoading(false);
      }
    },
    [isReadOnly, repository, draftSnapshot]
  );

  // Delete a custom layout definition
  const deleteCustomLayout = useCallback(
    async (layoutId: string) => {
      if (isReadOnly) {
        setError('VIP Tracker is in read-only shared mode. Custom layouts cannot be deleted.');
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        if (repository.deleteCustomLayout) {
          const updated = await repository.deleteCustomLayout(layoutId);
          setSnapshot(updated);
          if (draftSnapshot) {
            setDraftSnapshot((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                customLayouts: (prev.customLayouts ?? []).filter((l) => l.id !== layoutId),
              };
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete custom layout.');
      } finally {
        setIsLoading(false);
      }
    },
    [isReadOnly, repository, draftSnapshot]
  );

  // The active snapshot being displayed: draftSnapshot if in edit mode, else canonical snapshot
  const activeSnapshot = useMemo(() => {
    if (isEditMode && draftSnapshot) {
      return draftSnapshot;
    }
    return snapshot;
  }, [isEditMode, draftSnapshot, snapshot]);

  const customLayouts = useMemo(() => {
    return activeSnapshot?.customLayouts ?? [];
  }, [activeSnapshot]);

  const value = useMemo(
    () => ({
      repository,
      snapshot,
      activeSnapshot,
      draftSnapshot,
      isEditMode,
      hasUnsavedChanges,
      stagedChanges,
      isLoading,
      error,
      isReadOnly,
      lastLoadedSha,
      refresh: fetchSnapshot,
      enterEditMode,
      exitEditMode,
      discardChanges,
      updateDraftOutput,
      assignDraftPipInput,
      clearDraftPipInput,
      moveDraftPipInput,
      updateDraftDestination,
      updateDraftDestinationsBatch,
      addDraftSource,
      updateDraftSourceUpstream,
      saveDraftChanges,
      resetToBaseline,
      saveCustomLayout,
      deleteCustomLayout,
      customLayouts,
      currentOperator,
      recentOperators,
      setOperator,
      setOperatorByName,
      clearOperator,
      isOperatorModalOpen,
      openOperatorModal,
      closeOperatorModal,
    }),
    [
      repository,
      snapshot,
      activeSnapshot,
      draftSnapshot,
      isEditMode,
      hasUnsavedChanges,
      stagedChanges,
      isLoading,
      error,
      isReadOnly,
      lastLoadedSha,
      fetchSnapshot,
      enterEditMode,
      exitEditMode,
      discardChanges,
      updateDraftOutput,
      assignDraftPipInput,
      clearDraftPipInput,
      moveDraftPipInput,
      updateDraftDestination,
      updateDraftDestinationsBatch,
      addDraftSource,
      updateDraftSourceUpstream,
      saveDraftChanges,
      resetToBaseline,
      saveCustomLayout,
      deleteCustomLayout,
      customLayouts,
      currentOperator,
      recentOperators,
      setOperator,
      setOperatorByName,
      clearOperator,
      isOperatorModalOpen,
      openOperatorModal,
      closeOperatorModal,
    ]
  );

  return (
    <TrackerRepositoryContext.Provider value={value}>{children}</TrackerRepositoryContext.Provider>
  );
};
