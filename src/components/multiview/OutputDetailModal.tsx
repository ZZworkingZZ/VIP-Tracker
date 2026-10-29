import React, { useState, useEffect, useMemo } from 'react';
import {
  MultiviewOutput,
  Destination,
  Source,
  getSourceAlias,
  formatSourceCompact,
} from '../../domain/models';
import { getLayoutDefinition, getLayoutPips } from '../../domain/layoutDefinitions';
import { LayoutRenderer, LayoutWindowData } from './LayoutRenderer';
import {
  formatOutputDisplay,
  formatInputDisplay,
  formatOutputLabel,
  PipId,
  DestinationId,
  OutputId,
} from '../../domain/identifiers';
import { useTrackerSnapshot } from '../../hooks/useTracker';
import { LayoutSelectorModal } from './LayoutSelectorModal';
import { SourceRoutingSelectorModal } from './SourceRoutingSelectorModal';
import { VERIFIED_MULTIVIEWS } from '../../domain/constants';
import { normalizeOutputPipAssignments, handleOutputLayoutChange } from '../../domain/pipRouting';
import { selectOutputLastChanged, formatLastChanged } from '../../domain/attribution';
import { decomposeTielineUpstream } from '../../domain/signalFlow';

export interface OutputDetailModalProps {
  readonly output: MultiviewOutput | null;
  readonly destinations?: readonly Destination[];
  readonly sources?: readonly Source[];
  readonly allOutputs?: readonly MultiviewOutput[];
  readonly initialSelectedPipId?: PipId | null;
  readonly onViewSignalFlow?: (outputId: OutputId, pipId: PipId) => void;
  readonly onClose: () => void;
  readonly onSelectOutput?: (output: MultiviewOutput) => void;
}

