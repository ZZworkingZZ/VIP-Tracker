import React, { useState, useEffect } from 'react';
import { MultiviewOutput, Destination, Source } from '../../domain/models';
import { getLayoutDefinition } from '../../domain/layoutDefinitions';
import { LayoutRenderer, LayoutWindowData } from './LayoutRenderer';
import { formatOutputDisplay, formatDestinationDisplay } from '../../domain/identifiers';
import { useTrackerSnapshot } from '../../hooks/useTracker';
import { LayoutSelectorModal } from './LayoutSelectorModal';
import { SourceRoutingSelectorModal } from './SourceRoutingSelectorModal';
import { findNextAvailableInputBlock } from '../../domain/rangeUtils';
import { VERIFIED_MULTIVIEWS } from '../../domain/constants';

export interface OutputDetailModalProps {
  readonly output: MultiviewOutput | null;
  readonly destinations?: readonly Destination[];
  readonly sources?: readonly Source[];
  readonly allOutputs?: readonly MultiviewOutput[];
  readonly onClose: () => void;
  readonly onSelectOutput?: (output: MultiviewOutput) => void;
}

export const OutputDetailModal: React.FC<OutputDetailModalProps> = ({
  output: initialOutput,
  destinations: propDestinations,
  sources: propSources,
  allOutputs: propAllOutputs,
  onClose,
  onSelectOutput,
}) => {
  const {
    activeSnapshot,
    isEditMode,
    enterEditMode,
    updateDraftOutput,
    updateDraftDestination,
    updateDraftDestinationsBatch,
    addDraftSource,
    customLayouts,
  } = useTrackerSnapshot();

  const [isLayoutSelectorOpen, setIsLayoutSelectorOpen] = useState(false);
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

  if (!initialOutput) {
    return null;
  }

  // Use live activeSnapshot version of this output if in edit mode
  const output = activeSnapshot?.outputs.find((o) => o.id === initialOutput.id) ?? initialOutput;
  const destinations = activeSnapshot?.destinations ?? propDestinations ?? [];
  const sources = activeSnapshot?.sources ?? propSources ?? [];
  const allOutputs = activeSnapshot?.outputs ?? propAllOutputs ?? [];

  const layout = getLayoutDefinition(output.layoutName);
  const isAvailable = output.status === 'Available' || !output.layoutName;
  const outputLabel = formatOutputDisplay(output.id);

  // Derive window destination records
  const windowsData: LayoutWindowData[] = [];
  if (output.destinationStart && output.destinationEnd && layout) {
    for (let i = 0; i < layout.windowCount; i++) {
      const destNumber = output.destinationStart + i;
      const dest = destinations.find(
        (d) => d.multiviewId === output.multiviewId && d.destinationNumber === destNumber
      );
      const source = dest?.assignedSourceId
        ? sources.find((s) => s.id === dest.assignedSourceId)
        : null;

      windowsData.push({
        destinationOffset: i,
        destinationNumber: destNumber,
        destinationId: dest?.id,
        destinationLabel: dest ? formatDestinationDisplay(dest.id) : `Src ${destNumber}`,
        sourceName: source?.name || null,
        sourceCategory: source?.category || null,
        isLocked: dest?.locked || false,
      });
    }
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
    const newDef = getLayoutDefinition(newLayoutName);
    if (!newDef) return;

    if (newDef.windowCount > inputCapacity) {
      return;
    }

    let start = output.destinationStart;
    if (start === null) {
      // Find contiguous block
      const freeRange = findNextAvailableInputBlock(
        output.multiviewId,
        newDef.windowCount,
        allOutputs as MultiviewOutput[],
        output.id
      );
      start = freeRange ? freeRange.start : 1;
    }

    // Ensure range fits within inputCapacity
    if (start + newDef.windowCount - 1 > inputCapacity) {
      const freeRange = findNextAvailableInputBlock(
        output.multiviewId,
        newDef.windowCount,
        allOutputs as MultiviewOutput[],
        output.id
      );
      if (freeRange) {
        start = freeRange.start;
      } else {
        start = Math.max(1, inputCapacity - newDef.windowCount + 1);
      }
    }

    const end = start + newDef.windowCount - 1;

    // Reject if range is invalid or exceeds processor frame capacity
    if (start < 1 || end > inputCapacity) {
      return;
    }

    updateDraftOutput({
      ...output,
      layoutName: newLayoutName,
      destinationStart: start,
      destinationEnd: end,
      status: 'Assigned',
      assignmentName: output.assignmentName || 'Unassigned Show',
    });
  };

  // Handle Releasing Output to AVAILABLE
  const handleReleaseToAvailable = () => {
    const routedWindows = windowsData.filter((w) => w.sourceName !== null);

    if (routedWindows.length > 0) {
      const confirmRelease = window.confirm(
        `Release output ${outputLabel} to AVAILABLE?\n\nNotice: This output currently covers ${routedWindows.length} routed destination feed${
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
        `Release output ${outputLabel} to AVAILABLE?\nThis will clear the assigned layout and production assignment.`
      );
      if (!confirmRelease) return;
    }

    updateDraftOutput({
      ...output,
      layoutName: null,
      destinationStart: null,
      destinationEnd: null,
      assignmentName: null,
      status: 'Available',
    });
  };

  return (
    <>
      <div
        className="output-modal-backdrop"
        onClick={onClose}
        data-testid="output-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-output-title"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
        }}
      >
        <div
          className="output-modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#1c1c1c',
            border: '1px solid #444444',
            borderRadius: '4px',
            maxWidth: '960px',
            width: '100%',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
            fontFamily: 'var(--ev-font)',
          }}
        >
          {/* Modal Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#272727',
              borderBottom: '1px solid #383838',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                id="modal-output-title"
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.2px',
                }}
              >
                {outputLabel}
              </span>

              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '2px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: isAvailable
                    ? 'rgba(84, 213, 74, 0.2)'
                    : 'rgba(40, 100, 163, 0.4)',
                  color: isAvailable ? '#54d54a' : '#60a5fa',
                  border: `1px solid ${isAvailable ? '#54d54a' : '#3378c2'}`,
                }}
              >
                {isAvailable ? 'AVAILABLE' : output.assignmentName || 'ASSIGNED'}
              </span>

              {isEditMode && (
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: 'rgba(56, 189, 248, 0.2)',
                    color: '#38bdf8',
                    border: '1px solid #38bdf8',
                  }}
                  data-testid="editing-indicator"
                >
                  EDITING OUTPUT
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
                  onClick={enterEditMode}
                  data-testid="enter-edit-mode-btn"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: '#2864a3',
                    color: '#ffffff',
                    border: '1px solid #38bdf8',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ✎ Edit Output
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
            {/* Metadata & Editing Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                padding: '12px 14px',
                backgroundColor: '#161616',
                borderRadius: '3px',
                border: '1px solid #333333',
              }}
            >
              {/* Output Identity (Read-only Hardware Identity) */}
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
                  {output.multiviewId} • Output {output.outputNumber}
                </div>
                <span style={{ fontSize: '10px', color: '#64748b' }}>Fixed physical output</span>
              </div>

              {/* Layout Assignment */}
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
                    {layout.windowCount} windows ({layout.category})
                  </span>
                )}
              </div>

              {/* Production / Show Assignment */}
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
                    <input
                      type="text"
                      list="production-options"
                      value={output.assignmentName ?? ''}
                      placeholder="e.g. CHOPPED, BR ALERT 1"
                      onChange={(e) =>
                        updateDraftOutput({
                          ...output,
                          assignmentName: e.target.value.trim() || null,
                        })
                      }
                      data-testid="production-assignment-input"
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
                    />
                    <datalist id="production-options">
                      {activeSnapshot?.operationalAssignments.map((a) => (
                        <option key={a.id} value={a.rawName} />
                      ))}
                    </datalist>
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

            {/* Visual Multiview Display */}
            <div style={{ marginBottom: '18px' }}>
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
                  Aspect Ratio 16:9 Broadcast Monitor
                </span>
              </div>

              {layout ? (
                <LayoutRenderer layout={layout} windowsData={windowsData} mode="detail" />
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
                    No layout has been assigned to {outputLabel}
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

            {/* Destination Breakdown Table */}
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
                      Click &ldquo;Route Source&rdquo; on any row to patch broadcast feeds
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
                          Window #
                        </th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          Destination
                        </th>
                        <th
                          style={{
                            padding: '6px 10px',
                            textAlign: 'left',
                            color: '#b8b8b8',
                            fontWeight: 700,
                          }}
                        >
                          Destination ID
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
                        {isEditMode && (
                          <th
                            style={{
                              padding: '6px 10px',
                              textAlign: 'center',
                              color: '#b8b8b8',
                              fontWeight: 700,
                              width: '140px',
                            }}
                          >
                            Routing Action
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {windowsData.map((win, idx) => (
                        <tr
                          key={win.destinationOffset}
                          data-testid={`window-row-${win.destinationOffset}`}
                          style={{
                            borderBottom: '1px solid #282828',
                            backgroundColor: idx % 2 === 0 ? '#191919' : '#141414',
                          }}
                        >
                          <td style={{ padding: '6px 10px', color: '#858585' }}>
                            Window {win.destinationOffset + 1}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              fontWeight: 700,
                              color: '#ffffff',
                            }}
                          >
                            #{win.destinationNumber}
                          </td>
                          <td style={{ padding: '6px 10px', color: '#60a5fa' }}>
                            {win.destinationLabel || '—'}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              fontWeight: 700,
                              color: win.sourceName ? '#ffffff' : '#555555',
                            }}
                          >
                            {win.sourceName || '— [Unrouted]'}
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

                          {isEditMode && (
                            <td style={{ padding: '4px 10px', textAlign: 'center' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    const destNum =
                                      win.destinationNumber ??
                                      (output.destinationStart
                                        ? output.destinationStart + win.destinationOffset
                                        : 1);
                                    setRoutingWindow({
                                      windowIndex: win.destinationOffset,
                                      destinationNumber: destNum,
                                      destinationId: win.destinationLabel ?? undefined,
                                      currentSourceId:
                                        destinations.find(
                                          (d) =>
                                            d.multiviewId === output.multiviewId &&
                                            d.destinationNumber === destNum
                                        )?.assignedSourceId ?? null,
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

                                {win.sourceName && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const destNum =
                                        win.destinationNumber ??
                                        (output.destinationStart
                                          ? output.destinationStart + win.destinationOffset
                                          : 1);
                                      updateDraftDestination(output.multiviewId, destNum, null);
                                    }}
                                    data-testid={`clear-source-btn-${win.destinationOffset}`}
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                      backgroundColor: '#262626',
                                      color: '#94a3b8',
                                      border: '1px solid #444',
                                      borderRadius: '2px',
                                      cursor: 'pointer',
                                    }}
                                    title="Unroute source"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
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
