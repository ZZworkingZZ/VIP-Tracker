import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { formatOutputDisplay } from '../domain/identifiers';
import { STANDARD_LAYOUTS, LayoutDefinition } from '../domain/layoutDefinitions';
import { LayoutRenderer } from '../components/multiview/LayoutRenderer';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { CustomLayoutDesignerModal } from '../components/multiview/CustomLayoutDesignerModal';
import { MultiviewOutput } from '../domain/models';

type SortField = 'multiview' | 'outputNumber' | 'assignment';
type SortDirection = 'asc' | 'desc';

export const LayoutAssignmentsPage: React.FC = () => {
  const {
    activeSnapshot,
    customLayouts = [],
    saveCustomLayout,
    deleteCustomLayout,
    updateDraftOutput,
  } = useTrackerSnapshot();
  const snapshot = activeSnapshot;

  const [viewMode, setViewMode] = useState<'display' | 'table'>('display');
  const [layoutCategoryFilter, setLayoutCategoryFilter] = useState<string>('ALL');
  const [inUseOnly, setInUseOnly] = useState<boolean>(false);
  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);

  // Designer & Custom Layouts state
  const [isDesignerOpen, setIsDesignerOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<LayoutDefinition | null>(null);
  const [integrityWarning, setIntegrityWarning] = useState<{
    layoutName: string;
    outputs: MultiviewOutput[];
  } | null>(null);
  const [deleteConfirmLayout, setDeleteConfirmLayout] = useState<LayoutDefinition | null>(null);
  const [renameTarget, setRenameTarget] = useState<LayoutDefinition | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Table filters
  const [selectedMv, setSelectedMv] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLock, setSelectedLock] = useState<string>('ALL');
  const [selectedLayout, setSelectedLayout] = useState<string>('ALL');
  const [searchAssignment, setSearchAssignment] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('outputNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const outputs = useMemo(() => snapshot?.outputs ?? [], [snapshot]);
  const findings = useMemo(() => snapshot?.validationFindings ?? [], [snapshot]);

  // Group outputs by layout name
  const outputsByLayout = useMemo(() => {
    const map = new Map<string, MultiviewOutput[]>();
    outputs.forEach((out) => {
      if (out.layoutName) {
        const norm = out.layoutName.trim().toUpperCase();
        const list = map.get(norm) ?? [];
        list.push(out);
        map.set(norm, list);
      }
    });
    return map;
  }, [outputs]);

  // Unique layouts for filter dropdown
  const uniqueLayouts = useMemo(() => {
    const set = new Set<string>();
    outputs.forEach((o) => {
      if (o.layoutName) set.add(o.layoutName);
    });
    return Array.from(set).sort();
  }, [outputs]);

  // Filtered standard layouts for library
  const filteredStandardLayouts = useMemo(() => {
    return STANDARD_LAYOUTS.filter((layout) => {
      if (layoutCategoryFilter !== 'ALL' && layout.category !== layoutCategoryFilter) {
        return false;
      }
      if (inUseOnly) {
        const matching = outputsByLayout.get(layout.name.toUpperCase());
        return matching && matching.length > 0;
      }
      return true;
    });
  }, [layoutCategoryFilter, inUseOnly, outputsByLayout]);

  // Filtered custom layouts for library
  const filteredCustomLayouts = useMemo(() => {
    return customLayouts.filter((layout) => {
      if (layoutCategoryFilter !== 'ALL' && layout.category !== layoutCategoryFilter) {
        return false;
      }
      if (inUseOnly) {
        const matching = outputsByLayout.get(layout.name.toUpperCase());
        return matching && matching.length > 0;
      }
      return true;
    });
  }, [customLayouts, layoutCategoryFilter, inUseOnly, outputsByLayout]);

  // Handle custom layout deletion request with reference integrity check
  const handleDeleteLayoutClick = (layout: LayoutDefinition) => {
    const activeOutputs = outputsByLayout.get(layout.name.toUpperCase()) ?? [];
    if (activeOutputs.length > 0) {
      setIntegrityWarning({ layoutName: layout.name, outputs: activeOutputs });
    } else {
      setDeleteConfirmLayout(layout);
    }
  };

  // Confirm deletion of unused custom layout
  const handleConfirmDelete = async () => {
    if (!deleteConfirmLayout) return;
    await deleteCustomLayout(deleteConfirmLayout.id);
    setDeleteConfirmLayout(null);
  };

  // Duplicate a custom layout
  const handleDuplicateLayout = async (layout: LayoutDefinition) => {
    let copyName = `${layout.name} (Copy)`;
    let counter = 1;
    const allNames = new Set([
      ...STANDARD_LAYOUTS.map((l) => l.name.toUpperCase()),
      ...customLayouts.map((l) => l.name.toUpperCase()),
    ]);
    while (allNames.has(copyName.toUpperCase())) {
      counter++;
      copyName = `${layout.name} (Copy ${counter})`;
    }

    const copy: LayoutDefinition = {
      ...layout,
      id: `custom-${copyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: copyName,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCustomLayout(copy);
  };

  // Confirm rename of custom layout
  const handleConfirmRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Layout name cannot be empty.');
      return;
    }
    const allNames = [
      ...STANDARD_LAYOUTS.map((l) => l.name.toUpperCase()),
      ...customLayouts.map((l) => l.name.toUpperCase()),
    ];
    if (
      trimmed.toUpperCase() !== renameTarget.name.toUpperCase() &&
      allNames.includes(trimmed.toUpperCase())
    ) {
      setRenameError(`A layout named "${trimmed}" already exists.`);
      return;
    }

    const updated: LayoutDefinition = {
      ...renameTarget,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await saveCustomLayout(updated);

    // If outputs currently use this layout name, update their layoutName reference
    const matching = outputs.filter(
      (o) => o.layoutName?.toUpperCase() === renameTarget.name.toUpperCase()
    );
    for (const out of matching) {
      updateDraftOutput({ ...out, layoutName: trimmed });
    }

    setRenameTarget(null);
    setRenameValue('');
    setRenameError(null);
  };

  // Filtered and sorted outputs for table view
  const filteredOutputs = useMemo(() => {
    return outputs
      .filter((out) => {
        if (selectedMv !== 'ALL' && out.multiviewId !== selectedMv) return false;
        if (selectedStatus !== 'ALL' && out.status !== selectedStatus) return false;
        if (selectedLock === 'LOCKED' && !out.locked) return false;
        if (selectedLock === 'UNLOCKED' && out.locked) return false;
        if (selectedLayout !== 'ALL' && out.layoutName !== selectedLayout) return false;
        if (searchAssignment) {
          const query = searchAssignment.toLowerCase();
          const matchAssignment = out.assignmentName?.toLowerCase().includes(query);
          const matchId = formatOutputDisplay(out.id).toLowerCase().includes(query);
          if (!matchAssignment && !matchId) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === 'multiview') {
          comp = a.multiviewId.localeCompare(b.multiviewId);
        } else if (sortField === 'outputNumber') {
          if (a.multiviewId !== b.multiviewId) {
            comp = a.multiviewId.localeCompare(b.multiviewId);
          } else {
            comp = a.outputNumber - b.outputNumber;
          }
        } else if (sortField === 'assignment') {
          const aName = a.assignmentName ?? '';
          const bName = b.assignmentName ?? '';
          comp = aName.localeCompare(bName);
        }
        return sortDirection === 'asc' ? comp : -comp;
      });
  }, [
    outputs,
    selectedMv,
    selectedStatus,
    selectedLock,
    selectedLayout,
    searchAssignment,
    sortField,
    sortDirection,
  ]);

  if (!snapshot) return null;

  // Render a layout card (shared for standard and custom layouts)
  const renderLayoutCard = (layout: LayoutDefinition, isCustom: boolean) => {
    const activeOutputs = outputsByLayout.get(layout.name.toUpperCase()) ?? [];
    const isInUse = activeOutputs.length > 0;

    return (
      <article
        key={layout.id}
        className="layout-card"
        data-testid={`layout-card-${layout.id}`}
        style={{
          backgroundColor: '#1c1c1c',
          border: isCustom ? '1px solid #2563eb' : '1px solid #363636',
          borderRadius: '3px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          position: 'relative',
        }}
      >
        {/* Thumbnail Preview */}
        <div style={{ marginBottom: '10px' }}>
          <LayoutRenderer layout={layout} mode="thumbnail" />
        </div>

        {/* Layout Title & Category */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={layout.name}
            >
              {layout.name}
            </h3>
            {isCustom && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '1px 4px',
                  borderRadius: '2px',
                  backgroundColor: 'rgba(59, 130, 246, 0.25)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  letterSpacing: '0.04em',
                }}
              >
                CUSTOM
              </span>
            )}
          </div>

          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '2px',
              backgroundColor: 'rgba(40, 100, 163, 0.35)',
              color: '#60a5fa',
              border: '1px solid rgba(40, 100, 163, 0.5)',
              whiteSpace: 'nowrap',
            }}
          >
            {layout.category}
          </span>
        </div>

        <p
          style={{
            margin: '0 0 10px 0',
            fontSize: '11px',
            color: '#a0a0a0',
            minHeight: '28px',
          }}
        >
          {layout.description}
        </p>

        {/* Custom Layout Action Buttons (Edit, Rename, Duplicate, Delete) */}
        {isCustom && (
          <div
            style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: '1px solid #2a2a2a',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setEditingLayout(layout);
                setIsDesignerOpen(true);
              }}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#262626',
                color: '#cbd5e1',
                border: '1px solid #404040',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
              data-testid={`edit-layout-${layout.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setRenameTarget(layout);
                setRenameValue(layout.name);
                setRenameError(null);
              }}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#262626',
                color: '#cbd5e1',
                border: '1px solid #404040',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
              data-testid={`rename-layout-${layout.id}`}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => handleDuplicateLayout(layout)}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#262626',
                color: '#cbd5e1',
                border: '1px solid #404040',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
              data-testid={`duplicate-layout-${layout.id}`}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => handleDeleteLayoutClick(layout)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
              data-testid={`delete-layout-${layout.id}`}
              title="Delete custom layout"
            >
              Delete
            </button>
          </div>
        )}

        {/* Active Outputs List */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: isCustom ? '0' : '8px',
            borderTop: isCustom ? 'none' : '1px solid #2a2a2a',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              marginBottom: '6px',
            }}
          >
            <span style={{ color: '#858585' }}>Assigned Outputs:</span>
            <span
              style={{
                fontWeight: 700,
                color: isInUse ? '#54d54a' : '#666666',
              }}
            >
              {activeOutputs.length} Output{activeOutputs.length === 1 ? '' : 's'}
            </span>
          </div>

          {isInUse ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {activeOutputs.map((out) => (
                <button
                  key={out.id}
                  type="button"
                  onClick={() => setSelectedOutput(out)}
                  style={{
                    padding: '2px 5px',
                    borderRadius: '2px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: '#282828',
                    color: '#f59e0b',
                    border: '1px solid #444444',
                    cursor: 'pointer',
                  }}
                  title={`Inspect ${formatOutputDisplay(out.id)} (${out.assignmentName || 'Assigned'})`}
                >
                  {formatOutputDisplay(out.id)}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: '#555555', fontStyle: 'italic' }}>
              Available in library (not active)
            </span>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="layout-assignments-page">
      <header className="page-header" style={{ marginBottom: '1.25rem' }}>
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
            <h1 className="page-title">Multiview Layouts &amp; Assignments</h1>
            <p className="page-description">
              Visual Evertz layout library and assignment tracking across all 32 multiview physical
              outputs.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Create Custom Layout Action Button */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingLayout(null);
                setIsDesignerOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: '1px solid #3b82f6',
                borderRadius: '3px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.4)',
              }}
              data-testid="create-custom-layout-button"
            >
              + Create Custom Layout
            </button>

            {/* Display View / Table View Toggle */}
            <div className="view-mode-toggle" role="group" aria-label="View Mode">
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'display' ? 'active' : ''}`}
                onClick={() => setViewMode('display')}
              >
                Visual Library
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                Table View
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* VISUAL LAYOUT LIBRARY VIEW */}
      {viewMode === 'display' && (
        <section aria-label="Layout Geometry Library">
          {/* Controls Bar for Library */}
          <div className="displays-toolbar" style={{ marginBottom: '1.5rem' }}>
            <div className="mv-selector-tabs" role="tablist" aria-label="Layout Categories">
              {[
                'ALL',
                'Standard Grid',
                'Hero Split',
                'High Density',
                'Audio / Metering',
                'Custom',
              ].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={layoutCategoryFilter === cat}
                  className={`mv-tab-btn ${layoutCategoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setLayoutCategoryFilter(cat)}
                >
                  {cat === 'ALL' ? 'All Layouts' : cat}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={inUseOnly}
                  onChange={(e) => setInUseOnly(e.target.checked)}
                />
                In-Use Layouts Only
              </label>
            </div>
          </div>

          {/* SECTION 1: STANDARD LAYOUTS */}
          <section aria-label="Standard Layouts Section" style={{ marginBottom: '2.5rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px',
                borderBottom: '1px solid #282828',
                paddingBottom: '8px',
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  margin: 0,
                  color: '#f8fafc',
                  letterSpacing: '0.04em',
                }}
              >
                STANDARD LAYOUTS
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: '#262626',
                  color: '#94a3b8',
                }}
              >
                {filteredStandardLayouts.length}
              </span>
            </div>

            {filteredStandardLayouts.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  backgroundColor: '#181818',
                  border: '1px solid #282828',
                  borderRadius: '3px',
                  color: '#71717a',
                  fontSize: '13px',
                }}
              >
                No standard layouts match the active filters.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '16px',
                }}
              >
                {filteredStandardLayouts.map((layout) => renderLayoutCard(layout, false))}
              </div>
            )}
          </section>

          {/* SECTION 2: CUSTOM LAYOUTS */}
          <section aria-label="Custom Layouts Section">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                borderBottom: '1px solid #282828',
                paddingBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    margin: 0,
                    color: '#60a5fa',
                    letterSpacing: '0.04em',
                  }}
                >
                  CUSTOM LAYOUTS
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa',
                  }}
                >
                  {filteredCustomLayouts.length}
                </span>
              </div>
            </div>

            {filteredCustomLayouts.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  backgroundColor: '#181818',
                  border: '1px dashed #333333',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#94a3b8',
                }}
              >
                <p style={{ margin: '0 0 14px 0', fontSize: '13px' }}>
                  {customLayouts.length === 0
                    ? 'No custom layouts created yet. Use the Custom Layout Designer to build tailored multiview configurations.'
                    : 'No custom layouts match the active category or in-use filters.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingLayout(null);
                    setIsDesignerOpen(true);
                  }}
                  style={{
                    padding: '7px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: '1px solid #3b82f6',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  + Create Custom Layout
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '16px',
                }}
              >
                {filteredCustomLayouts.map((layout) => renderLayoutCard(layout, true))}
              </div>
            )}
          </section>
        </section>
      )}

      {/* TABLE VIEW: Engineering Spreadsheet Table */}
      {viewMode === 'table' && (
        <section aria-label="Output Spreadsheet Table">
          {/* Filter and Control Bar */}
          <section className="controls-bar" aria-label="Output Filters">
            <div className="control-group">
              <label htmlFor="filter-mv" className="control-label">
                MV
              </label>
              <select
                id="filter-mv"
                className="filter-select"
                value={selectedMv}
                onChange={(e) => setSelectedMv(e.target.value)}
              >
                <option value="ALL">All MVs</option>
                {snapshot.multiviews.map((mv) => (
                  <option key={mv.id} value={mv.id}>
                    {mv.id} ({mv.displayName})
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="filter-status" className="control-label">
                Status
              </label>
              <select
                id="filter-status"
                className="filter-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="Assigned">Assigned</option>
                <option value="Available">Available</option>
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="filter-layout" className="control-label">
                Layout
              </label>
              <select
                id="filter-layout"
                className="filter-select"
                value={selectedLayout}
                onChange={(e) => setSelectedLayout(e.target.value)}
              >
                <option value="ALL">All Layouts</option>
                {uniqueLayouts.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="filter-lock" className="control-label">
                Lock
              </label>
              <select
                id="filter-lock"
                className="filter-select"
                value={selectedLock}
                onChange={(e) => setSelectedLock(e.target.value)}
              >
                <option value="ALL">All Locks</option>
                <option value="LOCKED">Locked</option>
                <option value="UNLOCKED">Unlocked</option>
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="filter-search" className="control-label">
                Search
              </label>
              <input
                id="filter-search"
                type="text"
                className="filter-input"
                placeholder="Output or Assignment..."
                value={searchAssignment}
                onChange={(e) => setSearchAssignment(e.target.value)}
              />
            </div>
          </section>

          {/* Spreadsheet Table */}
          <div className="table-responsive">
            <table className="spreadsheet-table" aria-label="Multiview Outputs Table">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="clickable"
                    onClick={() => {
                      if (sortField === 'outputNumber') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('outputNumber');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    Output {sortField === 'outputNumber' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    scope="col"
                    className="clickable"
                    onClick={() => {
                      if (sortField === 'multiview') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('multiview');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    MV {sortField === 'multiview' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Layout</th>
                  <th scope="col">Destination Inputs</th>
                  <th
                    scope="col"
                    className="clickable"
                    onClick={() => {
                      if (sortField === 'assignment') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('assignment');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    Operational Assignment{' '}
                    {sortField === 'assignment' && (sortDirection === 'asc' ? '▲' : '▼')}
                  </th>
                  <th scope="col">Lock</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutputs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-state">
                      No outputs match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredOutputs.map((out) => {
                    const hasError = findings.some(
                      (f) => f.severity === 'error' && f.entityId === out.id
                    );
                    const hasWarning = findings.some(
                      (f) => f.severity === 'warning' && f.entityId === out.id
                    );

                    let rowClass = '';
                    if (hasError) rowClass = 'row-error';
                    else if (hasWarning) rowClass = 'row-warning';

                    return (
                      <tr key={out.id} className={rowClass}>
                        <td className="cell-id">
                          <span className="mono-code">{formatOutputDisplay(out.id)}</span>
                        </td>
                        <td>{out.multiviewId}</td>
                        <td>
                          <span
                            className={`badge badge-${
                              out.status === 'Assigned'
                                ? 'primary'
                                : out.status === 'Reserved'
                                  ? 'warning'
                                  : 'neutral'
                            }`}
                          >
                            {out.status}
                          </span>
                        </td>
                        <td className="cell-layout">
                          {out.layoutName ? (
                            <span className="badge badge-accent">{out.layoutName}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {out.destinationStart && out.destinationEnd ? (
                            <span className="mono-code">
                              {out.destinationStart} &ndash; {out.destinationEnd} (
                              {out.destinationEnd - out.destinationStart + 1} inputs)
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="cell-assignment">
                          {out.assignmentName ? (
                            <strong>{out.assignmentName}</strong>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {out.locked ? (
                            <span className="badge badge-error">LOCKED</span>
                          ) : (
                            <span className="badge badge-neutral">UNLOCKED</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-action-small"
                            onClick={() => setSelectedOutput(out)}
                          >
                            View
                          </button>
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

      {/* Detail Modal */}
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

      {/* Custom Layout Designer Modal */}
      {isDesignerOpen && (
        <CustomLayoutDesignerModal
          isOpen={isDesignerOpen}
          initialLayout={editingLayout}
          existingLayoutNames={[
            ...STANDARD_LAYOUTS.map((l) => l.name),
            ...customLayouts.map((l) => l.name),
          ]}
          onSave={async (newLayout) => {
            await saveCustomLayout(newLayout);
            setIsDesignerOpen(false);
            setEditingLayout(null);
          }}
          onClose={() => {
            setIsDesignerOpen(false);
            setEditingLayout(null);
          }}
        />
      )}

      {/* Reference Integrity Modal (Blocks deletion of in-use custom layout) */}
      {integrityWarning && (
        <div
          className="output-modal-backdrop"
          onClick={() => setIntegrityWarning(null)}
          role="dialog"
          aria-modal="true"
          data-testid="reference-integrity-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            className="output-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#1c1c1c',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              padding: '20px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.8)',
              color: '#e2e8f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                color: '#f87171',
              }}
            >
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Cannot Delete Custom Layout
              </h3>
            </div>

            <p style={{ margin: '0 0 12px 0', fontSize: '13px', lineHeight: 1.5 }}>
              The custom layout <strong>&ldquo;{integrityWarning.layoutName}&rdquo;</strong> is
              currently assigned to{' '}
              <strong>
                {integrityWarning.outputs.length} physical output
                {integrityWarning.outputs.length === 1 ? '' : 's'}
              </strong>
              . To protect operational reference integrity, layouts in active service cannot be
              deleted.
            </p>

            <div
              style={{
                backgroundColor: '#121212',
                border: '1px solid #2a2a2a',
                borderRadius: '3px',
                padding: '10px',
                maxHeight: '160px',
                overflowY: 'auto',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#94a3b8',
                  marginBottom: '6px',
                }}
              >
                Assigned Outputs:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
                {integrityWarning.outputs.map((out) => (
                  <li key={out.id} style={{ marginBottom: '4px' }}>
                    <strong style={{ color: '#f59e0b' }}>{formatOutputDisplay(out.id)}</strong>
                    {out.assignmentName && ` — ${out.assignmentName}`}
                  </li>
                ))}
              </ul>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>
              Please reassign or release these physical outputs before deleting this layout.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIntegrityWarning(null)}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#262626',
                  color: '#ffffff',
                  border: '1px solid #404040',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Unassigned Custom Layout */}
      {deleteConfirmLayout && (
        <div
          className="output-modal-backdrop"
          onClick={() => setDeleteConfirmLayout(null)}
          role="dialog"
          aria-modal="true"
          data-testid="delete-confirm-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            className="output-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '100%',
              backgroundColor: '#1c1c1c',
              border: '1px solid #444444',
              borderRadius: '4px',
              padding: '20px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.8)',
              color: '#e2e8f0',
            }}
          >
            <h3
              style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 700, color: '#f87171' }}
            >
              Delete Custom Layout
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete custom layout{' '}
              <strong>&ldquo;{deleteConfirmLayout.name}&rdquo;</strong>? This action cannot be
              undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmLayout(null)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid #404040',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: '1px solid #ef4444',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
                data-testid="confirm-delete-layout-button"
              >
                Delete Layout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Custom Layout Modal */}
      {renameTarget && (
        <div
          className="output-modal-backdrop"
          onClick={() => {
            setRenameTarget(null);
            setRenameError(null);
          }}
          role="dialog"
          aria-modal="true"
          data-testid="rename-layout-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            className="output-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '440px',
              width: '100%',
              backgroundColor: '#1c1c1c',
              border: '1px solid #444444',
              borderRadius: '4px',
              padding: '20px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.8)',
              color: '#e2e8f0',
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 700 }}>
              Rename Custom Layout
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8' }}>
              Enter a new unique name for layout &ldquo;{renameTarget.name}&rdquo;.
            </p>

            {renameError && (
              <div
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '2px',
                  color: '#f87171',
                  fontSize: '12px',
                  marginBottom: '10px',
                }}
              >
                {renameError}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError(null);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#111111',
                  border: '1px solid #404040',
                  borderRadius: '3px',
                  padding: '6px 8px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
                data-testid="rename-layout-input"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(null);
                  setRenameError(null);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid #404040',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRename}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: '1px solid #3b82f6',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
                data-testid="confirm-rename-button"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
