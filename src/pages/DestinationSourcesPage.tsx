import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { MultiviewId, formatDestinationDisplay, formatOutputDisplay } from '../domain/identifiers';
import { selectDestinationsForMultiview } from '../domain/selectors';
import { OutputDisplayCard } from '../components/multiview/OutputDisplayCard';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { MultiviewOutput } from '../domain/models';
import { getSourceCategoryColor } from '../domain/sourceCategories';

export const DestinationSourcesPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();
  const [selectedMv, setSelectedMv] = useState<MultiviewId>('MV-01');
  const [viewMode, setViewMode] = useState<'display' | 'table'>('display');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');
  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);

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
      const assignName = row.derivedAssignmentName?.toLowerCase() ?? '';

      if (q) {
        const matches =
          destId.includes(q) || destNum === q || sourceName.includes(q) || assignName.includes(q);
        if (!matches) return false;
      }

      const isAssigned = Boolean(row.destination.assignedSourceId);
      if (statusFilter === 'ASSIGNED' && !isAssigned) return false;
      if (statusFilter === 'UNASSIGNED' && isAssigned) return false;

      return true;
    });
  }, [derivedDestinations, searchQuery, statusFilter]);

  if (!snapshot || !currentMv) return null;

  return (
    <div className="destination-sources-page">
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
            <h1 className="page-title">Destination Source Matrix</h1>
            <p className="page-description">
              Multiview destination feeds, routed broadcast sources, and layout mapping for{' '}
              {currentMv.displayName}.
            </p>
          </div>

          <div className="view-mode-toggle" role="group" aria-label="View Mode">
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
        </div>
      </header>

      {/* Primary Interaction: Multiviewer Selector Tabs */}
      <div
        className="displays-toolbar"
        style={{
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div className="mv-selector-tabs" role="tablist" aria-label="Multiview Selection">
          {snapshot.multiviews.map((mv) => (
            <button
              key={mv.id}
              role="tab"
              aria-selected={selectedMv === mv.id}
              className={`mv-tab-btn ${selectedMv === mv.id ? 'active' : ''}`}
              onClick={() => setSelectedMv(mv.id)}
            >
              <strong>{mv.id}</strong> ({mv.destinationCapacity} Inputs)
            </button>
          ))}
        </div>

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
      </div>

      {/* VISUAL DISPLAY VIEW */}
      {viewMode === 'display' && (
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
                Destination Windows Wall ({filteredDestinations.length} of{' '}
                {currentMv.destinationCapacity})
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Click output feed above for high-res layout inspection
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
                const categoryColor = row.source?.category
                  ? getSourceCategoryColor(row.source.category)
                  : undefined;

                return (
                  <div
                    key={dest.id}
                    onClick={() => {
                      if (row.coveringOutput) {
                        setSelectedOutput(row.coveringOutput);
                      }
                    }}
                    style={{
                      backgroundColor: hasSource ? '#111726' : '#0a0e17',
                      border: row.hasConflict
                        ? '1px solid #ef4444'
                        : hasSource
                          ? '1px solid #233044'
                          : '1px dashed #1e293b',
                      borderRadius: '6px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '75px',
                      cursor: row.coveringOutput ? 'pointer' : 'default',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    }}
                    title={
                      row.coveringOutput
                        ? `Covered by ${formatOutputDisplay(row.coveringOutput.id)} (${row.coveringOutput.assignmentName || 'Assigned'})`
                        : undefined
                    }
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
                          color: '#64748b',
                        }}
                      >
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
                      <span>#{dest.destinationNumber}</span>
                      {row.coveringOutput && (
                        <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                          {formatOutputDisplay(row.coveringOutput.id).replace('OUT:', '')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* TABLE VIEW */}
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
        </section>
      )}

      {/* Output Focused Drill-in Modal */}
      {selectedOutput && (
        <OutputDetailModal
          output={selectedOutput}
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
