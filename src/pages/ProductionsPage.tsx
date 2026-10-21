import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { selectGroupedProductions } from '../domain/selectors';
import { formatOutputDisplay } from '../domain/identifiers';

export const ProductionsPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();
  const [searchQuery, setSearchQuery] = useState<string>('');

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
    <div className="productions-page">
      <header className="page-header">
        <h1 className="page-title">Productions &amp; Operational Assignments</h1>
        <p className="page-description">
          Consolidated operational assignment packages derived directly from active multiview output
          allocations.
        </p>
      </header>

      {/* Search and Filter */}
      <section className="controls-bar" aria-label="Productions Filters">
        <div className="control-group" style={{ flex: 1 }}>
          <label htmlFor="prod-search" className="control-label">
            Search Assignment / Production
          </label>
          <input
            id="prod-search"
            type="search"
            className="search-input"
            placeholder="e.g. BR ALERT, HOH, JXS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'flex-end', paddingBottom: '4px' }}>
          <span className="muted-text" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredProductions.length}</strong> distinct operational assignments
          </span>
        </div>
      </section>

      {/* Grouped Assignments Table */}
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
    </div>
  );
};
