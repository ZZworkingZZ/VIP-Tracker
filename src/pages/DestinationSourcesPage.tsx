import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTrackerSnapshot } from '../hooks/useTracker';
import {
  MultiviewId,
  DestinationId,
  SourceId,
  formatDestinationDisplay,
  formatOutputDisplay,
  formatInputDisplay,
} from '../domain/identifiers';
import { selectDestinationsForMultiview, formatLastChanged } from '../domain/selectors';
import { OutputDisplayCard } from '../components/multiview/OutputDisplayCard';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { SourceRoutingSelectorModal } from '../components/multiview/SourceRoutingSelectorModal';
import {
  MultiviewOutput,
  LAWO_DEVICE_TYPES,
  LAWO_VENDORS,
  getSourceAlias,
  formatSourceCompact,
} from '../domain/models';
import { SOURCE_CATEGORIES, getSourceCategoryColor } from '../domain/sourceCategories';
import {
  resolveAllPipSignalFlows,
  filterPipSignalFlows,
  getValidLawoSourceOptions,
  getValidProcessingStageOptions,
  getValidTielineOptions,
  getValidMvInputOptions,
  evaluateDuplicateLawoSourceWarning,
  applyPipMvInputStageChange,
  applyPipTielineStageChange,
  applyPipLawoChainUpdate,
  applyPipFlowLockChange,
  ResolvedPipSignalFlow,
  inferLawoDeviceType,
  inferLawoVendor,
} from '../domain/signalFlow';

export const STATE_LABELS = {
  AVAILABLE: 'Available',
  IN_USE: 'In Use',
  CONFLICT: 'Conflict',
} as const;

interface PendingStageEdit {
  lawoSourceId?: SourceId | null;
  processingStageIds?: SourceId[];
  tielineId?: SourceId | null;
  destinationId?: DestinationId | null;
  searchFilter?: string;
}

interface PendingLockEdit {
  availableAt: string;
  context: string;
}

