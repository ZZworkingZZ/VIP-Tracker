import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { formatOutputDisplay } from '../domain/identifiers';

type SortField = 'multiview' | 'outputNumber' | 'assignment' | 'destinationStart';
type SortDirection = 'asc' | 'desc';

export const LayoutAssignmentsPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();

  const [selectedMv, setSelectedMv] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLock, setSelectedLock] = useState<string>('ALL');
  const [selectedLayout, setSelectedLayout] = useState<string>('ALL');
  const [searchAssignment, setSearchAssignment] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('outputNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const outputs = useMemo(() => snapshot?.outputs ?? [], [snapshot]);
  const findings = useMemo(() => snapshot?.validationFindings ?? [], [snapshot]);

  // Unique layouts for filter dropdown
  const uniqueLayouts = useMemo(() => {
    const set = new Set<string>();
    outputs.forEach((o) => {
      if (o.layoutName) set.add(o.layoutName);
    });
    return Array.from(set).sort();
  }, [outputs]);

  // Filtered and sorted outputs
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
      <header className="page-header">
        <h1 className="page-title">Multiview Layouts &amp; Assignments</h1>
        <p className="page-description">
          Tracking all 32 multiview physical outputs, designated box layouts, and mapped destination
          ranges across MV-01 through MV-05.
        </p>
      </header>

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
                Output {sortField === 'outputNumber' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
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
                Multiview {sortField === 'multiview' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
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
                Assignment {sortField === 'assignment' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th scope="col">Status</th>
              <th scope="col">Lock</th>
              <th scope="col">Validation Findings</th>
            </tr>
          </thead>
          <tbody>
            {filteredOutputs.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
