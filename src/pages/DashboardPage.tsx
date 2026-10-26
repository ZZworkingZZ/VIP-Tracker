import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { selectDashboardTotals, selectMultiviewSummaries } from '../domain/selectors';
import { formatOutputDisplay } from '../domain/identifiers';
import { MultiviewOutput } from '../domain/models';
import { OutputDisplayCard } from '../components/multiview/OutputDisplayCard';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';

export const DashboardPage: React.FC = () => {
  const {
    activeSnapshot,
    isEditMode,
    hasUnsavedChanges,
    enterEditMode,
    exitEditMode,
    discardChanges,
  } = useTrackerSnapshot();
  const snapshot = activeSnapshot;

  const [viewMode, setViewMode] = useState<'display' | 'table'>('display');
  const [selectedMvFilter, setSelectedMvFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);

  const totals = useMemo(() => (snapshot ? selectDashboardTotals(snapshot) : null), [snapshot]);
  const multiviewSummaries = useMemo(
    () => (snapshot ? selectMultiviewSummaries(snapshot) : []),
    [snapshot]
  );
  const destTotals = useMemo(() => {
    if (!snapshot) return { total: 0, assigned: 0, pct: 0 };
    const total = snapshot.destinations.length;
    const assigned = snapshot.destinations.filter((d) => d.assignedSourceId).length;
    const pct = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return { total, assigned, pct };
  }, [snapshot]);

  // Filter multiview summaries based on MV selection and search query
  const filteredSummaries = useMemo(() => {
    return multiviewSummaries
      .filter((s) => selectedMvFilter === 'ALL' || s.multiview.id === selectedMvFilter)
      .map((s) => {
        if (!searchQuery.trim()) {
          return s;
        }
        const q = searchQuery.toLowerCase();
        const matchingOutputs = s.outputs.filter(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            formatOutputDisplay(o.id).toLowerCase().includes(q) ||
            (o.assignmentName && o.assignmentName.toLowerCase().includes(q)) ||
            (o.layoutName && o.layoutName.toLowerCase().includes(q))
        );
        return {
          ...s,
          outputs: matchingOutputs,
        };
      });
  }, [multiviewSummaries, selectedMvFilter, searchQuery]);

  if (!snapshot || !totals) {
    return null;
  }

  const handleToggleEditMode = () => {
    if (!isEditMode) {
      enterEditMode();
    } else {
      if (hasUnsavedChanges) {
        const confirmDiscard = window.confirm(
          'Discard all staged changes? Any unsaved edits will be lost.'
        );
        if (!confirmDiscard) return;
        discardChanges();
      } else {
        exitEditMode();
      }
    }
  };

  return (
    <div className="dashboard-page displays-view-page">
      <header className="page-header">
        <h1 className="page-title">Multiviewer Displays</h1>
        <p className="page-description">
          Physical output geometry and broadcast destination mappings across MV-01 through MV-05
        </p>
      </header>

      {/* Compact Top Operational Status Strip */}
      <section className="operational-status-strip" aria-label="System Metrics Summary">
        <div className="status-strip-metrics">
          <div className="strip-item">
            <span className="strip-label">Multiviews</span>
            <span className="strip-val">{totals.totalMultiviews}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">Outputs</span>
            <span className="strip-val">
              {totals.totalOutputs}{' '}
              <span className="strip-subval">
                ({totals.assignedOutputs} assigned · {totals.availableOutputs} avail)
              </span>
            </span>
          </div>
          <div className="strip-item">
            <span className="strip-label">Destinations</span>
            <span className="strip-val">
              {destTotals.total}{' '}
              <span className="strip-subval">
                ({destTotals.assigned} active · {destTotals.pct}%)
              </span>
            </span>
          </div>
          <div className="strip-item">
            <span className="strip-label">Warnings</span>
            <span
              className={`strip-val ${
                totals.activeValidationFindings > 0 ? 'highlight-warning' : 'highlight-optimal'
              }`}
            >
              {totals.activeValidationFindings}
            </span>
          </div>
        </div>

        {/* View Mode & Filter Controls */}
        <div className="status-strip-controls">
          {/* Display View vs Table View Toggle */}
          <div className="view-mode-toggle" role="group" aria-label="View Mode">
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'display' ? 'active' : ''}`}
              onClick={() => setViewMode('display')}
            >
              Display View
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
            data-testid="toggle-edit-mode-btn"
            style={{
              borderColor: isEditMode ? '#38bdf8' : undefined,
              color: isEditMode ? '#38bdf8' : undefined,
              fontWeight: 700,
            }}
            title={
              isEditMode ? 'Exit edit mode' : 'Enter edit mode to modify layouts and source routing'
            }
          >
            {isEditMode ? '✓ Editing Mode' : '✎ Edit Displays'}
          </button>
        </div>
      </section>

      {/* Primary Toolbar: MV Selector Tabs & Search */}
      <div className="displays-toolbar">
        <div className="mv-selector-tabs" role="tablist" aria-label="Multiview Selection">
          {['ALL', 'MV-01', 'MV-02', 'MV-03', 'MV-04', 'MV-05'].map((mvId) => (
            <button
              key={mvId}
              type="button"
              role="tab"
              aria-selected={selectedMvFilter === mvId}
              className={`mv-tab-btn ${selectedMvFilter === mvId ? 'active' : ''}`}
              onClick={() => setSelectedMvFilter(mvId)}
            >
              {mvId === 'ALL' ? 'All Displays' : mvId}
            </button>
          ))}
        </div>

        <div className="displays-search">
          <input
            type="search"
            placeholder="Search outputs, layouts, assignments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="filter-input search-input"
            aria-label="Filter displays"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* DISPLAY VIEW: Evertz-Style Multiviewer Display Columns */}
      {viewMode === 'display' && (
        <section className="displays-columns-container" aria-label="Multiviewer Displays Wall">
          <div className="displays-columns-row">
            {filteredSummaries.map((summary) => {
              const mv = summary.multiview;
              return (
                <div key={mv.id} className="evertz-mv-column" data-testid={`mv-column-${mv.id}`}>
                  {/* Column Header */}
                  <div className="mv-column-header">
                    <div className="mv-col-title-row">
                      <h2 className="mv-col-title">{mv.id}</h2>
                      <span className="mv-col-badge">
                        {summary.assignedOutputsCount} / {mv.outputCapacity} Active
                      </span>
                    </div>
                    <div className="mv-col-meta">
                      {mv.inputCapacity} Inputs ·{' '}
                      {summary.conflictCount === 0 ? 'Optimal' : `${summary.conflictCount} Warning`}
                    </div>
                  </div>

                  {/* Output Display Cards Stack */}
                  <div className="mv-column-cards">
                    {summary.outputs.map((out) => (
                      <OutputDisplayCard
                        key={out.id}
                        output={out}
                        destinations={snapshot.destinations}
                        sources={snapshot.sources}
                        onClick={() => setSelectedOutput(out)}
                        isSelected={selectedOutput?.id === out.id}
                      />
                    ))}

                    {summary.outputs.length === 0 && (
                      <div className="no-outputs-match">
                        No outputs match &ldquo;{searchQuery}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TABLE VIEW: Engineering Spreadsheet / Audit Table */}
      {viewMode === 'table' && (
        <section className="displays-table-view" aria-label="Multiview Engineering Table">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Output</th>
                  <th>MV</th>
                  <th>Status</th>
                  <th>Layout</th>
                  <th>Assignment</th>
                  <th>Locked</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaries
                  .flatMap((s) => s.outputs)
                  .map((out) => {
                    const isAssigned = out.status === 'Assigned';
                    return (
                      <tr
                        key={out.id}
                        className={`table-row-${out.status.toLowerCase()} ${
                          selectedOutput?.id === out.id ? 'row-selected' : ''
                        }`}
                        onClick={() => setSelectedOutput(out)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="output-id-mono">{formatOutputDisplay(out.id)}</td>
                        <td>{out.multiviewId}</td>
                        <td>
                          <span
                            className={`status-badge ${
                              isAssigned ? 'badge-assigned' : 'badge-available'
                            }`}
                          >
                            {out.status}
                          </span>
                        </td>
                        <td className="mono-text">{out.layoutName || '—'}</td>
                        <td className="assignment-cell">{out.assignmentName || '—'}</td>
                        <td>
                          {out.locked ? (
                            <span className="status-badge badge-locked">Locked</span>
                          ) : (
                            <span className="muted-text">No</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-action-small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOutput(out);
                            }}
                          >
                            Inspect Display
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Output Focused Drill-in Detail Modal */}
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

      {/* Validation Findings & Warnings Section */}
      {snapshot.validationFindings.length > 0 && (
        <section className="findings-container" aria-label="Validation Findings">
          <h3 className="findings-title">
            <span>Data Observations &amp; Warnings</span>
            <span className="status-badge badge-warning">
              {snapshot.validationFindings.length} Total
            </span>
          </h3>
          <div className="findings-list">
            {snapshot.validationFindings.map((finding) => (
              <div
                key={finding.id}
                className={`finding-item finding-${finding.severity}`}
                role="note"
              >
                <span
                  className={`status-badge ${
                    finding.severity === 'error'
                      ? 'badge-conflict'
                      : finding.severity === 'warning'
                        ? 'badge-warning'
                        : 'badge-assigned'
                  }`}
                >
                  {finding.severity.toUpperCase()}
                </span>
                <span className="finding-message">{finding.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