export const DestinationSourcesPage: React.FC = () => {
  const {
    activeSnapshot,
    isEditMode,
    isReadOnly,
    isSaving,
    saveError,
    clearSaveError,
    enterEditMode,
    exitEditMode,
    discardChanges,
    hasUnsavedChanges,
    assignDraftPipInput,
    moveDraftPipInput,
    updateDraftDestination,
    addDraftSource,
    saveSourceAlias,
    commitSignalFlowChange,
  } = useTrackerSnapshot();

  const snapshot = activeSnapshot;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const focusOutputId = searchParams.get('outputId');
  const focusPipId = searchParams.get('pipId');
  const returnTo = searchParams.get('from');
  const returnMvId = searchParams.get('mvId');
  const focusOutputMv = focusOutputId?.match(/MV-\d{2}/)?.[0] ?? null;
  const candidateMv = returnMvId ?? focusOutputMv;
  const validInitialMv =
    candidateMv && ['MV-01', 'MV-02', 'MV-03', 'MV-04', 'MV-05'].includes(candidateMv)
      ? (candidateMv as MultiviewId)
      : null;
  const focusedFlowKey = focusOutputId && focusPipId ? `${focusOutputId}:${focusPipId}` : null;

  const [viewMode, setViewMode] = useState<'flows' | 'display' | 'table'>('flows');
  const [selectedMvFilter, setSelectedMvFilter] = useState<MultiviewId | 'ALL'>(
    validInitialMv ?? 'MV-01'
  );
  const [selectedMv, setSelectedMv] = useState<MultiviewId>(validInitialMv ?? 'MV-01');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [routeStatusFilter, setRouteStatusFilter] = useState<'ALL' | 'ROUTED' | 'UNROUTED'>('ALL');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');

  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);
  const [routingDestId, setRoutingDestId] = useState<DestinationId | null>(null);
  const [draggingDestId, setDraggingDestId] = useState<DestinationId | null>(null);

  // Per-row pending stage edits (only committed when checkmark ✓ is clicked)
  const [pendingLawoEdits, setPendingLawoEdits] = useState<Record<string, PendingStageEdit>>({});
  const [pendingProcessingEdits, setPendingProcessingEdits] = useState<
    Record<string, PendingStageEdit>
  >({});
  const [pendingTielineEdits, setPendingTielineEdits] = useState<Record<string, PendingStageEdit>>(
    {}
  );
  const [pendingMvInputEdits, setPendingMvInputEdits] = useState<Record<string, PendingStageEdit>>(
    {}
  );
  const [aliasEdits, setAliasEdits] = useState<Record<string, string>>({});
  const [pendingLockEdits, setPendingLockEdits] = useState<Record<string, PendingLockEdit>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (focusedFlowKey && rowRefs.current[focusedFlowKey]) {
      const el = rowRefs.current[focusedFlowKey];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [focusedFlowKey]);

  const routingDestination = useMemo(() => {
    if (!routingDestId || !snapshot) return null;
    return snapshot.destinations.find((d) => d.id === routingDestId) ?? null;
  }, [snapshot, routingDestId]);

  const handleToggleEditMode = () => {
    if (isReadOnly) return;
    if (isEditMode) {
      if (hasUnsavedChanges) {
        const confirmDiscard = window.confirm(
          'Discard all staged changes and exit Edit Mode?\nUnsaved changes will be lost.'
        );
        if (!confirmDiscard) return;
        discardChanges();
      } else {
        exitEditMode();
      }
    } else {
      enterEditMode();
    }
  };

  // Resolve all active PIP signal flows from current snapshot
  const allPipFlows = useMemo(() => {
    if (!snapshot) return [];
    return resolveAllPipSignalFlows(snapshot);
  }, [snapshot]);

  const filteredPipFlows = useMemo(() => {
    return filterPipSignalFlows(allPipFlows, {
      multiviewId: selectedMvFilter,
      searchQuery,
      routeStatus: routeStatusFilter,
      sourceTypeFilter,
    });
  }, [allPipFlows, selectedMvFilter, searchQuery, routeStatusFilter, sourceTypeFilter]);

  const validLawoSources = useMemo(() => {
    if (!snapshot) return [];
    return getValidLawoSourceOptions(snapshot.sources);
  }, [snapshot]);

  const validProcessingSources = useMemo(() => {
    if (!snapshot) return [];
    return getValidProcessingStageOptions(snapshot.sources);
  }, [snapshot]);

  const validTielineSources = useMemo(() => {
    if (!snapshot) return [];
    return getValidTielineOptions(snapshot.sources);
  }, [snapshot]);

  const hasDedicatedLawoDirectory = useMemo(() => {
    if (!snapshot) return false;
    return snapshot.sources.some((s) => s.routeRole === 'lawo_source');
  }, [snapshot]);

  const currentMv = useMemo(
    () => snapshot?.multiviews.find((mv) => mv.id === selectedMv),
    [snapshot, selectedMv]
  );

  const mvOutputs = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.outputs.filter((o) => o.multiviewId === selectedMv);
  }, [snapshot, selectedMv]);

  const derivedDestinations = useMemo(() => {
    if (!snapshot) return [];
    return selectDestinationsForMultiview(snapshot, selectedMv);
  }, [snapshot, selectedMv]);

  const filteredDestinations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return derivedDestinations.filter((row) => {
      const destId = formatDestinationDisplay(row.destination.id).toLowerCase();
      const destNum = String(row.destination.destinationNumber);
      const sourceName = row.source?.name.toLowerCase() ?? '';
      const sourceAlias = getSourceAlias(row.source)?.toLowerCase() ?? '';
      const assignName = row.derivedAssignmentName?.toLowerCase() ?? '';

      if (q) {
        const matches =
          destId.includes(q) ||
          destNum === q ||
          sourceName.includes(q) ||
          sourceAlias.includes(q) ||
          assignName.includes(q);
        if (!matches) return false;
      }

      const isAssigned = Boolean(row.destination.assignedSourceId);
      if (statusFilter === 'ASSIGNED' && !isAssigned) return false;
      if (statusFilter === 'UNASSIGNED' && isAssigned) return false;

      return true;
    });
  }, [derivedDestinations, searchQuery, statusFilter]);

  if (!snapshot || !currentMv) return null;

  // Stage confirmation handlers
  const handleConfirmLawoSource = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly || flow.isLocked) return;
    const pending = pendingLawoEdits[flow.flowKey];
    if (!pending || !flow.tielineId) return;

    const nextLawoId = pending.lawoSourceId ?? null;
    const currentProcIds = flow.processingStages.map((s) => s.id);

    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyPipLawoChainUpdate(base, flow.tielineId!, nextLawoId, currentProcIds, op, ts)
      );
      setPendingLawoEdits((prev) => {
        const next = { ...prev };
        delete next[flow.flowKey];
        return next;
      });
      setFeedbackBanner({
        type: 'success',
        message: `Saved Lawo source stage for ${flow.pipDisplayLabel}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save Lawo source stage.',
      });
    }
  };

  const handleConfirmProcessingStages = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly || flow.isLocked) return;
    const pending = pendingProcessingEdits[flow.flowKey];
    if (!pending || !flow.tielineId) return;

    const nextProcIds = pending.processingStageIds ?? [];
    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyPipLawoChainUpdate(base, flow.tielineId!, flow.lawoSourceId, nextProcIds, op, ts)
      );
      setPendingProcessingEdits((prev) => {
        const next = { ...prev };
        delete next[flow.flowKey];
        return next;
      });
      setFeedbackBanner({
        type: 'success',
        message: `Saved processing stage(s) for ${flow.pipDisplayLabel}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save processing stage.',
      });
    }
  };

  const handleConfirmTieline = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly || flow.isLocked) return;
    const pending = pendingTielineEdits[flow.flowKey];
    if (!pending || !flow.destinationId) return;

    const nextTielineId = pending.tielineId ?? null;
    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyPipTielineStageChange(base, flow.destinationId!, nextTielineId, op, ts)
      );
      setPendingTielineEdits((prev) => {
        const next = { ...prev };
        delete next[flow.flowKey];
        return next;
      });
      setFeedbackBanner({
        type: 'success',
        message: `Saved tieline stage for ${flow.pipDisplayLabel}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save tieline stage.',
      });
    }
  };

  const handleConfirmMvInput = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly || flow.isLocked) return;
    const pending = pendingMvInputEdits[flow.flowKey];
    if (!pending) return;

    const nextDestId = pending.destinationId ?? null;
    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyPipMvInputStageChange(base, flow.outputId, flow.pipId, nextDestId, op, ts)
      );
      setPendingMvInputEdits((prev) => {
        const next = { ...prev };
        delete next[flow.flowKey];
        return next;
      });
      setFeedbackBanner({
        type: 'success',
        message: `Saved MV Input assignment for ${flow.pipDisplayLabel}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save MV Input assignment.',
      });
    }
  };

  const handleSaveFlowAlias = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly || flow.isLocked) return;
    const targetSource = flow.aliasSource;
    if (!targetSource) return;

    const rawAlias = aliasEdits[flow.flowKey] ?? flow.alias ?? '';
    try {
      await saveSourceAlias(targetSource.id, rawAlias);
      setAliasEdits((prev) => {
        const next = { ...prev };
        delete next[flow.flowKey];
        return next;
      });
      setFeedbackBanner({
        type: 'success',
        message: `Saved alias for ${targetSource.name}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save alias.',
      });
    }
  };

  const handleConfirmLock = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly) return;
    const pending = pendingLockEdits[flow.flowKey];
    const availableAt = pending?.availableAt?.trim() ? pending.availableAt.trim() : null;
    const context = pending?.context?.trim() ? pending.context.trim() : null;

    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyPipFlowLockChange(
          base,
          flow.outputId,
          flow.pipId,
          { locked: true, availableAt, context },
          op,
          ts
        )
      );
      setPendingLockEdits((prev) => {
        const next = { ...prev };
        delete next[flow.flowKey];
        return next;
      });
      setFeedbackBanner({
        type: 'success',
        message: `Locked signal flow for ${flow.pipDisplayLabel}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to lock signal flow.',
      });
    }
  };

  const handleUnlockFlow = async (flow: ResolvedPipSignalFlow) => {
    if (isReadOnly) return;
    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyPipFlowLockChange(base, flow.outputId, flow.pipId, { locked: false }, op, ts)
      );
      setFeedbackBanner({
        type: 'success',
        message: `Unlocked signal flow for ${flow.pipDisplayLabel}.`,
      });
    } catch (err) {
      setFeedbackBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to unlock signal flow.',
      });
    }
  };

  return (
    <div className="destination-sources-page signal-flows-page">
      <header className="page-header" style={{ marginBottom: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1 className="page-title">Signal Flows</h1>
            <p className="page-description">
              Documented manual signal paths: Lawo Source → Lawo Processing → Lawo Destination /
              Evertz Tieline → Evertz MV Input → VIP PIP. (Operational tracking only — no live
              router control.)
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {returnTo && focusOutputId && focusPipId && (
              <button
                type="button"
                data-testid="return-to-multiviewers-btn"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (returnMvId) params.set('mvId', returnMvId);
                  params.set('outputId', focusOutputId);
                  params.set('pipId', focusPipId);
                  navigate(`/?${params.toString()}`);
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#1e3a5f',
                  color: '#38bdf8',
                  border: '1px solid #38bdf8',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                ← Return to Multiviewers ({focusOutputId.replace(/^OUT:/, '')} {focusPipId})
              </button>
            )}

            <div className="view-mode-toggle" role="group" aria-label="View Mode">
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'flows' ? 'active' : ''}`}
                onClick={() => setViewMode('flows')}
              >
                Signal Flows
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'display' ? 'active' : ''}`}
                onClick={() => setViewMode('display')}
              >
                Visual Display
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                Table View
              </button>
            </div>

            <button
              type="button"
              className={`toggle-btn ${isEditMode ? 'active' : ''}`}
              onClick={handleToggleEditMode}
              disabled={isReadOnly}
              data-testid="toggle-edit-mode-btn"
              style={{
                borderColor: isEditMode ? '#38bdf8' : undefined,
                color: isReadOnly ? '#64748b' : isEditMode ? '#38bdf8' : undefined,
                fontWeight: 700,
                cursor: isReadOnly ? 'not-allowed' : 'pointer',
              }}
              title={
                isReadOnly
                  ? 'Editing is disabled in shared read-only mode'
                  : isEditMode
                    ? 'Exit edit mode'
                    : 'Enter edit mode to modify destination routing'
              }
            >
              {isReadOnly ? '🔒 Read-Only' : isEditMode ? '✓ Editing Mode' : '✎ Edit Matrix'}
            </button>
          </div>
        </div>
      </header>

      {/* Non-blocking status/error feedback banner */}
      {(feedbackBanner || saveError) && (
        <div
          role="status"
          data-testid="signal-flows-feedback-banner"
          style={{
            marginBottom: '0.75rem',
            padding: '8px 12px',
            borderRadius: '3px',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor:
              saveError || feedbackBanner?.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(34, 197, 94, 0.15)',
            border: `1px solid ${
              saveError || feedbackBanner?.type === 'error' ? '#ef4444' : '#22c55e'
            }`,
            color: saveError || feedbackBanner?.type === 'error' ? '#fca5a5' : '#86efac',
          }}
        >
          <span>{saveError ?? feedbackBanner?.message}</span>
          <button
            type="button"
            onClick={() => {
              setFeedbackBanner(null);
              if (saveError) clearSaveError();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Directory Data Notice when dedicated Lawo source directory has not yet been populated */}
      {viewMode === 'flows' && !hasDedicatedLawoDirectory && (
        <div
          data-testid="lawo-directory-missing-notice"
          style={{
            marginBottom: '0.75rem',
            padding: '7px 12px',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '3px',
            fontSize: '11px',
            color: '#cbd5e1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>
            <strong>Directory Status:</strong> Existing Evertz tieline/source routes are preserved.
            Dedicated Lawo source and Lawo processing device exports have not yet been supplied in{' '}
            <code>VIP-Tracker-Data</code>; unassigned upstream Lawo stages are shown as{' '}
            <strong style={{ color: '#f87171' }}>BLANK</strong> without fabricating source names.
          </span>
        </div>
      )}

      {/* Primary Toolbar: Multiviewer Tabs, Search, and Filters */}
      <div
        className="displays-toolbar"
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div className="mv-selector-tabs" role="tablist" aria-label="Multiview Selection">
          {viewMode === 'flows' && (
            <button
              type="button"
              role="tab"
              aria-selected={selectedMvFilter === 'ALL'}
              className={`mv-tab-btn ${selectedMvFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedMvFilter('ALL')}
            >
              <strong>All VIPs</strong> ({allPipFlows.length} PIPs)
            </button>
          )}
          {snapshot.multiviews.map((mv) => {
            const isTabActive =
              viewMode === 'flows' ? selectedMvFilter === mv.id : selectedMv === mv.id;
            return (
              <button
                key={mv.id}
                type="button"
                role="tab"
                aria-selected={isTabActive}
                className={`mv-tab-btn ${isTabActive ? 'active' : ''}`}
                onClick={() => {
                  setSelectedMv(mv.id);
                  setSelectedMvFilter(mv.id);
                }}
              >
                <strong>{mv.id}</strong> ({mv.inputCapacity} Inputs)
              </button>
            );
          })}
        </div>

        {viewMode === 'flows' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
              className="filter-select"
              aria-label="Filter by Source Type"
              data-testid="signal-flows-source-type-filter"
            >
              <option value="ALL">All Source Types</option>
              <optgroup label="Lawo Device Types">
                {LAWO_DEVICE_TYPES.map((dt) => (
                  <option key={`dt-${dt}`} value={dt}>
                    {dt}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Lawo Vendors">
                {LAWO_VENDORS.map((v) => (
                  <option key={`vendor-${v}`} value={v}>
                    {v}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Evertz Categories">
                {SOURCE_CATEGORIES.map((cat) => (
                  <option key={`cat-${cat}`} value={cat}>
                    {cat}
                  </option>
                ))}
              </optgroup>
            </select>

            <select
              value={routeStatusFilter}
              onChange={(e) =>
                setRouteStatusFilter(e.target.value as 'ALL' | 'ROUTED' | 'UNROUTED')
              }
              className="filter-select"
              aria-label="Filter by Route Status"
              data-testid="signal-flows-route-status-filter"
            >
              <option value="ALL">All Flows (Routed &amp; Unrouted)</option>
              <option value="ROUTED">Routed (Complete)</option>
              <option value="UNROUTED">Unrouted (Has BLANK)</option>
            </select>

            <input
              type="search"
              placeholder="Search Lawo source, alias, UDX/FS, tieline, MV input, PIP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-input search-input"
              style={{ width: '300px' }}
              aria-label="Search signal flows"
              data-testid="signal-flows-search-input"
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ASSIGNED' | 'UNASSIGNED')}
              className="filter-select"
              aria-label="Filter by source status"
            >
              <option value="ALL">All Sources</option>
              <option value="ASSIGNED">Source Assigned</option>
              <option value="UNASSIGNED">Unassigned Source</option>
            </select>
            <input
              type="search"
              placeholder="Search destination, source, assignment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-input search-input"
              style={{ width: '240px' }}
              aria-label="Filter destinations"
            />
          </div>
        )}
      </div>

      {/* ====================================================================
         SIGNAL FLOWS TABLE VIEW (Primary Operational View)
         ==================================================================== */}
      {viewMode === 'flows' && (
        <section aria-label="Signal Flows Table Section">
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table
              className="data-table signal-flows-table"
              aria-label="Signal Flows Table"
              data-testid="signal-flows-table"
            >
              <thead>
                <tr>
                  <th scope="col" style={{ minWidth: '185px' }}>
                    Lawo Source
                  </th>
                  <th scope="col" style={{ minWidth: '165px' }}>
                    → Lawo Processing
                  </th>
                  <th scope="col" style={{ minWidth: '175px' }}>
                    → Lawo Dest / Evertz Tieline
                  </th>
                  <th scope="col" style={{ minWidth: '165px' }}>
                    → Evertz MV Input
                  </th>
                  <th scope="col" style={{ minWidth: '145px' }}>
                    → VIP PIP
                  </th>
                  <th scope="col" style={{ minWidth: '160px' }}>
                    Alias (UMD)
                  </th>
                  <th scope="col" style={{ minWidth: '165px' }}>
                    State &amp; Lock
                  </th>
                  <th scope="col" style={{ minWidth: '130px' }}>
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPipFlows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      No active PIP signal flows match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPipFlows.map((flow) => {
                    const isFocused = focusedFlowKey === flow.flowKey;
                    const pendingLawo = pendingLawoEdits[flow.flowKey];
                    const isEditingLawo = pendingLawo !== undefined;
                    const candidateLawoId = isEditingLawo
                      ? (pendingLawo.lawoSourceId ?? null)
                      : flow.lawoSourceId;

                    // Evaluate duplicate Lawo source warning for either saved or pending selection
                    const activeDuplicateWarning =
                      candidateLawoId && flow.tielineId
                        ? evaluateDuplicateLawoSourceWarning(
                            candidateLawoId,
                            flow.tielineId,
                            snapshot.sources,
                            snapshot.destinations
                          )
                        : flow.duplicateWarning;

                    const pendingProc = pendingProcessingEdits[flow.flowKey];
                    const isEditingProc = pendingProc !== undefined;

                    const pendingTieline = pendingTielineEdits[flow.flowKey];
                    const isEditingTieline = pendingTieline !== undefined;

                    const pendingMvInput = pendingMvInputEdits[flow.flowKey];
                    const isEditingMvInput = pendingMvInput !== undefined;

                    const hasLocalAliasEdit = Object.prototype.hasOwnProperty.call(
                      aliasEdits,
                      flow.flowKey
                    );
                    const currentAliasInput = hasLocalAliasEdit
                      ? aliasEdits[flow.flowKey]
                      : (flow.alias ?? '');
                    const isAliasDirty = currentAliasInput.trim() !== (flow.alias ?? '');

                    const pendingLock = pendingLockEdits[flow.flowKey];
                    const isEditingLock = pendingLock !== undefined;

                    const mvInputOptions = getValidMvInputOptions(
                      snapshot.destinations,
                      flow.multiviewId
                    );

                    const lawoSearchFilter = (pendingLawo?.searchFilter ?? '').trim().toLowerCase();
                    const filteredLawoOptions = validLawoSources.filter((s) => {
                      if (s.id === flow.tielineId) return false;
                      if (!lawoSearchFilter) return true;
                      const dev = inferLawoDeviceType(s) ?? '';
                      const ven = inferLawoVendor(s) ?? '';
                      const al = getSourceAlias(s) ?? '';
                      return (
                        s.name.toLowerCase().includes(lawoSearchFilter) ||
                        al.toLowerCase().includes(lawoSearchFilter) ||
                        dev.toLowerCase().includes(lawoSearchFilter) ||
                        ven.toLowerCase().includes(lawoSearchFilter)
                      );
                    });

                    const tielineSearchFilter = (pendingTieline?.searchFilter ?? '')
                      .trim()
                      .toLowerCase();
                    const filteredTielineOptions = validTielineSources.filter((s) => {
                      if (!tielineSearchFilter) return true;
                      const al = getSourceAlias(s) ?? '';
                      return (
                        s.name.toLowerCase().includes(tielineSearchFilter) ||
                        al.toLowerCase().includes(tielineSearchFilter)
                      );
                    });

                    return (
                      <tr
                        key={flow.flowKey}
                        ref={(el) => {
                          rowRefs.current[flow.flowKey] = el;
                        }}
                        data-testid={`signal-flow-row-${flow.outputId}-${flow.pipId}`}
                        data-flow-key={flow.flowKey}
                        data-incomplete={flow.isUnrouted ? 'true' : 'false'}
                        style={{
                          backgroundColor: isFocused
                            ? 'rgba(56, 189, 248, 0.14)'
                            : flow.isUnrouted
                              ? 'rgba(239, 68, 68, 0.04)'
                              : undefined,
                          outline: isFocused ? '2px solid #38bdf8' : undefined,
                        }}
                      >
                        {/* STAGE 1: LAWO SOURCE */}
                        <td data-testid={`flow-lawo-source-cell-${flow.flowKey}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexWrap: 'wrap',
                              }}
                            >
                              {flow.lawoSourceBlank ? (
                                <span
                                  className="status-badge badge-conflict"
                                  data-testid={`blank-stage-lawo-${flow.flowKey}`}
                                  style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                    color: '#f87171',
                                    border: '1px solid #ef4444',
                                    fontWeight: 800,
                                  }}
                                >
                                  ⚠ BLANK
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: '#f8fafc',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {flow.lawoSource?.name}
                                </span>
                              )}

                              {flow.deviceType && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    padding: '1px 4px',
                                    borderRadius: '2px',
                                    backgroundColor: '#1e293b',
                                    color: '#93c5fd',
                                    border: '1px solid #334155',
                                  }}
                                >
                                  {flow.deviceType}
                                </span>
                              )}
                              {flow.vendor && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    padding: '1px 4px',
                                    borderRadius: '2px',
                                    backgroundColor: '#1e1b4b',
                                    color: '#c4b5fd',
                                    border: '1px solid #312e81',
                                  }}
                                >
                                  {flow.vendor}
                                </span>
                              )}
                            </div>

                            {/* Duplicate Lawo Source Warning */}
                            {activeDuplicateWarning && (
                              <div
                                role="alert"
                                data-testid={`duplicate-lawo-warning-${flow.flowKey}`}
                                style={{
                                  fontSize: '10px',
                                  color: '#fbbf24',
                                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.4)',
                                  borderRadius: '2px',
                                  padding: '2px 5px',
                                  lineHeight: 1.3,
                                }}
                              >
                                ⚠ {activeDuplicateWarning.message}
                              </div>
                            )}

                            {/* Searchable Dropdown for Lawo Source Stage */}
                            {!isReadOnly && !flow.isLocked && flow.tielineId && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {isEditingLawo && (
                                  <input
                                    type="search"
                                    placeholder="Filter Lawo sources..."
                                    aria-label={`Search Lawo sources for ${flow.pipDisplayLabel}`}
                                    data-testid={`search-lawo-source-${flow.flowKey}`}
                                    value={pendingLawo.searchFilter ?? ''}
                                    onChange={(e) =>
                                      setPendingLawoEdits((prev) => ({
                                        ...prev,
                                        [flow.flowKey]: {
                                          ...prev[flow.flowKey],
                                          lawoSourceId:
                                            prev[flow.flowKey]?.lawoSourceId ?? flow.lawoSourceId,
                                          searchFilter: e.target.value,
                                        },
                                      }))
                                    }
                                    style={{
                                      padding: '2px 5px',
                                      fontSize: '10px',
                                      backgroundColor: '#0f172a',
                                      color: '#f8fafc',
                                      border: '1px solid #334155',
                                      borderRadius: '2px',
                                    }}
                                  />
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <select
                                    aria-label={`Lawo Source for ${flow.pipDisplayLabel}`}
                                    data-testid={`select-lawo-source-${flow.flowKey}`}
                                    value={
                                      isEditingLawo
                                        ? (pendingLawo.lawoSourceId ?? '')
                                        : (flow.lawoSourceId ?? '')
                                    }
                                    disabled={isSaving}
                                    onChange={(e) => {
                                      const val = e.target.value
                                        ? (e.target.value as SourceId)
                                        : null;
                                      setPendingLawoEdits((prev) => ({
                                        ...prev,
                                        [flow.flowKey]: {
                                          ...prev[flow.flowKey],
                                          lawoSourceId: val,
                                        },
                                      }));
                                    }}
                                    style={{
                                      padding: '2px 4px',
                                      fontSize: '11px',
                                      backgroundColor: '#141414',
                                      color: '#f8fafc',
                                      border: `1px solid ${isEditingLawo ? '#38bdf8' : '#383838'}`,
                                      borderRadius: '2px',
                                      maxWidth: '145px',
                                    }}
                                  >
                                    <option value="">-- BLANK --</option>
                                    {filteredLawoOptions.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {formatSourceCompact(s)}
                                      </option>
                                    ))}
                                  </select>

                                  {isEditingLawo && (
                                    <>
                                      <button
                                        type="button"
                                        data-testid={`confirm-lawo-source-btn-${flow.flowKey}`}
                                        aria-label={`Confirm Lawo Source for ${flow.pipDisplayLabel}`}
                                        title="Confirm Lawo Source change"
                                        disabled={isSaving}
                                        onClick={() => void handleConfirmLawoSource(flow)}
                                        style={{
                                          padding: '2px 6px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          backgroundColor: '#2864a3',
                                          color: '#ffffff',
                                          border: '1px solid #38bdf8',
                                          borderRadius: '2px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ✓
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`cancel-lawo-source-btn-${flow.flowKey}`}
                                        aria-label={`Cancel Lawo Source edit for ${flow.pipDisplayLabel}`}
                                        title="Cancel change"
                                        onClick={() =>
                                          setPendingLawoEdits((prev) => {
                                            const next = { ...prev };
                                            delete next[flow.flowKey];
                                            return next;
                                          })
                                        }
                                        style={{
                                          padding: '2px 5px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          backgroundColor: '#262626',
                                          color: '#94a3b8',
                                          border: '1px solid #444',
                                          borderRadius: '2px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ×
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* STAGE 2: OPTIONAL LAWO PROCESSING STAGES (UDX, FS, etc.) */}
                        <td data-testid={`flow-processing-cell-${flow.flowKey}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {flow.hasCycle ? (
                              <span className="status-badge badge-conflict">⚠ Circular Chain</span>
                            ) : flow.processingStageHops.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {flow.processingStageHops.map((hop, idx) => (
                                  <span
                                    key={`${hop.source.id}-${idx}`}
                                    style={{
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      color: '#38bdf8',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {hop.displayLabel}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                Direct (None)
                              </span>
                            )}

                            {!isReadOnly && !flow.isLocked && flow.tielineId && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select
                                  aria-label={`Processing Stage for ${flow.pipDisplayLabel}`}
                                  data-testid={`select-processing-${flow.flowKey}`}
                                  value={
                                    isEditingProc
                                      ? (pendingProc.processingStageIds?.[0] ?? '')
                                      : (flow.processingStages[0]?.id ?? '')
                                  }
                                  disabled={isSaving}
                                  onChange={(e) => {
                                    const val = e.target.value ? [e.target.value as SourceId] : [];
                                    setPendingProcessingEdits((prev) => ({
                                      ...prev,
                                      [flow.flowKey]: {
                                        processingStageIds: val,
                                      },
                                    }));
                                  }}
                                  style={{
                                    padding: '2px 4px',
                                    fontSize: '10px',
                                    backgroundColor: '#141414',
                                    color: '#cbd5e1',
                                    border: `1px solid ${isEditingProc ? '#38bdf8' : '#383838'}`,
                                    borderRadius: '2px',
                                    maxWidth: '130px',
                                  }}
                                >
                                  <option value="">-- Direct (No Proc) --</option>
                                  {validProcessingSources.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({inferLawoDeviceType(s) ?? 'Processing'})
                                    </option>
                                  ))}
                                </select>

                                {isEditingProc && (
                                  <>
                                    <button
                                      type="button"
                                      data-testid={`confirm-processing-btn-${flow.flowKey}`}
                                      title="Confirm Processing Stage change"
                                      disabled={isSaving}
                                      onClick={() => void handleConfirmProcessingStages(flow)}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        backgroundColor: '#2864a3',
                                        color: '#ffffff',
                                        border: '1px solid #38bdf8',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`cancel-processing-btn-${flow.flowKey}`}
                                      title="Cancel Processing Stage change"
                                      onClick={() =>
                                        setPendingProcessingEdits((prev) => {
                                          const next = { ...prev };
                                          delete next[flow.flowKey];
                                          return next;
                                        })
                                      }
                                      style={{
                                        padding: '2px 5px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        backgroundColor: '#262626',
                                        color: '#94a3b8',
                                        border: '1px solid #444',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ×
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* STAGE 3: LAWO DESTINATION / EVERTZ TIELINE */}
                        <td data-testid={`flow-tieline-cell-${flow.flowKey}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div>
                              {flow.tielineBlank ? (
                                <span
                                  className="status-badge badge-conflict"
                                  data-testid={`blank-stage-tieline-${flow.flowKey}`}
                                  style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                    color: '#f87171',
                                    border: '1px solid #ef4444',
                                    fontWeight: 800,
                                  }}
                                >
                                  ⚠ BLANK
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: '#f8fafc',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {flow.tielineSource?.name}
                                </span>
                              )}
                            </div>

                            {!isReadOnly && !flow.isLocked && flow.destinationId && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {isEditingTieline && (
                                  <input
                                    type="search"
                                    placeholder="Filter tielines..."
                                    aria-label={`Search tielines for ${flow.pipDisplayLabel}`}
                                    data-testid={`search-tieline-${flow.flowKey}`}
                                    value={pendingTieline.searchFilter ?? ''}
                                    onChange={(e) =>
                                      setPendingTielineEdits((prev) => ({
                                        ...prev,
                                        [flow.flowKey]: {
                                          ...prev[flow.flowKey],
                                          tielineId:
                                            prev[flow.flowKey]?.tielineId ?? flow.tielineId,
                                          searchFilter: e.target.value,
                                        },
                                      }))
                                    }
                                    style={{
                                      padding: '2px 5px',
                                      fontSize: '10px',
                                      backgroundColor: '#0f172a',
                                      color: '#f8fafc',
                                      border: '1px solid #334155',
                                      borderRadius: '2px',
                                    }}
                                  />
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <select
                                    aria-label={`Tieline for ${flow.pipDisplayLabel}`}
                                    data-testid={`select-tieline-${flow.flowKey}`}
                                    value={
                                      isEditingTieline
                                        ? (pendingTieline.tielineId ?? '')
                                        : (flow.tielineId ?? '')
                                    }
                                    disabled={isSaving}
                                    onChange={(e) => {
                                      const val = e.target.value
                                        ? (e.target.value as SourceId)
                                        : null;
                                      setPendingTielineEdits((prev) => ({
                                        ...prev,
                                        [flow.flowKey]: {
                                          ...prev[flow.flowKey],
                                          tielineId: val,
                                        },
                                      }));
                                    }}
                                    style={{
                                      padding: '2px 4px',
                                      fontSize: '11px',
                                      backgroundColor: '#141414',
                                      color: '#f8fafc',
                                      border: `1px solid ${isEditingTieline ? '#38bdf8' : '#383838'}`,
                                      borderRadius: '2px',
                                      maxWidth: '140px',
                                    }}
                                  >
                                    <option value="">-- BLANK --</option>
                                    {filteredTielineOptions.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {formatSourceCompact(s)}
                                      </option>
                                    ))}
                                  </select>

                                  {isEditingTieline && (
                                    <>
                                      <button
                                        type="button"
                                        data-testid={`confirm-tieline-btn-${flow.flowKey}`}
                                        aria-label={`Confirm Tieline for ${flow.pipDisplayLabel}`}
                                        title="Confirm Tieline change"
                                        disabled={isSaving}
                                        onClick={() => void handleConfirmTieline(flow)}
                                        style={{
                                          padding: '2px 6px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          backgroundColor: '#2864a3',
                                          color: '#ffffff',
                                          border: '1px solid #38bdf8',
                                          borderRadius: '2px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ✓
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`cancel-tieline-btn-${flow.flowKey}`}
                                        aria-label={`Cancel Tieline edit for ${flow.pipDisplayLabel}`}
                                        title="Cancel Tieline change"
                                        onClick={() =>
                                          setPendingTielineEdits((prev) => {
                                            const next = { ...prev };
                                            delete next[flow.flowKey];
                                            return next;
                                          })
                                        }
                                        style={{
                                          padding: '2px 5px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          backgroundColor: '#262626',
                                          color: '#94a3b8',
                                          border: '1px solid #444',
                                          borderRadius: '2px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ×
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* STAGE 4: EVERTZ MV INPUT */}
                        <td data-testid={`flow-mv-input-cell-${flow.flowKey}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div>
                              {flow.mvInputBlank ? (
                                <span
                                  className="status-badge badge-conflict"
                                  data-testid={`blank-stage-mv-input-${flow.flowKey}`}
                                  style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                    color: '#f87171',
                                    border: '1px solid #ef4444',
                                    fontWeight: 800,
                                  }}
                                >
                                  ⚠ BLANK
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: '#60a5fa',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {flow.mvInputLabel}
                                </span>
                              )}
                            </div>

                            {!isReadOnly && !flow.isLocked && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <select
                                  aria-label={`MV Input for ${flow.pipDisplayLabel}`}
                                  data-testid={`select-mv-input-${flow.flowKey}`}
                                  value={
                                    isEditingMvInput
                                      ? (pendingMvInput.destinationId ?? '')
                                      : (flow.destinationId ?? '')
                                  }
                                  disabled={isSaving}
                                  onChange={(e) => {
                                    const val = e.target.value
                                      ? (e.target.value as DestinationId)
                                      : null;
                                    setPendingMvInputEdits((prev) => ({
                                      ...prev,
                                      [flow.flowKey]: {
                                        destinationId: val,
                                      },
                                    }));
                                  }}
                                  style={{
                                    padding: '2px 4px',
                                    fontSize: '11px',
                                    backgroundColor: '#141414',
                                    color: '#f8fafc',
                                    border: `1px solid ${isEditingMvInput ? '#38bdf8' : '#383838'}`,
                                    borderRadius: '2px',
                                    maxWidth: '135px',
                                  }}
                                >
                                  <option value="">-- BLANK --</option>
                                  {mvInputOptions.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {formatInputDisplay(d.id)}
                                    </option>
                                  ))}
                                </select>

                                {isEditingMvInput && (
                                  <>
                                    <button
                                      type="button"
                                      data-testid={`confirm-mv-input-btn-${flow.flowKey}`}
                                      aria-label={`Confirm MV Input for ${flow.pipDisplayLabel}`}
                                      title="Confirm MV Input change"
                                      disabled={isSaving}
                                      onClick={() => void handleConfirmMvInput(flow)}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        backgroundColor: '#2864a3',
                                        color: '#ffffff',
                                        border: '1px solid #38bdf8',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`cancel-mv-input-btn-${flow.flowKey}`}
                                      aria-label={`Cancel MV Input edit for ${flow.pipDisplayLabel}`}
                                      title="Cancel MV Input change"
                                      onClick={() =>
                                        setPendingMvInputEdits((prev) => {
                                          const next = { ...prev };
                                          delete next[flow.flowKey];
                                          return next;
                                        })
                                      }
                                      style={{
                                        padding: '2px 5px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        backgroundColor: '#262626',
                                        color: '#94a3b8',
                                        border: '1px solid #444',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ×
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* STAGE 5: VIP PIP & MULTIVIEWER CONTEXT */}
                        <td data-testid={`flow-pip-cell-${flow.flowKey}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 800,
                                color: '#f8fafc',
                                fontSize: '12px',
                              }}
                            >
                              {flow.pipDisplayLabel}
                            </span>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                              {flow.multiviewId} • {flow.layoutName}
                            </span>
                            {flow.assignmentName && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: '#fbbf24',
                                  fontWeight: 600,
                                }}
                              >
                                {flow.assignmentName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* ALIAS (UMD) SYNCHRONIZED WITH SOURCE DIRECTORY */}
                        <td data-testid={`flow-alias-cell-${flow.flowKey}`}>
                          {flow.aliasSource ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {flow.alias && (
                                <span
                                  data-testid={`flow-alias-label-${flow.flowKey}`}
                                  style={{
                                    fontSize: '11px',
                                    color: '#38bdf8',
                                    fontWeight: 600,
                                  }}
                                >
                                  {flow.alias}
                                </span>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="text"
                                  aria-label={`Alias for ${flow.pipDisplayLabel}`}
                                  data-testid={`flow-alias-input-${flow.flowKey}`}
                                  value={currentAliasInput}
                                  placeholder="Optional UMD / Alias..."
                                  disabled={isReadOnly || isSaving || flow.isLocked}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAliasEdits((prev) => ({
                                      ...prev,
                                      [flow.flowKey]: val,
                                    }));
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    backgroundColor: '#101010',
                                    border: `1px solid ${isAliasDirty ? '#38bdf8' : '#383838'}`,
                                    borderRadius: '2px',
                                    color: '#ffffff',
                                    width: '115px',
                                  }}
                                />
                                <button
                                  type="button"
                                  data-testid={`save-flow-alias-btn-${flow.flowKey}`}
                                  aria-label={`Save alias for ${flow.pipDisplayLabel}`}
                                  title="Confirm Alias change"
                                  disabled={isReadOnly || isSaving || flow.isLocked}
                                  onClick={() => void handleSaveFlowAlias(flow)}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    backgroundColor: isAliasDirty ? '#2864a3' : '#262626',
                                    color: isAliasDirty ? '#ffffff' : '#cbd5e1',
                                    border: `1px solid ${isAliasDirty ? '#38bdf8' : '#444444'}`,
                                    borderRadius: '2px',
                                    cursor:
                                      isReadOnly || isSaving || flow.isLocked
                                        ? 'not-allowed'
                                        : 'pointer',
                                  }}
                                >
                                  ✓
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#64748b' }}>
                              No source routed
                            </span>
                          )}
                        </td>

                        {/* STATE & WHOLE-FLOW LOCKING */}
                        <td data-testid={`flow-lock-cell-${flow.flowKey}`}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {flow.isComplete ? (
                                <span
                                  className="status-badge badge-assigned"
                                  data-testid={`flow-status-badge-${flow.flowKey}`}
                                >
                                  Routed
                                </span>
                              ) : (
                                <span
                                  className="status-badge badge-conflict"
                                  data-testid={`flow-status-badge-${flow.flowKey}`}
                                >
                                  Incomplete (BLANK)
                                </span>
                              )}

                              {flow.isLocked ? (
                                <span
                                  className="status-badge badge-locked"
                                  data-testid={`flow-locked-badge-${flow.flowKey}`}
                                >
                                  🔒 Locked
                                </span>
                              ) : flow.isLockExpired ? (
                                <span
                                  className="status-badge badge-warning"
                                  data-testid={`flow-lock-expired-badge-${flow.flowKey}`}
                                >
                                  🔓 Lock Expired
                                </span>
                              ) : null}
                            </div>

                            {flow.isLocked && flow.lock && (
                              <div
                                data-testid={`flow-lock-metadata-${flow.flowKey}`}
                                style={{ fontSize: '10px', color: '#c084fc', lineHeight: 1.3 }}
                              >
                                <div>By: {flow.lock.lockedBy ?? 'TECH OPS'}</div>
                                {flow.lock.availableAt && <div>Until: {flow.lock.availableAt}</div>}
                                {flow.lock.context && <div>Note: {flow.lock.context}</div>}
                              </div>
                            )}

                            {!isReadOnly && (
                              <div>
                                {flow.isLocked ? (
                                  <button
                                    type="button"
                                    data-testid={`unlock-flow-btn-${flow.flowKey}`}
                                    onClick={() => void handleUnlockFlow(flow)}
                                    disabled={isSaving}
                                    style={{
                                      padding: '2px 7px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      backgroundColor: '#3b1c1c',
                                      color: '#fca5a5',
                                      border: '1px solid #ef4444',
                                      borderRadius: '2px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Unlock Flow
                                  </button>
                                ) : isEditingLock ? (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '3px',
                                      marginTop: '2px',
                                    }}
                                  >
                                    <input
                                      type="text"
                                      placeholder="Available at (e.g. 2026-10-30 18:00)"
                                      aria-label={`Lock availability time for ${flow.pipDisplayLabel}`}
                                      data-testid={`lock-available-at-input-${flow.flowKey}`}
                                      value={pendingLock.availableAt}
                                      onChange={(e) =>
                                        setPendingLockEdits((prev) => ({
                                          ...prev,
                                          [flow.flowKey]: {
                                            ...prev[flow.flowKey],
                                            availableAt: e.target.value,
                                          },
                                        }))
                                      }
                                      style={{
                                        padding: '2px 5px',
                                        fontSize: '10px',
                                        backgroundColor: '#101010',
                                        color: '#ffffff',
                                        border: '1px solid #9333ea',
                                        borderRadius: '2px',
                                      }}
                                    />
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button
                                        type="button"
                                        data-testid={`confirm-lock-flow-btn-${flow.flowKey}`}
                                        onClick={() => void handleConfirmLock(flow)}
                                        disabled={isSaving}
                                        style={{
                                          padding: '2px 6px',
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          backgroundColor: '#6b21a8',
                                          color: '#ffffff',
                                          border: '1px solid #a855f7',
                                          borderRadius: '2px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ✓ Lock
                                      </button>
                                      <button
                                        type="button"
                                        data-testid={`cancel-lock-flow-btn-${flow.flowKey}`}
                                        onClick={() =>
                                          setPendingLockEdits((prev) => {
                                            const next = { ...prev };
                                            delete next[flow.flowKey];
                                            return next;
                                          })
                                        }
                                        style={{
                                          padding: '2px 5px',
                                          fontSize: '10px',
                                          backgroundColor: '#262626',
                                          color: '#94a3b8',
                                          border: '1px solid #444',
                                          borderRadius: '2px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    data-testid={`lock-flow-btn-${flow.flowKey}`}
                                    onClick={() =>
                                      setPendingLockEdits((prev) => ({
                                        ...prev,
                                        [flow.flowKey]: { availableAt: '', context: '' },
                                      }))
                                    }
                                    style={{
                                      padding: '2px 7px',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                      backgroundColor: '#262626',
                                      color: '#cbd5e1',
                                      border: '1px solid #444',
                                      borderRadius: '2px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    🔒 Lock Flow
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* LAST UPDATED */}
                        <td
                          data-testid={`flow-last-updated-cell-${flow.flowKey}`}
                          style={{ fontSize: '11px', color: '#94a3b8' }}
                        >
                          {flow.lastUpdated ? formatLastChanged(flow.lastUpdated) : 'Not recorded'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ====================================================================
         VISUAL DISPLAY VIEW (Destination Matrix & Active Output Cards)
         ==================================================================== */}
      {(viewMode === 'flows' || viewMode === 'display') && (
        <section aria-label={`${selectedMv} Visual Destination Feed Wall`}>
          {/* Outputs Miniature Feeds for this Multiviewer */}
          <div style={{ marginBottom: '24px' }}>
            <h2
              style={{ fontSize: '14px', fontWeight: 700, color: '#cbd5e1', marginBottom: '12px' }}
            >
              Active Output Feeds ({mvOutputs.length} Outputs on {selectedMv})
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '14px',
              }}
            >
              {mvOutputs.map((out) => (
                <OutputDisplayCard
                  key={out.id}
                  output={out}
                  destinations={snapshot.destinations}
                  sources={snapshot.sources}
                  onClick={() => setSelectedOutput(out)}
                  isSelected={selectedOutput?.id === out.id}
                  isEditable={!isReadOnly}
                  isDraggingInput={Boolean(draggingDestId)}
                  onDropDestinationOnPip={(pipId, destId) => {
                    if (isReadOnly) return;
                    if (!destId.startsWith(`DEST:${out.multiviewId}-`)) return;
                    assignDraftPipInput(out.id, pipId, destId);
                  }}
                  onMovePip={(fromPipId, toPipId) => {
                    if (isReadOnly) return;
                    moveDraftPipInput(out.id, fromPipId, toPipId);
                  }}
                />
              ))}
            </div>
          </div>

          {/* Destination Tiles Matrix */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#cbd5e1', margin: 0 }}>
                Destination Windows Wall ({filteredDestinations.length} of {currentMv.inputCapacity}
                )
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {isEditMode
                  ? 'Drag any destination tile onto an output layout box above, or click Route to patch broadcast sources directly'
                  : 'Drag any destination tile onto an output layout box above, or click output feed for high-res layout inspection'}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
                gap: '8px',
              }}
            >
              {filteredDestinations.map((row) => {
                const dest = row.destination;
                const destDisplay = formatDestinationDisplay(dest.id);
                const hasSource = Boolean(row.source);
                const isDraggingThis = draggingDestId === dest.id;
                const categoryColor = row.source?.category
                  ? getSourceCategoryColor(row.source.category)
                  : undefined;

                return (
                  <div
                    key={dest.id}
                    data-testid={`dest-card-${dest.id}`}
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
                    onClick={() => {
                      if (isEditMode) {
                        setRoutingDestId(dest.id);
                      } else if (row.coveringOutput) {
                        setSelectedOutput(row.coveringOutput);
                      }
                    }}
                    style={{
                      backgroundColor: hasSource ? '#191919' : '#0f0f0f',
                      border: row.hasConflict
                        ? '1px solid var(--ev-status-error)'
                        : isDraggingThis
                          ? '1px solid #38bdf8'
                          : isEditMode
                            ? '1px solid #38bdf8'
                            : hasSource
                              ? '1px solid #363636'
                              : '1px dashed #262626',
                      borderRadius: '2px',
                      padding: '7px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '70px',
                      opacity: isDraggingThis ? 0.6 : 1,
                      cursor: !isReadOnly
                        ? isDraggingThis
                          ? 'grabbing'
                          : 'grab'
                        : row.coveringOutput
                          ? 'pointer'
                          : 'default',
                      transition:
                        'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                      boxShadow: isEditMode
                        ? '0 2px 6px rgba(56, 189, 248, 0.15)'
                        : '0 2px 4px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: isEditMode ? '#38bdf8' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {!isReadOnly && (
                          <span
                            aria-hidden="true"
                            style={{ color: '#475569', fontSize: '9px', letterSpacing: '-1px' }}
                          >
                            ⋮⋮
                          </span>
                        )}
                        {destDisplay}
                      </span>
                      {categoryColor && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: categoryColor,
                          }}
                        />
                      )}
                    </div>

                    <div style={{ textAlign: 'center', margin: '4px 0' }}>
                      {row.source ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1px',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              fontSize: '11px',
                              color: '#f8fafc',
                              wordBreak: 'break-all',
                            }}
                          >
                            {row.source.name}
                          </span>
                          {getSourceAlias(row.source) && (
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#38bdf8',
                                fontWeight: 600,
                                wordBreak: 'break-word',
                              }}
                            >
                              {getSourceAlias(row.source)}
                            </span>
                          )}
                          {row.source.upstreamSourceId && (
                            <span
                              style={{
                                fontSize: '9px',
                                color: '#38bdf8',
                                fontFamily: 'monospace',
                              }}
                              title="Upstream Source"
                            >
                              ↳{' '}
                              {formatSourceCompact(
                                snapshot.sources.find((s) => s.id === row.source?.upstreamSourceId)
                              ) || 'Upstream'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#475569', fontStyle: 'italic' }}>
                          Unassigned
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '9px',
                        color: '#64748b',
                        fontFamily: 'monospace',
                      }}
                    >
                      <span>
                        #{dest.destinationNumber}
                        {isEditMode && row.coveringOutput ? (
                          <span style={{ color: '#fbbf24', marginLeft: '3px' }}>
                            ({formatOutputDisplay(row.coveringOutput.id).replace('OUT:', '')})
                          </span>
                        ) : null}
                      </span>
                      {isEditMode ? (
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                          <button
                            type="button"
                            data-testid={`dest-route-btn-${dest.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoutingDestId(dest.id);
                            }}
                            style={{
                              padding: '1px 5px',
                              fontSize: '9px',
                              fontWeight: 700,
                              backgroundColor: '#2864a3',
                              color: '#ffffff',
                              border: '1px solid #38bdf8',
                              borderRadius: '2px',
                              cursor: 'pointer',
                            }}
                            title={`Route source to ${destDisplay}`}
                          >
                            Route
                          </button>
                          {hasSource && (
                            <button
                              type="button"
                              data-testid={`dest-clear-btn-${dest.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateDraftDestination(
                                  dest.multiviewId,
                                  dest.destinationNumber,
                                  null
                                );
                              }}
                              style={{
                                padding: '1px 4px',
                                fontSize: '9px',
                                fontWeight: 700,
                                backgroundColor: '#262626',
                                color: '#94a3b8',
                                border: '1px solid #444',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                              title="Clear source"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ) : (
                        row.coveringOutput && (
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                            {formatOutputDisplay(row.coveringOutput.id).replace('OUT:', '')}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
         DESTINATION TABLE VIEW
         ==================================================================== */}
      {viewMode === 'table' && (
        <section aria-label={`${selectedMv} Destinations Section`}>
          <div className="table-wrapper">
            <table className="data-table" aria-label={`${selectedMv} Destinations Table`}>
              <thead>
                <tr>
                  <th scope="col" style={{ width: '120px' }}>
                    Destination ID
                  </th>
                  <th scope="col" style={{ width: '80px' }}>
                    Input #
                  </th>
                  <th scope="col">Assigned Source</th>
                  <th scope="col">Derived Layout Assignment</th>
                  <th scope="col">Mapped Output</th>
                  <th scope="col">Lock State</th>
                  <th scope="col">State</th>
                  {isEditMode && (
                    <th scope="col" style={{ width: '100px' }}>
                      Routing
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredDestinations.length === 0 ? (
                  <tr>
                    <td colSpan={isEditMode ? 8 : 7} className="empty-state">
                      No destinations match the filter criteria for {selectedMv}.
                    </td>
                  </tr>
                ) : (
                  filteredDestinations.map((row) => {
                    const dest = row.destination;
                    const destDisplay = formatDestinationDisplay(dest.id);

                    return (
                      <tr
                        key={dest.id}
                        data-testid={`dest-table-row-${dest.id}`}
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
                        style={
                          row.hasConflict
                            ? { backgroundColor: 'rgba(239, 68, 68, 0.08)' }
                            : undefined
                        }
                      >
                        <td className="mono-cell" style={{ fontWeight: 600 }}>
                          {destDisplay}
                        </td>
                        <td className="mono-cell">{dest.destinationNumber}</td>
                        <td>
                          {row.source ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 600 }}>{row.source.name}</span>
                              {getSourceAlias(row.source) && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#38bdf8',
                                    fontWeight: 500,
                                  }}
                                >
                                  {getSourceAlias(row.source)}
                                </span>
                              )}
                              {row.source.upstreamSourceId && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#38bdf8',
                                    fontFamily: 'monospace',
                                  }}
                                  title="Upstream Source"
                                >
                                  ↳ via{' '}
                                  {formatSourceCompact(
                                    snapshot.sources.find(
                                      (s) => s.id === row.source?.upstreamSourceId
                                    )
                                  ) || row.source.upstreamSourceId}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="muted-text" style={{ fontStyle: 'italic' }}>
                              Unassigned (Blank in CSV)
                            </span>
                          )}
                        </td>
                        <td>
                          {row.isAmbiguous ? (
                            <span className="status-badge badge-conflict">
                              {row.derivedAssignmentName}
                            </span>
                          ) : row.derivedAssignmentName ? (
                            <span style={{ fontWeight: 600 }}>{row.derivedAssignmentName}</span>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td>
                          {row.coveringOutput ? (
                            <span className="mono-cell">
                              {formatOutputDisplay(row.coveringOutput.id)} (
                              {row.coveringOutput.layoutName})
                            </span>
                          ) : (
                            <span className="muted-text">None</span>
                          )}
                        </td>
                        <td>
                          {dest.locked ? (
                            <span className="status-badge badge-locked">Locked</span>
                          ) : (
                            <span className="muted-text">Unlocked</span>
                          )}
                        </td>
                        <td>
                          {row.hasConflict ? (
                            <span className="status-badge badge-conflict">
                              {STATE_LABELS.CONFLICT}
                            </span>
                          ) : (row.destination as unknown as { state?: string }).state ===
                              'Available' ||
                            (row.destination as unknown as { state?: string }).state === 'Open' ? (
                            <span className="status-badge badge-available">
                              {STATE_LABELS.AVAILABLE}
                            </span>
                          ) : (row.destination as unknown as { state?: string }).state ===
                              'In Use' ||
                            (row.destination as unknown as { state?: string }).state ===
                              'Patched' ? (
                            <span className="status-badge badge-assigned">
                              {STATE_LABELS.IN_USE}
                            </span>
                          ) : row.source ? (
                            <span className="status-badge badge-assigned">
                              {STATE_LABELS.IN_USE}
                            </span>
                          ) : (
                            <span className="status-badge badge-available">
                              {STATE_LABELS.AVAILABLE}
                            </span>
                          )}
                        </td>
                        {isEditMode && (
                          <td>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <button
                                type="button"
                                data-testid={`table-route-dest-${dest.id}`}
                                onClick={() => setRoutingDestId(dest.id)}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  backgroundColor: '#2864a3',
                                  color: '#ffffff',
                                  border: '1px solid #38bdf8',
                                  borderRadius: '2px',
                                  cursor: 'pointer',
                                }}
                                title={`Route source to ${destDisplay}`}
                              >
                                Route
                              </button>
                              {row.source && (
                                <button
                                  type="button"
                                  data-testid={`table-clear-dest-${dest.id}`}
                                  onClick={() => {
                                    updateDraftDestination(
                                      dest.multiviewId,
                                      dest.destinationNumber,
                                      null
                                    );
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '11px',
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Output Focused Drill-in Modal */}
      {selectedOutput && (
        <OutputDetailModal
          output={snapshot.outputs.find((o) => o.id === selectedOutput.id) ?? selectedOutput}
          destinations={snapshot.destinations}
          sources={snapshot.sources}
          allOutputs={snapshot.outputs}
          onClose={() => setSelectedOutput(null)}
          onSelectOutput={(newOut) => setSelectedOutput(newOut)}
        />
      )}

      {/* Direct Destination Routing Selector Modal */}
      {routingDestination && (
        <SourceRoutingSelectorModal
          isOpen={Boolean(routingDestination)}
          destinationNumber={routingDestination.destinationNumber}
          destinationId={routingDestination.id}
          currentSourceId={routingDestination.assignedSourceId}
          sources={snapshot.sources}
          onApplySource={(sourceId) => {
            updateDraftDestination(
              routingDestination.multiviewId,
              routingDestination.destinationNumber,
              sourceId
            );
            setRoutingDestId(null);
          }}
          onAddNewSource={(newSource) => {
            addDraftSource(newSource);
          }}
          onClose={() => setRoutingDestId(null)}
        />
      )}
    </div>
  );
};
