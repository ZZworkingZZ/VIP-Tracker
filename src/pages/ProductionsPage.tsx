import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { selectGroupedProductions } from '../domain/selectors';
import { formatOutputDisplay } from '../domain/identifiers';
import { OutputDisplayCard } from '../components/multiview/OutputDisplayCard';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { MultiviewOutput } from '../domain/models';

export const ProductionsPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();
  const [viewMode, setViewMode] = useState<'display' | 'table'>('display');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);

  const productions = useMemo(() => {
    if (!snapshot) return [];
    return selectGroupedProductions(snapshot);
  }, [snapshot]);

  const filteredProductions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return productions;
    return productions.filter(
      (p) =>
        p.assignmentName.toLowerCase().includes(q) ||
        p.multiviewsUsed.some((mv) => mv.toLowerCase().includes(q)) ||
        p.layouts.some((l) => l.toLowerCase().includes(q))
    );
  }, [productions, searchQuery]);

  if (!snapshot) return null;

  return (
    <div className="productions-page assignments-page">
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
            <h1 className="page-title">Operational Assignments</h1>
            <p className="page-description">
              Operational assignment packages across shows, control rooms, test feeds, and
              monitoring setups.
            </p>
          </div>

          <div className="view-mode-toggle" role="group" aria-label="View Mode">
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'display' ? 'active' : ''}`}
              onClick={() => setViewMode('display')}
            >
              Visual Cards
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

      {/* Search and Summary */}
      <section
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
        <div style={{ flex: 1, maxWidth: '420px' }}>
          <input
            id="prod-search"
            type="search"
            className="filter-input search-input"
            placeholder="Search assignments (e.g. HOH, BR ALERT, JXS)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
            aria-label="Filter assignments"
          />
        </div>
        <div>
          <span className="muted-text" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredProductions.length}</strong> distinct operational assignments
          </span>
        </div>
      </section>

      {/* VISUAL CARDS VIEW */}
      {viewMode === 'display' && (
        <section aria-label="Visual Operational Assignments">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {filteredProductions.map((prod) => {
              // Find matching output objects for this assignment
              const matchedOutputs = snapshot.outputs.filter((o) =>
                prod.outputsUsed.includes(o.id)
              );

              return (
                <div
                  key={prod.assignmentName}
                  className="assignment-package-card"
                  style={{
                    backgroundColor: '#1c1c1c',
                    border: '1px solid #363636',
                    borderRadius: '3px',
                    padding: '14px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {/* Package Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '14px',
                      paddingBottom: '10px',
                      borderBottom: '1px solid #282828',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: '16px',
                          fontWeight: 700,
                          color: '#f59e0b',
                          letterSpacing: '-0.2px',
                        }}
                      >
                        {prod.assignmentName}
                      </h2>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          padding: '1px 6px',
                          borderRadius: '2px',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                        }}
                      >
                        {matchedOutputs.length} Output{matchedOutputs.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#858585' }}>Multiviews:</span>
                      {prod.multiviewsUsed.map((mv) => (
                        <span
                          key={mv}
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: '#282828',
                            color: '#60a5fa',
                            padding: '2px 6px',
                            borderRadius: '2px',
                            border: '1px solid #444444',
                          }}
                        >
                          {mv}
                        </span>
                      ))}

                      <span style={{ fontSize: '11px', color: '#858585', marginLeft: '6px' }}>
                        Layouts:
                      </span>
                      {prod.layouts.map((l) => (
                        <span
                          key={l}
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(40, 100, 163, 0.3)',
                            color: '#60a5fa',
                            padding: '2px 6px',
                            borderRadius: '2px',
                            border: '1px solid rgba(40, 100, 163, 0.5)',
                          }}
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Allocated Output Miniature Feeds */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    {matchedOutputs.map((out) => (
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
              );
            })}

            {filteredProductions.length === 0 && (
              <div
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  backgroundColor: '#111726',
                  borderRadius: '8px',
                  color: '#64748b',
                }}
              >
                No operational assignments match &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
          </div>
        </section>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <section aria-label="Operational Assignments Table">
          <div className="table-wrapper">
            <table className="data-table" aria-label="Operational Assignments Table">
              <thead>
                <tr>
                  <th scope="col">Operational Assignment Name</th>
                  <th scope="col">Frames Used</th>
                  <th scope="col">Outputs Allocated</th>
                  <th scope="col">Destination Ranges</th>
                  <th scope="col">Layouts Used</th>
                  <th scope="col">Lock Status</th>
                  <th scope="col">Observations &amp; Validation</th>
                </tr>
              </thead>
              <tbody>
                {filteredProductions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      No assignments match the query.
                    </td>
                  </tr>
                ) : (
                  filteredProductions.map((prod) => (
                    <tr key={prod.assignmentName}>
                      <td style={{ fontWeight: 700 }}>
                        <span className="mono-cell" style={{ fontSize: '0.95rem' }}>
                          {prod.assignmentName}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {prod.multiviewsUsed.map((mv) => (
                            <span key={mv} className="status-badge badge-assigned">
                              {mv}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {prod.outputsUsed.map((outId) => (
                            <span
                              key={outId}
                              className="mono-cell"
                              style={{
                                background: 'var(--color-bg-app)',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {formatOutputDisplay(outId)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {prod.destinationRanges.map((r, i) => (
                            <span
                              key={i}
                              className="mono-cell"
                              style={{ color: 'var(--color-accent-amber)' }}
                            >
                              {r.display}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {prod.layouts.map((l) => (
                            <span key={l} style={{ fontWeight: 600 }}>
                              {l}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {prod.isLocked ? (
                          <span className="status-badge badge-locked">Locked</span>
                        ) : (
                          <span className="muted-text">Unlocked</span>
                        )}
                      </td>
                      <td>
                        {prod.findings.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {prod.findings.map((f) => (
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
                              >
                                {f.message}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted-text">Clear</span>
                        )}
                      </td>
                    </tr>
                  ))
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
