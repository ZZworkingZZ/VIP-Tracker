import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { TrackerRepository } from '../services/TrackerRepository';
import { defaultRepository } from '../services/LocalTrackerRepository';
import { TrackerSnapshot, MultiviewOutput, Source } from '../domain/models';
import { MultiviewId, SourceId, createAssignmentId } from '../domain/identifiers';
import { TrackerRepositoryContext } from './context';
import { diffSnapshots, createChangeSet } from '../domain/diff';
import { validateSnapshot } from '../domain/validation';

export interface TrackerRepositoryProviderProps {
  repository?: TrackerRepository;
  children: React.ReactNode;
}

export const TrackerRepositoryProvider: React.FC<TrackerRepositoryProviderProps> = ({
  repository = defaultRepository,
  children,
}) => {
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<TrackerSnapshot | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
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

  // Enter Edit Mode
  const enterEditMode = useCallback(() => {
    if (!snapshot) return;
    if (!draftSnapshot) {
      setDraftSnapshot(JSON.parse(JSON.stringify(snapshot)));
    }
    setIsEditMode(true);
  }, [snapshot, draftSnapshot]);

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

  // Save all staged changes to repository
  const saveDraftChanges = useCallback(async () => {
    if (!snapshot || !draftSnapshot) return;

    try {
      setIsLoading(true);
      setError(null);

      const changeSet = createChangeSet(snapshot, draftSnapshot);
      const updated = await repository.saveSnapshot(draftSnapshot, changeSet);

      setSnapshot(updated);
      setDraftSnapshot(null);
      setIsEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIsLoading(false);
    }
  }, [repository, snapshot, draftSnapshot]);

  // Reset local data back to baseline repository seed
  const resetToBaseline = useCallback(async () => {
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
  }, [repository]);

  // The active snapshot being displayed: draftSnapshot if in edit mode, else canonical snapshot
  const activeSnapshot = useMemo(() => {
    if (isEditMode && draftSnapshot) {
      return draftSnapshot;
    }
    return snapshot;
  }, [isEditMode, draftSnapshot, snapshot]);

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
      refresh: fetchSnapshot,
      enterEditMode,
      exitEditMode,
      discardChanges,
      updateDraftOutput,
      updateDraftDestination,
      updateDraftDestinationsBatch,
      addDraftSource,
      saveDraftChanges,
      resetToBaseline,
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
      fetchSnapshot,
      enterEditMode,
      exitEditMode,
      discardChanges,
      updateDraftOutput,
      updateDraftDestination,
      updateDraftDestinationsBatch,
      addDraftSource,
      saveDraftChanges,
      resetToBaseline,
    ]
  );

  return (
    <TrackerRepositoryContext.Provider value={value}>{children}</TrackerRepositoryContext.Provider>
  );
};
