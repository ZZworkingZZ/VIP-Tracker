import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { formatOutputDisplay } from '../domain/identifiers';
import { STANDARD_LAYOUTS } from '../domain/layoutDefinitions';
import { LayoutRenderer } from '../components/multiview/LayoutRenderer';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { MultiviewOutput } from '../domain/models';

type SortField = 'multiview' | 'outputNumber' | 'assignment' | 'destinationStart';
type SortDirection = 'asc' | 'desc';

export const LayoutAssignmentsPage: React.FC = () => {
  const { activeSnapshot } = useTrackerSnapshot();
  const snapshot = activeSnapshot;

  const [viewMode, setViewMode] = useState<'display' | 'table'>('display');
  const [layoutCategoryFilter, setLayoutCategoryFilter] = useState<string>('ALL');
  const [inUseOnly, setInUseOnly] = useState<boolean>(false);
  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);

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

  // Filtered layouts for library
  const filteredLibraryLayouts = useMemo(() => {
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
        } else if (sortField === 'destinationStart') {
          const aStart = a.destinationStart ?? 9999;
          const bStart = b.destinationStart ?? 9999;
          comp = aStart - bStart;
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
      </header>

      {/* VISUAL LAYOUT LIBRARY VIEW */}
      {viewMode === 'display' && (
        <section aria-label="Layout Geometry Library">
          {/* Controls Bar for Library */}
          <div className="displays-toolbar" style={{ marginBottom: '1.5rem' }}>
            <div className="mv-selector-tabs" role="tablist" aria-label="Layout Categories">
              {['ALL', 'Standard Grid', 'Hero Split', 'High Density', 'Audio / Metering'].map(
                (cat) => (
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
                )
              )}
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

          {/* Layout Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredLibraryLayouts.map((layout) => {
              const activeOutputs = outputsByLayout.get(layout.name.toUpperCase()) ?? [];
              const isInUse = activeOutputs.length > 0;

              return (
                <article
                  key={layout.id}
                  className="layout-card"
                  style={{
                    backgroundColor: '#1c1c1c',
                    border: '1px solid #363636',
                    borderRadius: '3px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
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
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      {layout.name}
                    </h3>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '2px',
                        backgroundColor: 'rgba(40, 100, 163, 0.35)',
                        color: '#60a5fa',
                        border: '1px solid rgba(40, 100, 163, 0.5)',
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
                      minHeight: '30px',
                    }}
                  >
                    {layout.description}
                  </p>

                  {/* Active Outputs List */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '8px',
                      borderTop: '1px solid #2a2a2a',
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
            })}
          </div>
        </section>
      )}

      {/* TABLE VIEW: Engineering Spreadsheet Table */}
      {viewMode === 'table' && (
        <section aria-label="Output Spreadsheet Table">
          {/* Filter and Control Bar */}
          <section className="controls-bar" aria-label="Output Filters">
            <div className="control-group">
              <label htmlFor="filter-mv" className="control-label">
                Multiview
              </label>
              <select
                id="filter-mv"
                className="filter-select"
                value={selectedMv}
                onChange={(e) => setSelectedMv(e.target.value)}
              >
                <option value="ALL">All Multiviews</option>
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
                Lock State
              </label>
              <select
                id="filter-lock"
                className="filter-select"
                value={selectedLock}
                onChange={(e) => setSelectedLock(e.target.value)}
              >
                <option value="ALL">All</option>
                <option value="LOCKED">Locked</option>
                <option value="UNLOCKED">Unlocked</option>
              </select>
            </div>

            <div className="control-group" style={{ flex: 1 }}>
              <label htmlFor="filter-search" className="control-label">
                Search Assignment / Output
              </label>
              <input
                id="filter-search"
                type="search"
                className="search-input"
                placeholder="e.g. BR ALERT, MV-03-01..."
                value={searchAssignment}
                onChange={(e) => setSearchAssignment(e.target.value)}
              />
            </div>
          </section>

          {/* Outputs Table */}
          <div className="table-wrapper">
            <table className="data-table" aria-label="Multiview Outputs Table">
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (sortField === 'outputNumber') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('outputNumber');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    Output{' '}
                    {sortField === 'outputNumber' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (sortField === 'multiview') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('multiview');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    Multiview{' '}
                    {sortField === 'multiview' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th scope="col">Layout</th>
                  <th
                    scope="col"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (sortField === 'destinationStart') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('destinationStart');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    Dest Range{' '}
                    {sortField === 'destinationStart' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (sortField === 'assignment') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('assignment');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    Assignment{' '}
                    {sortField === 'assignment' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Lock</th>
                  <th scope="col">Validation Findings</th>
                  <th scope="col">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutputs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      No outputs match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOutputs.map((out) => {
                    const isAssigned = out.status === 'Assigned';
                    const outFindings = findings.filter(
                      (f) => f.entityId === out.id || f.relatedEntityIds.includes(out.id)
                    );

                    return (
                      <tr key={out.id}>
                        <td className="mono-cell" style={{ fontWeight: 600 }}>
                          {formatOutputDisplay(out.id)}
                        </td>
                        <td>{out.multiviewId}</td>
                        <td>
                          {out.layoutName ? (
                            <strong>{out.layoutName}</strong>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td className="mono-cell">
                          {out.destinationStart !== null && out.destinationEnd !== null ? (
                            out.destinationStart === out.destinationEnd ? (
                              `${out.destinationStart}`
                            ) : (
                              `${out.destinationStart}–${out.destinationEnd}`
                            )
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td>
                          {out.assignmentName ? (
                            <span style={{ fontWeight: 600 }}>{out.assignmentName}</span>
                          ) : (
                            <span className="muted-text" style={{ fontStyle: 'italic' }}>
                              Available
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${
                              isAssigned ? 'badge-assigned' : 'badge-available'
                            }`}
                          >
                            {out.status}
                          </span>
                        </td>
                        <td>
                          {out.locked ? (
                            <span className="status-badge badge-locked">Locked</span>
                          ) : (
                            <span className="muted-text">Unlocked</span>
                          )}
                        </td>
                        <td>
                          {outFindings.length > 0 ? (
                            outFindings.map((f) => (
                              <span
                                key={f.id}
                                className={`status-badge ${
                                  f.severity === 'error'
                                    ? 'badge-conflict'
                                    : f.severity === 'warning'
                                      ? 'badge-warning'
                                      : 'badge-assigned'
                                }`}
                                title={f.message}
                                style={{ marginRight: 4 }}
                              >
                                {f.code}
                              </span>
                            ))
                          ) : (
                            <span className="muted-text">OK</span>
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
    </div>
  );
};
