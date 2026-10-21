import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { SOURCE_CATEGORIES, SourceCategory } from '../domain/sourceCategories';
import { selectFilteredSources } from '../domain/selectors';

export const SourceDirectoryPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();
  const [selectedCategory, setSelectedCategory] = useState<SourceCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const sources = useMemo(() => snapshot?.sources ?? [], [snapshot]);

  const filteredSources = useMemo(() => {
    return selectFilteredSources(sources, selectedCategory, searchQuery);
  }, [sources, selectedCategory, searchQuery]);

  if (!snapshot) return null;

  return (
    <div className="source-directory-page">
      <header className="page-header">
        <h1 className="page-title">Source Directory</h1>
        <p className="page-description">
          Master catalog of verified broadcast router source feeds and engineering test signals
          extracted from tracked reference documentation.
        </p>
      </header>

      {/* Filter and Search Bar */}
      <section className="controls-bar" aria-label="Source Filters">
        <div className="control-group">
          <label htmlFor="cat-filter" className="control-label">
            Category
          </label>
          <select
            id="cat-filter"
            className="filter-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as SourceCategory | 'ALL')}
          >
            <option value="ALL">All Categories</option>
            {SOURCE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group" style={{ flex: 1 }}>
          <label htmlFor="source-search" className="control-label">
            Search Source
          </label>
          <input
            id="source-search"
            type="search"
            className="search-input"
            placeholder="Search by source label or prefix..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ alignSelf: 'flex-end', paddingBottom: '4px' }}>
          <span className="muted-text" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredSources.length}</strong> of <strong>{sources.length}</strong>{' '}
            sources
          </span>
        </div>
      </section>

      {/* Sources Table / List */}
      <div className="table-wrapper">
        <table className="data-table" aria-label="Sources Directory Table">
          <thead>
            <tr>
              <th scope="col">Source Name</th>
              <th scope="col">Category</th>
              <th scope="col">Normalized Key</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredSources.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      alignItems: 'center',
                    }}
                  >
                    <p style={{ fontWeight: 600 }}>No router sources currently cataloged.</p>
                    <p style={{ maxWidth: '480px', fontSize: '0.85rem' }}>
                      The current reference CSV contains destination allocations with blank source
                      cells. In accordance with operational tracking rules, unassigned sources are
                      preserved as blank and will populate here when a populated source sheet or
                      workbook is ingested.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredSources.map((source) => (
                <tr key={source.id}>
                  <td style={{ fontWeight: 600 }}>{source.name}</td>
                  <td>
                    <span className="status-badge badge-assigned">{source.category}</span>
                  </td>
                  <td className="mono-cell muted-text">{source.normalizedName}</td>
                  <td>
                    <span className="status-badge badge-available">Active</span>
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
