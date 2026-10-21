import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { MultiviewId, formatDestinationDisplay, formatOutputDisplay } from '../domain/identifiers';
import { selectDestinationsForMultiview } from '../domain/selectors';

export const DestinationSourcesPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();
  const [selectedMv, setSelectedMv] = useState<MultiviewId>('MV-01');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');

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
      const assignName = row.derivedAssignmentName?.toLowerCase() ?? '';

      // Text search
      if (q) {
        const matches =
          destId.includes(q) || destNum === q || sourceName.includes(q) || assignName.includes(q);
        if (!matches) return false;
      }

      // Status filter
      const isAssigned = Boolean(row.destination.assignedSourceId);
      if (statusFilter === 'ASSIGNED' && !isAssigned) return false;
      if (statusFilter === 'UNASSIGNED' && isAssigned) return false;

      return true;
    });
  }, [derivedDestinations, searchQuery, statusFilter]);

  if (!snapshot) return null;

  const currentMv = snapshot.multiviews.find((mv) => mv.id === selectedMv);

  return (
    <div className="destination-sources-page">
      <header className="page-header">
        <h1 className="page-title">Destination Source Matrix</h1>
        <p className="page-description">
          Reviewing physical destination inputs, patched router sources, and derived layout
          assignments per multiview frame.
        </p>
      </header>

      {/* Multiview Frame Selector Tabs */}
      <div
        className="controls-bar"
        style={{ padding: '0.5rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}
        role="tablist"
        aria-label="Multiview Frame Selection"
      >
        {snapshot.multiviews.map((mv) => (
          <button
            key={mv.id}
            role="tab"
            aria-selected={selectedMv === mv.id}
            className={`nav-link ${selectedMv === mv.id ? 'active' : ''}`}
            onClick={() => setSelectedMv(mv.id)}
            style={{ cursor: 'pointer', border: '1px solid var(--color-border)' }}
          >
            <strong>{mv.id}</strong> ({mv.destinationCapacity} Inputs)
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <section className="controls-bar" aria-label="Destination Filters">
        <div className="control-group">
          <label htmlFor="dest-status-filter" className="control-label">
            Source Status
          </label>
          <select
            id="dest-status-filter"
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ASSIGNED' | 'UNASSIGNED')}
          >
            <option value="ALL">All Destinations</option>
            <option value="ASSIGNED">Source Assigned</option>
            <option value="UNASSIGNED">Unassigned Source</option>
          </select>
        </div>

        <div className="control-group" style={{ flex: 1 }}>
          <label htmlFor="dest-search" className="control-label">
            Search Destination / Source / Assignment
          </label>
          <input
            id="dest-search"
            type="search"
            className="search-input"
            placeholder="Search by dest #, source name, or layout..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ alignSelf: 'flex-end', paddingBottom: '4px' }}>
          <span className="muted-text" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredDestinations.length}</strong> of{' '}
            <strong>{currentMv?.destinationCapacity}</strong> inputs
          </span>
        </div>
      </section>

      {/* Destination Table */}
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
            </tr>
          </thead>
          <tbody>
            {filteredDestinations.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
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
                    style={
                      row.hasConflict ? { backgroundColor: 'rgba(239, 68, 68, 0.08)' } : undefined
                    }
                  >
                    <td className="mono-cell" style={{ fontWeight: 600 }}>
                      {destDisplay}
                    </td>
                    <td className="mono-cell">{dest.destinationNumber}</td>
                    <td>
                      {row.source ? (
                        <span style={{ fontWeight: 600 }}>{row.source.name}</span>
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
                        <span className="status-badge badge-conflict">Conflict</span>
                      ) : row.source ? (
                        <span className="status-badge badge-assigned">Patched</span>
                      ) : (
                        <span className="status-badge badge-available">Open</span>
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
