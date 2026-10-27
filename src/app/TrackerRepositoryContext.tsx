import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { GitHubTrackerRepositoryError } from '../services/githubErrors';

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
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConflict, setIsConflict] = useState<boolean>(false);
  const [isNewerSharedDataAvailable, setIsNewerSharedDataAvailable] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const error = saveError ?? loadError;

  const clearSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  const isEditModeRef = useRef<boolean>(isEditMode);
  useEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  const isSavingRef = useRef<boolean>(isSaving);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  const isCheckInProgressRef = useRef<boolean>(false);
  const syncGenerationRef = useRef<number>(0);

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
      setLoadError(null);
      const data = repository.refreshSnapshot
        ? await repository.refreshSnapshot()
        : await repository.getSnapshot();
      setSnapshot(data);
      syncGenerationRef.current++;
      if (repository.getLastLoadedSha) {
        setLastLoadedSha(repository.getLastLoadedSha());
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load VIP Tracker snapshot.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  const reloadLatestSharedData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setSaveError(null);
      setIsConflict(false);
      setIsNewerSharedDataAvailable(false);
      setDraftSnapshot(null);
      setIsEditMode(false);
      const data = repository.refreshSnapshot
        ? await repository.refreshSnapshot()
        : await repository.getSnapshot();
      setSnapshot(data);
      syncGenerationRef.current++;
      if (repository.getLastLoadedSha) {
        setLastLoadedSha(repository.getLastLoadedSha());
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to reload latest shared VIP Tracker data.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Periodic background synchronization for shared repository (Phase 4A)
  useEffect(() => {
    if (typeof repository.checkForRemoteUpdate !== 'function') {
      return;
    }

    let isCancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const performSyncCheck = async () => {
      if (isCancelled) return;
      if (isSavingRef.current) return;
      if (isCheckInProgressRef.current) return;

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      const checkGeneration = syncGenerationRef.current;

      try {
        isCheckInProgressRef.current = true;
        const result = await repository.checkForRemoteUpdate!();
        if (isCancelled) return;

        // Freshness guard: If a save, reload, or newer sync completed while check was in flight, discard result
        if (syncGenerationRef.current !== checkGeneration) {
          return;
        }

        if (result.hasUpdate) {
          if (isEditModeRef.current) {
            // Edit mode safety: preserve user draft, do not replace state or update lastLoadedSha
            setIsNewerSharedDataAvailable(true);
          } else if (!isSavingRef.current) {
            if (repository.applyLoadedSnapshot) {
              repository.applyLoadedSnapshot(result.snapshot, result.sha);
            }
            syncGenerationRef.current++;
            setSnapshot(result.snapshot);
            setLastLoadedSha(result.sha);
            setIsNewerSharedDataAvailable(false);
          }
        }
      } catch (err) {
        console.warn('Automatic background synchronization check failed:', err);
      } finally {
        isCheckInProgressRef.current = false;
      }
    };

    const scheduleNext = () => {
      if (isCancelled) return;
      timerId = setTimeout(async () => {
        await performSyncCheck();
        scheduleNext();
      }, 5000);
    };

    scheduleNext();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void performSyncCheck();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilityOrFocus);
    }

    return () => {
      isCancelled = true;
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilityOrFocus);
      }
    };
  }, [repository]);

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
    if (isNewerSharedDataAvailable) {
      setIsNewerSharedDataAvailable(false);
      void fetchSnapshot();
    }
  }, [isNewerSharedDataAvailable, fetchSnapshot]);

  // Update a single output in draft state
  const updateDraftOutput = useCallback(
    (output: MultiviewOutput) => {
      setDraftSnapshot((prev) => {
        const current = prev ? prev : snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
        if (!current) return null;

        const nextOutputs = current.outputs.map((o: MultiviewOutput) =>
          o.id === output.id ? output : o
        );

        // Operational/production assignment names are reusable across multiple MultiviewOutputs.
        // Label reuse across outputs must never create duplicate OperationalAssignment entities.
        const nextAssignments = [...(current.operationalAssignments ?? [])];
        if (output.assignmentName && output.assignmentName.trim()) {
          const trimmed = output.assignmentName.trim();
          const targetId = createAssignmentId(trimmed);
          const normalized = trimmed.toUpperCase();
          const alreadyExists = nextAssignments.some(
            (a) => a.id === targetId || a.rawName.trim().toUpperCase() === normalized
          );
          if (!alreadyExists) {
            nextAssignments.push({
              id: targetId,
              rawName: trimmed,
              displayName: trimmed,
              active: true,
            });
          }
        }

        // Canonical deduplication of operational assignments by ID
        const seenAssignmentIds = new Set<string>();
        const deduplicatedAssignments: import('../domain/models').OperationalAssignment[] = [];
        for (const a of nextAssignments) {
          if (a && a.id && !seenAssignmentIds.has(a.id)) {
            seenAssignmentIds.add(a.id);
            deduplicatedAssignments.push(a);
          }
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
          operationalAssignments: deduplicatedAssignments,
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
      setSaveError('VIP Tracker is in read-only shared mode. Edits cannot be saved.');
      return;
    }
    if (isSaving) {
      return;
    }
    if (!snapshot || !draftSnapshot) return;

    try {
      setIsSaving(true);
      setSaveError(null);

      const changeSet = createChangeSet(snapshot, draftSnapshot);
      const updated = await repository.saveSnapshot(draftSnapshot, changeSet, currentOperator);

      // Invariant: Never clear an operator draft until remote save has successfully completed.
      setSnapshot(updated);
      syncGenerationRef.current++;
      if (repository.getLastLoadedSha) {
        setLastLoadedSha(repository.getLastLoadedSha());
      }
      setDraftSnapshot(null);
      setIsEditMode(false);
      setIsConflict(false);
      setIsNewerSharedDataAvailable(false);
      setSaveError(null);
    } catch (err) {
      // Invariant: On any failed save (validation, network, auth, HTTP, conflict, unexpected error),
      // preserve draftSnapshot byte-for-byte and remain in edit mode.
      if (
        (err instanceof GitHubTrackerRepositoryError && err.code === 'REVISION_CONFLICT') ||
        (err instanceof Error &&
          (err.message.toLowerCase().includes('revision conflict') ||
            err.message.toLowerCase().includes('conflict')))
      ) {
        setIsConflict(true);
        setSaveError(
          'Shared data changed after you began editing. Your changes have not been saved.'
        );
      } else {
        setSaveError(err instanceof Error ? err.message : 'Failed to save changes.');
      }
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [isReadOnly, isSaving, repository, snapshot, draftSnapshot, currentOperator]);

  // Reset local data back to baseline repository seed
  const resetToBaseline = useCallback(async () => {
    if (isReadOnly) {
      setSaveError('VIP Tracker is in read-only shared mode. Resetting baseline is not supported.');
      return;
    }
    try {
      setIsLoading(true);
      setSaveError(null);
      const baseline = await repository.resetToBaseline();
      setSnapshot(baseline);
      setDraftSnapshot(null);
      setIsEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to reset local data.');
    } finally {
      setIsLoading(false);
    }
  }, [isReadOnly, repository]);

  // Save a custom layout definition
  const saveCustomLayout = useCallback(
    async (layout: import('../domain/layoutDefinitions').LayoutDefinition) => {
      if (isReadOnly) {
        setSaveError('VIP Tracker is in read-only shared mode. Custom layouts cannot be saved.');
        return;
      }
      try {
        setIsLoading(true);
        setSaveError(null);
        if (repository.saveCustomLayout) {
          const updated = await repository.saveCustomLayout(layout);
          setSnapshot(updated);
          if (repository.getLastLoadedSha) {
            setLastLoadedSha(repository.getLastLoadedSha());
          }
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
        setSaveError(err instanceof Error ? err.message : 'Failed to save custom layout.');
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
        setSaveError('VIP Tracker is in read-only shared mode. Custom layouts cannot be deleted.');
        return;
      }
      try {
        setIsLoading(true);
        setSaveError(null);
        if (repository.deleteCustomLayout) {
          const updated = await repository.deleteCustomLayout(layoutId);
          setSnapshot(updated);
          if (repository.getLastLoadedSha) {
            setLastLoadedSha(repository.getLastLoadedSha());
          }
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
        setSaveError(err instanceof Error ? err.message : 'Failed to delete custom layout.');
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
      isSaving,
      isConflict,
      isNewerSharedDataAvailable,
      error,
      loadError,
      saveError,
      clearSaveError,
      isReadOnly,
      lastLoadedSha,
      refresh: fetchSnapshot,
      reloadLatestSharedData,
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
      isSaving,
      isConflict,
      isNewerSharedDataAvailable,
      error,
      loadError,
      saveError,
      clearSaveError,
      isReadOnly,
      lastLoadedSha,
      fetchSnapshot,
      reloadLatestSharedData,
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
