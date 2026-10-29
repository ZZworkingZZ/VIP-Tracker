import React, { useState, useEffect, useMemo } from 'react';
import {
  Source,
  ValidationFinding,
  getSourceAlias,
  formatSourceCompact,
} from '../../domain/models';
import { SourceId } from '../../domain/identifiers';
import {
  previewUpstreamSignalFlow,
  resolveSignalFlow,
  formatSignalFlowChain,
  formatCyclePath,
  DEFAULT_MAX_SIGNAL_FLOW_DEPTH,
} from '../../domain/signalFlow';

export interface SourceSignalFlowModalProps {
  readonly isOpen: boolean;
  readonly source: Source;
  readonly allSources: readonly Source[];
  readonly validationFindings?: readonly ValidationFinding[];
  readonly isEditMode: boolean;
  readonly onEnterEditMode?: () => void;
  readonly onApply: (upstreamSourceId: SourceId | null) => void;
  readonly onClose: () => void;
}

export const SourceSignalFlowModal: React.FC<SourceSignalFlowModalProps> = ({
  isOpen,
  source,
  allSources,
  validationFindings = [],
  isEditMode,
  onEnterEditMode,
  onApply,
  onClose,
}) => {
  const [selectedUpstreamId, setSelectedUpstreamId] = useState<SourceId | null>(
    source.upstreamSourceId
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Reset local state when modal opens or source changes
  useEffect(() => {
    setSelectedUpstreamId(source.upstreamSourceId);
    setSearchQuery('');
  }, [isOpen, source]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Validation findings specific to this source
  const sourceFindings = useMemo(
    () =>
      validationFindings.filter(
        (f) => f.entityId === source.id || f.relatedEntityIds.includes(source.id)
      ),
    [validationFindings, source.id]
  );

  // Map for fast source lookup
  const sourceMap = useMemo(
    () => new Map<SourceId, Source>(allSources.map((s) => [s.id, s])),
    [allSources]
  );

  // Resolved flow for the persisted/current state
  const currentFlow = useMemo(
    () => resolveSignalFlow(source.id, sourceMap),
    [source.id, sourceMap]
  );

  // Preview flow for proposed upstream selection (pure domain preview)
  const previewFlow = useMemo(() => {
    return previewUpstreamSignalFlow(source.id, selectedUpstreamId, sourceMap);
  }, [source.id, selectedUpstreamId, sourceMap]);

  // Immediate upstream source lookup (current)
  const currentUpstreamSource = useMemo(() => {
    if (!source.upstreamSourceId) return null;
    return sourceMap.get(source.upstreamSourceId) ?? null;
  }, [source.upstreamSourceId, sourceMap]);

  // Immediate upstream source lookup (preview)
  const previewUpstreamSource = useMemo(() => {
    if (!selectedUpstreamId) return null;
    return sourceMap.get(selectedUpstreamId) ?? null;
  }, [selectedUpstreamId, sourceMap]);

  // Cycle error path calculation
  const cycleErrorPath = useMemo(() => {
    if (!previewFlow.hasCycle) return '';
    return formatCyclePath(previewFlow.cycleSourceIds, sourceMap);
  }, [previewFlow, sourceMap]);

  // Check if save should be prohibited (self-route or cycle)
  const isDirectSelfRoute = selectedUpstreamId === source.id || previewFlow.isSelfRoute;
  const isCircular = previewFlow.hasCycle;
  const canSave = !isDirectSelfRoute && !isCircular;

  // Filter selectable upstream sources:
  // 1. MUST exclude the current source (self-routing prevention)
  // 2. Filter by search query on name
  const selectableSources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSources.filter((s) => {
      if (s.id === source.id) return false;
      if (q) {
        const nameMatch = s.name.toLowerCase().includes(q);
        const alias = getSourceAlias(s);
        const aliasMatch = alias ? alias.toLowerCase().includes(q) : false;
        if (!nameMatch && !aliasMatch) return false;
      }
      return true;
    });
  }, [allSources, source.id, searchQuery]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Save-time domain validation (defense-in-depth)
    if (!canSave) return;
    if (selectedUpstreamId === source.id) return;
    if (previewFlow.hasCycle) return;

    onApply(selectedUpstreamId);
    onClose();
  };

  const getSourceTypeDisplay = (type: string) => {
    switch (type) {
      case 'virtual':
        return 'Virtual Source';
      case 'processing':
        return 'Processing Source';
      case 'originating':
      default:
        return 'Direct VIP Source (Originating)';
    }
  };

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      data-testid="source-signal-flow-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
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
        zIndex: 1300,
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
          maxWidth: '680px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          fontFamily: 'var(--ev-font)',
        }}
      >
        {/* Header */}
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
          <div>
            <div
              id="modal-title"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              {isEditMode ? 'Edit Signal Flow' : 'Source Routing Details'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Target Source:{' '}
              <strong style={{ color: '#fff' }}>{formatSourceCompact(source)}</strong> ·{' '}
              {source.category}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            data-testid="close-signal-flow-modal-btn"
            style={{
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

        {/* Modal Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Read-Only Source Metadata Card */}
          <div
            style={{
              backgroundColor: '#161616',
              border: '1px solid #333333',
              borderRadius: '3px',
              padding: '12px 14px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Source Name
              </span>
              <div
                style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}
              >
                {source.name}
              </div>
              {getSourceAlias(source) && (
                <div
                  style={{ fontSize: '11px', fontWeight: 600, color: '#38bdf8', marginTop: '2px' }}
                >
                  {getSourceAlias(source)}
                </div>
              )}
            </div>

            <div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Category
              </span>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '2px' }}>
                <span
                  className="status-badge badge-assigned"
                  style={{ padding: '2px 6px', fontSize: '11px' }}
                >
                  {source.category}
                </span>
              </div>
            </div>

            <div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Source Type
              </span>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                {getSourceTypeDisplay(source.sourceType)}
              </div>
            </div>

            <div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Current Upstream Source
              </span>
              <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                {!source.upstreamSourceId ? (
                  <span style={{ color: '#858585' }}>Not assigned</span>
                ) : currentUpstreamSource ? (
                  <span style={{ color: '#38bdf8' }}>
                    {formatSourceCompact(currentUpstreamSource)}
                  </span>
                ) : (
                  <span style={{ color: '#f87171' }}>
                    Missing Source ({source.upstreamSourceId})
                  </span>
                )}
              </div>
            </div>

            <div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Validation State
              </span>
              <div
                style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}
                data-testid="modal-validation-state"
              >
                {sourceFindings.length === 0 && !currentFlow.hasCycle && !currentFlow.isDangling ? (
                  <span className="status-badge badge-available">Valid</span>
                ) : (
                  <span className="status-badge badge-conflict">
                    {sourceFindings[0]?.code ?? 'Issue Detected'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Validation Status Alerts for Existing Data (e.g. Dangling, Self-route, Cycle) */}
          {currentFlow.isSelfRoute && (
            <div
              className="finding-item finding-error"
              role="alert"
              style={{ margin: 0, padding: '8px 12px' }}
              data-testid="persisted-self-route-alert"
            >
              <span className="status-badge badge-conflict">Invalid</span>
              <span>
                This source is currently routed into itself in stored data. Select an upstream
                source or clear it below.
              </span>
            </div>
          )}

          {currentFlow.isDangling && (
            <div
              className="finding-item finding-error"
              role="alert"
              style={{ margin: 0, padding: '8px 12px' }}
              data-testid="persisted-dangling-alert"
            >
              <span className="status-badge badge-conflict">Missing Source</span>
              <span>
                Stored upstream source reference &apos;{source.upstreamSourceId}&apos; does not
                exist in the catalog.
              </span>
            </div>
          )}

          {currentFlow.hasCycle && !currentFlow.isSelfRoute && (
            <div
              className="finding-item finding-error"
              role="alert"
              style={{ margin: 0, padding: '8px 12px' }}
              data-testid="persisted-cycle-alert"
            >
              <span className="status-badge badge-conflict">Circular</span>
              <span>
                Circular routing detected in stored relationships:{' '}
                {formatCyclePath(currentFlow.cycleSourceIds, sourceMap)}.
              </span>
            </div>
          )}

          {/* Current Signal Flow Chain Display */}
          <div
            style={{
              backgroundColor: '#161616',
              border: '1px solid #333333',
              borderRadius: '3px',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: '#858585',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Current Signal Flow Chain
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {currentFlow.hops.length > 0
                  ? `${currentFlow.hops.length} hop${currentFlow.hops.length === 1 ? '' : 's'}`
                  : 'Origin'}
              </span>
            </div>

            <div
              data-testid="current-signal-flow-chain"
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '8px 10px',
                backgroundColor: '#0d0d0d',
                border: '1px solid #282828',
                borderRadius: '2px',
                color: currentFlow.hasCycle ? '#f87171' : '#54d54a',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {currentFlow.hops.length === 0 ? (
                <span style={{ color: '#858585' }}>
                  {formatSourceCompact(source)} (Origin — no upstream feed)
                </span>
              ) : currentFlow.hops.length === 1 ? (
                <span>{formatSourceCompact(source)} (Origin)</span>
              ) : (
                <span>{formatSignalFlowChain(currentFlow)}</span>
              )}
            </div>
          </div>

          {/* Edit Mode Toggle / Trigger Banner if in View Mode */}
          {!isEditMode && (
            <div
              style={{
                backgroundColor: '#142232',
                border: '1px solid #2864a3',
                borderRadius: '3px',
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                  Signal Flow Configuration
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Enter edit mode to select or clear the upstream source feeding {source.name}.
                </div>
              </div>

              {onEnterEditMode && (
                <button
                  type="button"
                  onClick={onEnterEditMode}
                  data-testid="enter-edit-mode-modal-btn"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#2864a3',
                    color: '#ffffff',
                    border: '1px solid #38bdf8',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  ✎ Edit Signal Flow
                </button>
              )}
            </div>
          )}

          {/* EDITING INTERFACE (when isEditMode is true) */}
          {isEditMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ borderTop: '1px solid #2d2d2d', paddingTop: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <label
                    htmlFor="upstream-source-search"
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#38bdf8',
                      textTransform: 'uppercase',
                    }}
                  >
                    Select Upstream Source (Feeding {source.name})
                  </label>
                  <span style={{ fontSize: '11px', color: '#858585' }}>
                    {selectableSources.length} of {allSources.length - 1} eligible sources
                  </span>
                </div>

                {/* Searchable input */}
                <input
                  id="upstream-source-search"
                  type="search"
                  placeholder="Search upstream source by name... (e.g. vTie, Swr, Cam)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="upstream-source-search-input"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    backgroundColor: '#101010',
                    border: '1px solid #444444',
                    borderRadius: '2px',
                    color: '#ffffff',
                    fontFamily: 'var(--ev-font)',
                    boxSizing: 'border-box',
                    marginBottom: '8px',
                  }}
                  autoFocus
                />

                {/* Selector List */}
                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    backgroundColor: '#0f0f0f',
                    border: '1px solid #2d2d2d',
                    borderRadius: '2px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    padding: '4px',
                  }}
                >
                  {/* Option 1: Unassigned / Clear */}
                  <div
                    onClick={() => setSelectedUpstreamId(null)}
                    data-testid="clear-upstream-source-btn"
                    style={{
                      padding: '6px 10px',
                      backgroundColor: selectedUpstreamId === null ? '#1e3a5a' : '#161616',
                      border: `1px solid ${selectedUpstreamId === null ? '#38bdf8' : '#282828'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: selectedUpstreamId === null ? '#38bdf8' : '#cbd5e1',
                        }}
                      >
                        — Not assigned (Origin)
                      </span>
                      <span style={{ fontSize: '10px', color: '#858585', marginLeft: '8px' }}>
                        Clear upstream relationship; {source.name} originates directly
                      </span>
                    </div>
                    {selectedUpstreamId === null && (
                      <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                        ✓ Selected
                      </span>
                    )}
                  </div>

                  {/* Filtered Eligible Sources (Current source already excluded) */}
                  {selectableSources.map((s) => {
                    const isSelected = selectedUpstreamId === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedUpstreamId(s.id)}
                        data-testid={`upstream-option-${s.id}`}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: isSelected ? '#1e3a5a' : '#141414',
                          border: `1px solid ${isSelected ? '#38bdf8' : '#222222'}`,
                          borderRadius: '2px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                            {formatSourceCompact(s)}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '1px 5px',
                              borderRadius: '2px',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              color: '#94a3b8',
                            }}
                          >
                            {s.category}
                          </span>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            ({s.sourceType})
                          </span>
                        </div>

                        {isSelected && (
                          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                            ✓ Selected
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {selectableSources.length === 0 && (
                    <div
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        color: '#858585',
                        fontSize: '12px',
                      }}
                    >
                      No eligible sources match &quot;{searchQuery}&quot;.
                    </div>
                  )}
                </div>
              </div>

              {/* Signal Flow Preview Card */}
              <div
                style={{
                  backgroundColor: '#161616',
                  border: '1px solid #333333',
                  borderRadius: '3px',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#38bdf8',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Signal Flow Preview (Proposed)
                  </span>
                  <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                    {previewFlow.hops.length > 0
                      ? `${previewFlow.hops.length} hop${previewFlow.hops.length === 1 ? '' : 's'}`
                      : 'Origin'}
                  </span>
                </div>

                <div
                  data-testid="preview-signal-flow-chain"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '8px 10px',
                    backgroundColor: '#0d0d0d',
                    border: `1px solid ${!canSave ? '#ef4444' : '#2864a3'}`,
                    borderRadius: '2px',
                    color: !canSave ? '#f87171' : '#38bdf8',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {previewFlow.hops.length === 0 ? (
                    <span style={{ color: '#858585' }}>
                      {formatSourceCompact(source)} (Origin — no upstream feed)
                    </span>
                  ) : previewFlow.hops.length === 1 ? (
                    <span>{formatSourceCompact(source)} (Origin)</span>
                  ) : (
                    <span>{formatSignalFlowChain(previewFlow)}</span>
                  )}
                </div>

                {/* Origin Information */}
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    display: 'flex',
                    gap: '16px',
                  }}
                >
                  <span>
                    <strong>Origin:</strong>{' '}
                    <span style={{ color: '#e2e8f0' }}>
                      {previewFlow.originSource
                        ? formatSourceCompact(previewFlow.originSource)
                        : formatSourceCompact(source)}
                    </span>
                  </span>
                  <span>
                    <strong>Immediate Upstream:</strong>{' '}
                    <span style={{ color: '#e2e8f0' }}>
                      {previewUpstreamSource
                        ? formatSourceCompact(previewUpstreamSource)
                        : 'None (Unassigned)'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Inline Validation Warnings and Errors */}
              {isDirectSelfRoute && (
                <div
                  className="finding-item finding-error"
                  role="alert"
                  data-testid="signal-flow-error-banner"
                  style={{ margin: 0, padding: '8px 12px' }}
                >
                  <span className="status-badge badge-conflict">Self-Routing Prohibited</span>
                  <span>
                    Cannot route source &apos;{source.name}&apos; directly into itself. Select a
                    different upstream source or clear the relationship.
                  </span>
                </div>
              )}

              {isCircular && !isDirectSelfRoute && (
                <div
                  className="finding-item finding-error"
                  role="alert"
                  data-testid="signal-flow-error-banner"
                  style={{ margin: 0, padding: '8px 12px' }}
                >
                  <span className="status-badge badge-conflict">Circular Routing</span>
                  <span>
                    Cannot save this relationship because it creates a circular signal flow:{' '}
                    {cycleErrorPath}.
                  </span>
                </div>
              )}

              {previewFlow.maxDepthExceeded && (
                <div
                  className="finding-item finding-warning"
                  role="status"
                  data-testid="signal-flow-warning-banner"
                  style={{ margin: 0, padding: '8px 12px' }}
                >
                  <span className="status-badge badge-warning">Max Depth Warning</span>
                  <span>
                    Proposed signal flow reaches the maximum tracked depth of{' '}
                    {DEFAULT_MAX_SIGNAL_FLOW_DEPTH} hops. Traversal has terminated safely at maximum
                    depth.
                  </span>
                </div>
              )}

              {previewFlow.isDangling && (
                <div
                  className="finding-item finding-warning"
                  role="status"
                  data-testid="signal-flow-warning-banner"
                  style={{ margin: 0, padding: '8px 12px' }}
                >
                  <span className="status-badge badge-warning">Unknown Source</span>
                  <span>
                    Selected upstream source ID &apos;{previewFlow.danglingSourceId}&apos; is not in
                    the directory.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#202020',
            borderTop: '1px solid #333333',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            data-testid="cancel-signal-flow-btn"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              backgroundColor: '#303030',
              color: '#cbd5e1',
              border: '1px solid #444444',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            {isEditMode ? 'Cancel' : 'Close'}
          </button>

          {isEditMode && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              data-testid="save-signal-flow-btn"
              style={{
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: canSave ? '#2864a3' : '#1e3a5a',
                color: canSave ? '#ffffff' : '#64748b',
                border: `1px solid ${canSave ? '#38bdf8' : '#2864a3'}`,
                borderRadius: '2px',
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
              title={
                !canSave
                  ? 'Cannot save: circular or self-routing detected'
                  : 'Stage this upstream routing change'
              }
            >
              Stage Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