export const OutputDetailModal: React.FC<OutputDetailModalProps> = ({
  output: initialOutput,
  destinations: propDestinations,
  sources: propSources,
  allOutputs: propAllOutputs,
  initialSelectedPipId = null,
  onViewSignalFlow,
  onClose,
  onSelectOutput,
}) => {
  const {
    snapshot,
    activeSnapshot,
    isEditMode,
    isReadOnly,
    hasUnsavedChanges,
    enterEditMode,
    updateDraftOutput,
    assignDraftPipInput,
    clearDraftPipInput,
    moveDraftPipInput,
    updateDraftDestination,
    updateDraftDestinationsBatch,
    addDraftSource,
    customLayouts,
  } = useTrackerSnapshot();

  const [isLayoutSelectorOpen, setIsLayoutSelectorOpen] = useState(false);
  const [selectedPipId, setSelectedPipId] = useState<PipId | null>(initialSelectedPipId);
  const [draggingDestId, setDraggingDestId] = useState<DestinationId | null>(null);
  const [inputPaletteFilter, setInputPaletteFilter] = useState<'ALL' | 'AVAILABLE' | 'ASSIGNED'>(
    'ALL'
  );
  const [inputSearchQuery, setInputSearchQuery] = useState<string>('');

  const [routingWindow, setRoutingWindow] = useState<{
    windowIndex: number;
    destinationNumber: number;
    destinationId?: string;
    currentSourceId: string | null;
  } | null>(null);

  // Close on Escape key (only if sub-modals aren't open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLayoutSelectorOpen && !routingWindow) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isLayoutSelectorOpen, routingWindow]);

  const output = useMemo(() => {
    if (!initialOutput) return null;
    return activeSnapshot?.outputs.find((o) => o.id === initialOutput.id) ?? initialOutput;
  }, [activeSnapshot?.outputs, initialOutput]);

  // Persisted canonical output (guarantees Last Changed reflects saved state, not draft)
  const canonicalOutput = useMemo(() => {
    if (!initialOutput) return null;
    return snapshot?.outputs.find((o) => o.id === initialOutput.id) ?? output;
  }, [snapshot?.outputs, initialOutput, output]);

  const lastChanged = useMemo(() => {
    if (!canonicalOutput) return null;
    return selectOutputLastChanged(canonicalOutput, snapshot?.changeRecords);
  }, [canonicalOutput, snapshot?.changeRecords]);

  const destinations = useMemo(
    () => activeSnapshot?.destinations ?? propDestinations ?? [],
    [activeSnapshot?.destinations, propDestinations]
  );
  const sources = useMemo(
    () => activeSnapshot?.sources ?? propSources ?? [],
    [activeSnapshot?.sources, propSources]
  );
  const allOutputs = useMemo(
    () => activeSnapshot?.outputs ?? propAllOutputs ?? [],
    [activeSnapshot?.outputs, propAllOutputs]
  );

  // Sorted production assignments from the Assignments catalog
  const sortedProductionNames = useMemo(() => {
    const names = (activeSnapshot?.operationalAssignments ?? [])
      .filter((a) => a && a.active !== false && a.rawName)
      .map((a) => a.rawName);
    const unique = Array.from(new Set(names));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [activeSnapshot?.operationalAssignments]);

  const currentAssignmentName = output?.assignmentName ?? '';
  const isLegacyUnknownAssignment = Boolean(
    currentAssignmentName && !sortedProductionNames.includes(currentAssignmentName)
  );

  const layout = useMemo(
    () => (output ? getLayoutDefinition(output.layoutName, customLayouts) : null),
    [output, customLayouts]
  );
  const isAvailable = !output || output.status === 'Available' || !output.layoutName;
  const operatorOutputTitle = output ? formatOutputLabel(output.id) : '';

  const pips = useMemo(() => (layout ? getLayoutPips(layout) : []), [layout]);
  const pipAssignments = useMemo(
    () => (output ? output.pipAssignments || normalizeOutputPipAssignments(output, layout) : {}),
    [output, layout]
  );

  const destMap = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  // Derive window destination records for LayoutRenderer and Table
  const windowsData: LayoutWindowData[] = useMemo(() => {
    if (!layout || !output) return [];

    return pips.map((p, i) => {
      const assignedDestId = pipAssignments[p.pipId] ?? null;
      const dest = assignedDestId ? destMap.get(assignedDestId) : null;
      const source = dest?.assignedSourceId ? (sourceMap.get(dest.assignedSourceId) ?? null) : null;
      const upstream = decomposeTielineUpstream(source, sourceMap);
      const inputDisplay = dest ? formatInputDisplay(dest.id) : null;

      const summaryParts: string[] = [];
      if (upstream.lawoSource) {
        summaryParts.push(upstream.lawoSource.name);
      } else {
        summaryParts.push('BLANK');
      }
      for (const proc of upstream.processingStages) {
        summaryParts.push(proc.name);
      }
      if (source) {
        summaryParts.push(source.name);
      } else {
        summaryParts.push('BLANK');
      }
      if (inputDisplay) {
        summaryParts.push(inputDisplay);
      } else {
        summaryParts.push('BLANK');
      }
      summaryParts.push(`${formatOutputDisplay(output.id)} ${p.pipId}`);

      const isFlowIncomplete = !dest || !source || !upstream.lawoSource;

      return {
        pipId: p.pipId,
        outputId: output.id,
        multiviewId: output.multiviewId,
        destinationOffset: i,
        destinationNumber: dest?.destinationNumber ?? null,
        destinationId: dest?.id ?? null,
        destinationLabel: inputDisplay,
        sourceName: source?.name || null,
        sourceAlias: getSourceAlias(source),
        sourceCategory: source?.category || null,
        lawoSourceName: upstream.lawoSource?.name ?? null,
        processingChainLabel:
          upstream.processingStages.length > 0
            ? upstream.processingStages.map((s) => s.name).join(' → ')
            : null,
        resolvedFlowSummary: summaryParts.join(' → '),
        isFlowIncomplete,
        isLocked: dest?.locked || false,
      };
    });
  }, [layout, output, pips, pipAssignments, destMap, sourceMap]);

  // Available frame inputs for this multiview
  const frameInputs = useMemo(() => {
    if (!output) return [];
    return destinations
      .filter((d) => d.multiviewId === output.multiviewId)
      .sort((a, b) => a.destinationNumber - b.destinationNumber);
  }, [destinations, output]);

  // Map each destinationId to the PIP on this output it is assigned to, if any
  const destToPipMap = useMemo(() => {
    const map = new Map<DestinationId, PipId>();
    for (const [pId, dId] of Object.entries(pipAssignments)) {
      if (dId) {
        map.set(dId as DestinationId, pId as PipId);
      }
    }
    return map;
  }, [pipAssignments]);

  const assignedCount = useMemo(() => {
    return Object.values(pipAssignments).filter(Boolean).length;
  }, [pipAssignments]);

  const unassignedCount = Math.max(0, pips.length - assignedCount);

  // Filtered available MV Inputs for palette
  const filteredPaletteInputs = useMemo(() => {
    const query = inputSearchQuery.trim().toLowerCase();

    return frameInputs.filter((dest) => {
      const isAssignedHere = destToPipMap.has(dest.id);

      if (inputPaletteFilter === 'AVAILABLE' && isAssignedHere) {
        return false;
      }
      if (inputPaletteFilter === 'ASSIGNED' && !isAssignedHere) {
        return false;
      }

      if (query) {
        const destLabel = formatInputDisplay(dest.id).toLowerCase();
        const src = dest.assignedSourceId ? sourceMap.get(dest.assignedSourceId) : null;
        const sourceName = src?.name.toLowerCase() ?? '';
        const sourceAlias = getSourceAlias(src)?.toLowerCase() ?? '';
        if (
          !destLabel.includes(query) &&
          !sourceName.includes(query) &&
          !sourceAlias.includes(query) &&
          !String(dest.destinationNumber).includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [frameInputs, destToPipMap, inputPaletteFilter, inputSearchQuery, sourceMap]);

  if (!output || !initialOutput) {
    return null;
  }

  // Find previous/next outputs within same multiview
  const siblingOutputs = allOutputs.filter((o) => o.multiviewId === output.multiviewId);
  const currentIndex = siblingOutputs.findIndex((o) => o.id === output.id);
  const prevOutput = currentIndex > 0 ? siblingOutputs[currentIndex - 1] : null;
  const nextOutput =
    currentIndex >= 0 && currentIndex < siblingOutputs.length - 1
      ? siblingOutputs[currentIndex + 1]
      : null;

  // Multiview input capacity
  const mvMeta =
    activeSnapshot?.multiviews.find((m) => m.id === output.multiviewId) ??
    VERIFIED_MULTIVIEWS.find((m) => m.id === output.multiviewId);
  const inputCapacity = mvMeta?.inputCapacity ?? 64;

  // Handle Layout Selection
  const handleSelectLayout = (newLayoutName: string) => {
    setIsLayoutSelectorOpen(false);
    const newDef = getLayoutDefinition(newLayoutName, customLayouts);
    if (!newDef) return;

    if (newDef.windowCount > inputCapacity) {
      alert(
        `Selected layout (${newDef.windowCount} windows) exceeds frame capacity of ${inputCapacity} inputs.`
      );
      return;
    }

    const updated = handleOutputLayoutChange(output, newDef);
    updateDraftOutput({
      ...updated,
      assignmentName: output.assignmentName || 'Unassigned Show',
    });
  };

  // Handle Releasing Output to AVAILABLE
  const handleReleaseToAvailable = () => {
    const routedWindows = windowsData.filter((w) => w.sourceName !== null);

    if (routedWindows.length > 0) {
      const confirmRelease = window.confirm(
        `Release output ${operatorOutputTitle} to AVAILABLE?\n\nNotice: This output currently covers ${routedWindows.length} routed destination feed${
          routedWindows.length === 1 ? '' : 's'
        }. Destination routes will be preserved unless explicitly cleared.`
      );
      if (!confirmRelease) return;

      const clearRoutes = window.confirm(
        `Do you also want to clear (unroute) the ${routedWindows.length} destination source assignment${
          routedWindows.length === 1 ? '' : 's'
        }?\n\n• Click OK to unroute all sources.\n• Click Cancel to PRESERVE source routing on these destinations.`
      );

      if (clearRoutes) {
        const batchUpdates = routedWindows
          .filter(
            (w): w is typeof w & { destinationNumber: number } =>
              typeof w.destinationNumber === 'number'
          )
          .map((w) => ({
            multiviewId: output.multiviewId,
            destinationNumber: w.destinationNumber,
            sourceId: null,
          }));
        updateDraftDestinationsBatch(batchUpdates);
      }
    } else {
      const confirmRelease = window.confirm(
        `Release output ${operatorOutputTitle} to AVAILABLE?\nThis will clear the assigned layout and PIP mappings on this output.`
      );
      if (!confirmRelease) return;
    }

    updateDraftOutput({
      ...output,
      layoutName: null,
      pipAssignments: {},
      destinationStart: null,
      destinationEnd: null,
      status: 'Available',
      assignmentName: null,
    });
  };

  return (
    <>
      <div
        className="modal-backdrop"
        data-testid="output-detail-modal"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
        }}
      >
        <div
          className="modal-content"
          style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #383838',
            borderRadius: '4px',
            width: '100%',
            maxWidth: '1280px',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden',
          }}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '12px 18px',
              backgroundColor: '#202020',
              borderBottom: '1px solid #333333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#ffffff',
                  fontFamily: 'var(--ev-font)',
                  letterSpacing: '0.3px',
                }}
              >
                {operatorOutputTitle}
              </h2>

              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '2px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: isAvailable ? '#333333' : '#1e3a5f',
                  color: isAvailable ? '#9e9e9e' : '#38bdf8',
                  border: isAvailable ? '1px solid #444' : '1px solid #2864a3',
                }}
              >
                {output.layoutName || 'AVAILABLE'}
              </span>

              {isEditMode && (
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: hasUnsavedChanges
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(56, 189, 248, 0.2)',
                    color: hasUnsavedChanges ? '#f59e0b' : '#38bdf8',
                    border: hasUnsavedChanges ? '1px solid #f59e0b' : '1px solid #38bdf8',
                  }}
                  data-testid="editing-indicator"
                >
                  {hasUnsavedChanges ? 'STAGED EDITS (Unsaved)' : 'EDIT MODE'}
                </span>
              )}

              {output.locked && (
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: 'rgba(168, 85, 247, 0.25)',
                    color: '#c084fc',
                    border: '1px solid #9333ea',
                  }}
                >
                  LOCKED
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {!isEditMode && (
                <button
                  type="button"
                  onClick={isReadOnly ? undefined : enterEditMode}
                  disabled={isReadOnly}
                  data-testid="enter-edit-mode-btn"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: isReadOnly ? '#262626' : '#2864a3',
                    color: isReadOnly ? '#64748b' : '#ffffff',
                    border: `1px solid ${isReadOnly ? '#444444' : '#38bdf8'}`,
                    borderRadius: '2px',
                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title={
                    isReadOnly
                      ? 'Editing is disabled in shared read-only mode'
                      : 'Enter edit mode to modify output layout and PIP routing'
                  }
                >
                  {isReadOnly ? '🔒 Read-Only' : '✎ Edit Output'}
                </button>
              )}

              {prevOutput && onSelectOutput && (
                <button
                  type="button"
                  onClick={() => onSelectOutput(prevOutput)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: '#303030',
                    color: '#e2e8f0',
                    border: '1px solid #444444',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  ← Prev ({formatOutputDisplay(prevOutput.id)})
                </button>
              )}

              {nextOutput && onSelectOutput && (
                <button
                  type="button"
                  onClick={() => onSelectOutput(nextOutput)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: '#303030',
                    color: '#e2e8f0',
                    border: '1px solid #444444',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  Next ({formatOutputDisplay(nextOutput.id)}) →
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close detail modal"
                style={{
                  marginLeft: '6px',
                  width: '28px',
                  height: '28px',
                  borderRadius: '2px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#cccccc',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
            {/* Phase 2A: Metadata & Editing Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                padding: '12px 14px',
                backgroundColor: '#161616',
                borderRadius: '3px',
                border: '1px solid #333333',
              }}
            >
              {/* Output Identity (Hardware) */}
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#858585',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Output Identity (Hardware)
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#ffffff',
                    marginTop: '2px',
                  }}
                >
                  {operatorOutputTitle}
                </div>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {output.multiviewId} Physical Output #{output.outputNumber}
                </span>
              </div>

              {/* Layout & PIP Count */}
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#858585',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Layout Assignment
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '2px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: output.layoutName ? '#60a5fa' : '#54d54a',
                    }}
                  >
                    {output.layoutName || 'None (Available)'}
                  </span>

                  {isEditMode && (
                    <button
                      type="button"
                      onClick={() => setIsLayoutSelectorOpen(true)}
                      data-testid="change-layout-btn"
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: '#2864a3',
                        color: '#ffffff',
                        border: '1px solid #38bdf8',
                        borderRadius: '2px',
                        cursor: 'pointer',
                      }}
                    >
                      {output.layoutName ? 'Change Layout' : 'Assign Layout'}
                    </button>
                  )}
                </div>
                {layout && (
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    {layout.windowCount} PIPs ({pips[0]?.pipId} – {pips[pips.length - 1]?.pipId})
                  </span>
                )}
              </div>

              {/* Assignment Status */}
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#858585',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  PIP Input Assignments
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: assignedCount > 0 ? '#38bdf8' : '#858585',
                    marginTop: '2px',
                  }}
                >
                  {assignedCount} Assigned • {unassignedCount} Unassigned
                </div>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {hasUnsavedChanges ? 'Staged in active draft' : 'Saved baseline'}
                </span>
              </div>

              {/* Production Assignment */}
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#858585',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Production Assignment
                </div>
                {isEditMode ? (
                  <div style={{ marginTop: '2px' }}>
                    <select
                      className="filter-select"
                      value={currentAssignmentName}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateDraftOutput({
                          ...output,
                          assignmentName: val.length > 0 ? val : null,
                        });
                      }}
                      data-testid="production-assignment-input"
                      aria-label="Production Assignment"
                      style={{
                        width: '100%',
                        padding: '3px 6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: '#101010',
                        border: '1px solid #444',
                        color: '#f59e0b',
                        borderRadius: '2px',
                      }}
                    >
                      <option value="">— None —</option>
                      {isLegacyUnknownAssignment && (
                        <option value={currentAssignmentName}>
                          {currentAssignmentName} (not in Assignments)
                        </option>
                      )}
                      {sortedProductionNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#f59e0b',
                      marginTop: '2px',
                    }}
                  >
                    {output.assignmentName || 'None'}
                  </div>
                )}
              </div>

              {/* Last Changed Attribution */}
              <div data-testid="output-last-changed-section">
                <div
                  style={{
                    fontSize: '10px',
                    color: '#858585',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Last Changed
                </div>
                <div
                  data-testid="output-last-changed"
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: lastChanged ? '#38bdf8' : '#858585',
                    marginTop: '2px',
                  }}
                >
                  {lastChanged ? formatLastChanged(lastChanged) : 'Not recorded'}
                </div>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  {lastChanged?.operatorId
                    ? `Operator ID: ${lastChanged.operatorId}`
                    : 'Persisted change record'}
                </span>
              </div>
            </div>

            {/* Operational Notes and Action Toolbar if in Edit Mode */}
            {isEditMode && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  padding: '8px 12px',
                  backgroundColor: '#121212',
                  border: '1px solid #282828',
                  borderRadius: '2px',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <label
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#858585',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Notes:
                  </label>
                  <input
                    type="text"
                    value={output.notes ?? ''}
                    placeholder="Engineering or operational notes..."
                    onChange={(e) =>
                      updateDraftOutput({
                        ...output,
                        notes: e.target.value.trim() || null,
                      })
                    }
                    data-testid="output-notes-input"
                    style={{
                      flex: 1,
                      padding: '3px 8px',
                      fontSize: '11px',
                      backgroundColor: '#181818',
                      border: '1px solid #383838',
                      color: '#ffffff',
                      borderRadius: '2px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraftOutput({
                        ...output,
                        locked: !output.locked,
                      })
                    }
                    data-testid="toggle-lock-btn"
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: output.locked
                        ? 'rgba(168, 85, 247, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      color: output.locked ? '#c084fc' : '#94a3b8',
                      border: `1px solid ${output.locked ? '#9333ea' : '#444'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {output.locked ? '🔒 Locked' : '🔓 Unlocked'}
                  </button>

                  {!isAvailable && (
                    <button
                      type="button"
                      onClick={handleReleaseToAvailable}
                      data-testid="release-output-btn"
                      style={{
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: '#3b1c1c',
                        color: '#f87171',
                        border: '1px solid #ef4444',
                        borderRadius: '2px',
                        cursor: 'pointer',
                      }}
                      title="Clear layout and return output to AVAILABLE state"
                    >
                      Release to Available
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Main Interactive Stage: Layout Monitor + Available MV Inputs Palette */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: layout
                  ? !isReadOnly
                    ? 'minmax(0, 1.8fr) minmax(300px, 1.2fr)'
                    : '1fr'
                  : '1fr',
                gap: '16px',
                marginBottom: '18px',
              }}
            >
              {/* Left Column: Visual Multiview Display */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                    Visual Multiview Output Display
                  </h3>
                  <span style={{ fontSize: '11px', color: '#858585' }}>
                    {operatorOutputTitle} •{' '}
                    {!isReadOnly
                      ? 'Drag MV Input to PIP, drag PIP to PIP to move'
                      : 'Aspect Ratio 16:9 Broadcast Monitor'}
                  </span>
                </div>

                {layout ? (
                  <LayoutRenderer
                    layout={layout}
                    windowsData={windowsData}
                    mode="detail"
                    isEditable={!isReadOnly}
                    isDraggingInput={Boolean(draggingDestId)}
                    highlightWindowId={selectedPipId ?? undefined}
                    onClickWindow={(win) => {
                      const pipId = win.pipId as PipId;
                      setSelectedPipId(selectedPipId === pipId ? null : pipId);
                    }}
                    onDropDestinationOnPip={(pipId, destId) => {
                      if (isReadOnly) return;
                      if (!destId.startsWith(`DEST:${output.multiviewId}-`)) return;
                      assignDraftPipInput(output.id, pipId, destId);
                    }}
                    onMovePip={(fromPipId, toPipId) => {
                      if (isReadOnly) return;
                      moveDraftPipInput(output.id, fromPipId, toPipId);
                    }}
                    onClearPip={(pipId) => {
                      if (isReadOnly) return;
                      clearDraftPipInput(output.id, pipId);
                    }}
                    onViewSignalFlow={
                      onViewSignalFlow ? (pipId) => onViewSignalFlow(output.id, pipId) : undefined
                    }
                  />
                ) : (
                  <div
                    style={{
                      aspectRatio: '16 / 9',
                      backgroundColor: '#111111',
                      borderRadius: '2px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed #383838',
                      color: '#858585',
                      padding: '24px',
                    }}
                    data-testid="available-output-placeholder"
                  >
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#54d54a',
                        marginBottom: '6px',
                        letterSpacing: '1px',
                      }}
                    >
                      AVAILABLE OUTPUT
                    </span>
                    <span style={{ fontSize: '11px', marginBottom: '14px' }}>
                      No layout has been assigned to {operatorOutputTitle}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (!isEditMode) enterEditMode();
                        setIsLayoutSelectorOpen(true);
                      }}
                      data-testid="assign-layout-placeholder-btn"
                      style={{
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: '#2864a3',
                        color: '#ffffff',
                        border: '1px solid #38bdf8',
                        borderRadius: '2px',
                        cursor: 'pointer',
                      }}
                    >
                      + Assign Layout & Windows
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Phase 2B Available MV Inputs Palette */}
              {!isReadOnly && layout && (
                <div
                  style={{
                    backgroundColor: '#141414',
                    border: '1px solid #2d2d2d',
                    borderRadius: '3px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '480px',
                  }}
                  data-testid="mv-inputs-palette"
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                      Available MV Inputs ({output.multiviewId})
                    </h4>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      Drag onto PIP or click Assign
                    </span>
                  </div>

                  {/* Search and Filters */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      value={inputSearchQuery}
                      onChange={(e) => setInputSearchQuery(e.target.value)}
                      placeholder="Search MV Input or Source..."
                      data-testid="input-palette-search"
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: '11px',
                        backgroundColor: '#1f1f1f',
                        border: '1px solid #383838',
                        color: '#ffffff',
                        borderRadius: '2px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {(['ALL', 'AVAILABLE', 'ASSIGNED'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setInputPaletteFilter(filter)}
                        style={{
                          flex: 1,
                          padding: '3px 6px',
                          fontSize: '10px',
                          fontWeight: inputPaletteFilter === filter ? 700 : 500,
                          backgroundColor: inputPaletteFilter === filter ? '#2563eb' : '#222222',
                          color: inputPaletteFilter === filter ? '#ffffff' : '#94a3b8',
                          border: '1px solid #333333',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  {/* Input items list */}
                  <div
                    style={{
                      overflowY: 'auto',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {filteredPaletteInputs.length === 0 ? (
                      <div
                        style={{
                          padding: '16px',
                          textAlign: 'center',
                          color: '#64748b',
                          fontSize: '11px',
                        }}
                      >
                        No MV Inputs match filter
                      </div>
                    ) : (
                      filteredPaletteInputs.map((dest) => {
                        const assignedPip = destToPipMap.get(dest.id);
                        const source = dest.assignedSourceId
                          ? sourceMap.get(dest.assignedSourceId)
                          : null;
                        const isSelectedForTarget = selectedPipId !== null;
                        const isDraggingThis = draggingDestId === dest.id;

                        return (
                          <div
                            key={dest.id}
                            data-testid={`palette-input-${dest.id}`}
                            data-draggable={!isReadOnly ? 'true' : 'false'}
                            draggable={!isReadOnly}
                            onDragStart={(e) => {
                              if (isReadOnly) {
                                e.preventDefault();
                                return;
                              }
                              e.dataTransfer.setData('application/vip-dest-id', dest.id);
                              e.dataTransfer.setData('text/plain', dest.id);
                              e.dataTransfer.effectAllowed = 'copyMove';
                              setDraggingDestId(dest.id);
                            }}
                            onDragEnd={() => {
                              setDraggingDestId(null);
                            }}
                            style={{
                              padding: '6px 8px',
                              backgroundColor: assignedPip ? '#181818' : '#1f1f1f',
                              border: isDraggingThis
                                ? '1px solid #38bdf8'
                                : assignedPip
                                  ? '1px solid #333333'
                                  : '1px solid #3b82f6',
                              borderRadius: '2px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              opacity: isDraggingThis ? 0.6 : 1,
                              cursor: isDraggingThis ? 'grabbing' : 'grab',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  aria-hidden="true"
                                  style={{
                                    color: '#64748b',
                                    fontSize: '10px',
                                    letterSpacing: '-1px',
                                  }}
                                >
                                  ⋮⋮
                                </span>
                                <span
                                  style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc' }}
                                >
                                  {formatInputDisplay(dest.id)}
                                </span>
                                {assignedPip ? (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      padding: '1px 4px',
                                      borderRadius: '2px',
                                      backgroundColor: '#334155',
                                      color: '#93c5fd',
                                    }}
                                  >
                                    Assigned to {assignedPip}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      padding: '1px 4px',
                                      borderRadius: '2px',
                                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                      color: '#4ade80',
                                    }}
                                  >
                                    Available
                                  </span>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: source ? '#cbd5e1' : '#64748b',
                                  fontStyle: source ? 'normal' : 'italic',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {source
                                  ? `Source: ${formatSourceCompact(source)}`
                                  : 'No routed Source'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {isSelectedForTarget ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedPipId) {
                                      assignDraftPipInput(output.id, selectedPipId, dest.id);
                                    }
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    backgroundColor: '#2563eb',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '2px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  → {selectedPipId}
                                </button>
                              ) : (
                                <select
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      assignDraftPipInput(
                                        output.id,
                                        e.target.value as PipId,
                                        dest.id
                                      );
                                    }
                                  }}
                                  style={{
                                    padding: '2px 4px',
                                    fontSize: '9px',
                                    backgroundColor: '#262626',
                                    color: '#94a3b8',
                                    border: '1px solid #444',
                                    borderRadius: '2px',
                                  }}
                                >
                                  <option value="">Assign to...</option>
                                  {pips.map((p) => (
                                    <option key={p.pipId} value={p.pipId}>
                                      {p.pipId}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Covered PIPs & Assigned MV Inputs Table */}
            {windowsData.length > 0 && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#e2e8f0',
                      margin: 0,
                    }}
                  >
                    Covered Destinations & Routed Sources ({windowsData.length})
                  </h3>
                  {isEditMode && (
                    <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 600 }}>
                      Assign MV Input to each PIP, or Route Source directly to assigned inputs
                    </span>
                  )}
                </div>

                <div
                  style={{
                    overflowX: 'auto',
                    border: '1px solid #333333',
                    borderRadius: '2px',
                  }}
                >
                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}
                    data-testid="destinations-breakdown-table"
                  >
                    <thead>
                      <tr style={{ backgroundColor: '#242424', borderBottom: '1px solid #383838' }}>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          PIP ID
                        </th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          Assigned MV Input
                        </th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          Routed Source
                        </th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          Category
                        </th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          Resolved Signal Flow
                        </th>
                        {isEditMode && (
                          <th
                            style={{
                              padding: '6px 10px',
                              textAlign: 'center',
                              color: '#b8b8b8',
                              fontWeight: 700,
                              width: '220px',
                            }}
                          >
                            Assignment & Routing Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {windowsData.map((win, idx) => {
                        const pipId = (win.pipId ??
                          `PIP-${String(idx + 1).padStart(2, '0')}`) as PipId;
                        const hasInput = Boolean(win.destinationId);

                        return (
                          <tr
                            key={pipId}
                            data-testid={`window-row-${win.destinationOffset}`}
                            data-pip-id={pipId}
                            style={{
                              borderBottom: '1px solid #282828',
                              backgroundColor: idx % 2 === 0 ? '#191919' : '#141414',
                            }}
                          >
                            <td style={{ padding: '6px 10px', fontWeight: 700, color: '#f8fafc' }}>
                              <span
                                style={{
                                  backgroundColor: '#1e293b',
                                  padding: '2px 6px',
                                  borderRadius: '2px',
                                  border: '1px solid #475569',
                                }}
                              >
                                {pipId}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: '6px 10px',
                                fontWeight: 700,
                                color: hasInput ? '#60a5fa' : '#64748b',
                              }}
                            >
                              {win.destinationLabel || 'No MV Input assigned'}
                            </td>
                            <td
                              style={{
                                padding: '6px 10px',
                                fontWeight: 700,
                                color: win.sourceName ? '#ffffff' : '#64748b',
                                fontStyle: win.sourceName ? 'normal' : 'italic',
                              }}
                            >
                              {win.sourceName ? (
                                <div
                                  style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}
                                >
                                  <span>{win.sourceName}</span>
                                  {win.sourceAlias && (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        color: '#38bdf8',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {win.sourceAlias}
                                    </span>
                                  )}
                                </div>
                              ) : hasInput ? (
                                'No routed Source'
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              {win.sourceCategory ? (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: '2px',
                                    backgroundColor: 'rgba(40, 100, 163, 0.3)',
                                    color: '#60a5fa',
                                  }}
                                >
                                  {win.sourceCategory}
                                </span>
                              ) : (
                                <span style={{ color: '#555555' }}>—</span>
                              )}
                            </td>
                            <td
                              data-testid={`detail-resolved-flow-${pipId}`}
                              style={{ padding: '6px 10px', fontSize: '10px', color: '#cbd5e1' }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '6px',
                                }}
                              >
                                <span style={{ fontFamily: 'var(--ev-font)' }}>
                                  {win.resolvedFlowSummary || '—'}
                                </span>
                                {onViewSignalFlow && (
                                  <button
                                    type="button"
                                    data-testid={`modal-view-signal-flow-btn-${pipId}`}
                                    onClick={() => onViewSignalFlow(output.id, pipId)}
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                      color: '#38bdf8',
                                      border: '1px solid #38bdf8',
                                      borderRadius: '2px',
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    View Signal Flow
                                  </button>
                                )}
                              </div>
                            </td>

                            {isEditMode && (
                              <td style={{ padding: '4px 10px', textAlign: 'center' }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  {/* Select MV Input to assign */}
                                  <select
                                    value={win.destinationId || ''}
                                    onChange={(e) => {
                                      const nextDestId = e.target.value
                                        ? (e.target.value as DestinationId)
                                        : null;
                                      assignDraftPipInput(output.id, pipId, nextDestId);
                                    }}
                                    style={{
                                      padding: '2px 4px',
                                      fontSize: '10px',
                                      backgroundColor: '#262626',
                                      color: '#ffffff',
                                      border: '1px solid #444',
                                      borderRadius: '2px',
                                      maxWidth: '120px',
                                    }}
                                  >
                                    <option value="">(Unassigned)</option>
                                    {frameInputs.map((d) => (
                                      <option key={d.id} value={d.id}>
                                        {formatInputDisplay(d.id)}
                                      </option>
                                    ))}
                                  </select>

                                  {/* Clear button */}
                                  {hasInput && (
                                    <button
                                      type="button"
                                      onClick={() => clearDraftPipInput(output.id, pipId)}
                                      data-testid={`clear-pip-btn-${pipId}`}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        backgroundColor: '#3b1c1c',
                                        color: '#f87171',
                                        border: '1px solid #ef4444',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                      }}
                                      title={`Clear MV Input from ${pipId}`}
                                    >
                                      Clear
                                    </button>
                                  )}

                                  {/* Route Source button (if MV Input is assigned) */}
                                  {hasInput && win.destinationNumber && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRoutingWindow({
                                          windowIndex: win.destinationOffset,
                                          destinationNumber: win.destinationNumber!,
                                          destinationId: win.destinationId ?? undefined,
                                          currentSourceId:
                                            destinations.find((d) => d.id === win.destinationId)
                                              ?.assignedSourceId ?? null,
                                        });
                                      }}
                                      data-testid={`route-btn-${win.destinationOffset}`}
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        backgroundColor: '#2864a3',
                                        color: '#ffffff',
                                        border: '1px solid #38bdf8',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Route
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Modal: Layout Selector Catalog */}
      <LayoutSelectorModal
        isOpen={isLayoutSelectorOpen}
        output={output}
        destinations={destinations}
        sources={sources}
        customLayouts={customLayouts}
        onSelectLayout={handleSelectLayout}
        onClose={() => setIsLayoutSelectorOpen(false)}
      />

      {/* Sub-Modal: Source Routing Control */}
      {routingWindow && (
        <SourceRoutingSelectorModal
          isOpen={Boolean(routingWindow)}
          windowIndex={routingWindow.windowIndex}
          destinationNumber={routingWindow.destinationNumber}
          destinationId={routingWindow.destinationId}
          currentSourceId={routingWindow.currentSourceId}
          sources={sources}
          onApplySource={(sourceId) => {
            updateDraftDestination(output.multiviewId, routingWindow.destinationNumber, sourceId);
            setRoutingWindow(null);
          }}
          onAddNewSource={(newSource) => {
            addDraftSource(newSource);
          }}
          onClose={() => setRoutingWindow(null)}
        />
      )}
    </>
  );
};
