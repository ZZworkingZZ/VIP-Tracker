import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { SOURCE_CATEGORIES, SourceCategory } from '../domain/sourceCategories';
import { selectFilteredSources, getSourceAlias, formatSourceCompact } from '../domain/selectors';
import { SourceId } from '../domain/identifiers';
import { SourceSignalFlowModal } from '../components/multiview/SourceSignalFlowModal';
import { resolveSignalFlow, formatSignalFlowChain } from '../domain/signalFlow';

export const SourceDirectoryPage: React.FC = () => {
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
    updateDraftSourceUpstream,
    saveSourceAlias,
  } = useTrackerSnapshot();

  const snapshot = activeSnapshot;
  const [selectedCategory, setSelectedCategory] = useState<SourceCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [routingModalSourceId, setRoutingModalSourceId] = useState<SourceId | null>(null);
  const [aliasEdits, setAliasEdits] = useState<Record<string, string>>({});

  const sources = useMemo(() => snapshot?.sources ?? [], [snapshot]);

  const sourceMap = useMemo(
    () => new Map<SourceId, import('../domain/models').Source>(sources.map((s) => [s.id, s])),
    [sources]
  );

  const filteredSources = useMemo(() => {
    return selectFilteredSources(sources, selectedCategory, searchQuery);
  }, [sources, selectedCategory, searchQuery]);

  const selectedSource = useMemo(() => {
    if (!routingModalSourceId) return null;
    return sources.find((s) => s.id === routingModalSourceId) ?? null;
  }, [sources, routingModalSourceId]);

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

  const handleOpenRouting = (sourceId: SourceId, autoEnterEdit: boolean = false) => {
    if (autoEnterEdit && !isEditMode && !isReadOnly) {
      enterEditMode();
    }
    setRoutingModalSourceId(sourceId);
  };

  const handleSaveAlias = async (sourceId: SourceId, rawAlias: string) => {
    if (isReadOnly) return;
    try {
      await saveSourceAlias(sourceId, rawAlias);
      setAliasEdits((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
    } catch {
      // Preserve local editing state on save failure
    }
  };

  if (!snapshot) return null;

  return (
    <div className="source-directory-page">
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
            <h1 className="page-title">Source Directory</h1>
            <p className="page-description">
              Master catalog of verified broadcast router source feeds, engineering test signals,
              and upstream signal flow relationships.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    : 'Enter edit mode to configure upstream source signal flow'
              }
            >
              {isReadOnly ? '🔒 Read-Only' : isEditMode ? '✓ Editing Mode' : '✎ Edit Signal Flow'}
            </button>
          </div>
        </div>
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
            placeholder="Search by source label, alias, or prefix..."
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

      {!isEditMode && saveError && (
        <div
          role="alert"
          data-testid="directory-save-error-banner"
          style={{
            marginBottom: '1rem',
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '3px',
            color: '#fca5a5',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{saveError}</span>
          {clearSaveError && (
            <button
              type="button"
              onClick={clearSaveError}
              style={{
                background: 'none',
                border: 'none',
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Sources Table / List */}
      <div className="table-wrapper">
        <table className="data-table" aria-label="Sources Directory Table">
          <thead>
            <tr>
              <th scope="col">Source Name</th>
              <th scope="col">Alias</th>
              <th scope="col">Category</th>
              <th scope="col">Source Type</th>
              <th scope="col">Upstream Source</th>
              <th scope="col">Signal Flow</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSources.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
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
              filteredSources.map((source) => {
                const upstream = source.upstreamSourceId
                  ? sourceMap.get(source.upstreamSourceId)
                  : null;
                const flow = resolveSignalFlow(source.id, sourceMap);
                const savedAlias = getSourceAlias(source);
                const hasLocalAliasEdit = Object.prototype.hasOwnProperty.call(
                  aliasEdits,
                  source.id
                );
                const currentAliasInput = hasLocalAliasEdit
                  ? aliasEdits[source.id]
                  : (savedAlias ?? '');
                const isAliasDirty = currentAliasInput.trim() !== (savedAlias ?? '');

                return (
                  <tr key={source.id} data-testid={`source-row-${source.id}`}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ color: '#ffffff' }}>{source.name}</span>
                        {savedAlias && (
                          <span
                            data-testid={`source-alias-label-${source.id}`}
                            style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 500 }}
                          >
                            {savedAlias}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-testid={`source-alias-cell-${source.id}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="text"
                          aria-label={`Alias for ${source.name}`}
                          data-testid={`source-alias-input-${source.id}`}
                          value={currentAliasInput}
                          disabled={isReadOnly || isSaving}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAliasEdits((prev) => ({
                              ...prev,
                              [source.id]: val,
                            }));
                          }}
                          style={{
                            padding: '3px 6px',
                            fontSize: '12px',
                            backgroundColor: '#101010',
                            border: `1px solid ${isAliasDirty ? '#38bdf8' : '#383838'}`,
                            borderRadius: '2px',
                            color: '#ffffff',
                            fontFamily: 'var(--ev-font)',
                            minWidth: '140px',
                            width: '100%',
                            maxWidth: '200px',
                          }}
                        />
                        <button
                          type="button"
                          data-testid={`save-source-alias-btn-${source.id}`}
                          aria-label={`Save alias for ${source.name}`}
                          title={`Save alias for ${source.name}`}
                          disabled={isReadOnly || isSaving}
                          onClick={() => void handleSaveAlias(source.id, currentAliasInput)}
                          style={{
                            padding: '3px 7px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: isAliasDirty ? '#2864a3' : '#262626',
                            color: isAliasDirty ? '#ffffff' : '#cbd5e1',
                            border: `1px solid ${isAliasDirty ? '#38bdf8' : '#444444'}`,
                            borderRadius: '2px',
                            cursor: isReadOnly || isSaving ? 'not-allowed' : 'pointer',
                            lineHeight: 1.2,
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="status-badge badge-assigned">{source.category}</span>
                    </td>
                    <td style={{ fontSize: '11px', color: '#cbd5e1' }}>
                      {source.sourceType === 'virtual'
                        ? 'Virtual Source'
                        : source.sourceType === 'processing'
                          ? 'Processing'
                          : 'Direct VIP'}
                    </td>
                    <td data-testid={`upstream-cell-${source.id}`}>
                      {!source.upstreamSourceId ? (
                        <span style={{ color: '#858585', fontSize: '11px' }}>Not assigned</span>
                      ) : upstream ? (
                        <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '12px' }}>
                          {formatSourceCompact(upstream)}
                        </span>
                      ) : (
                        <span
                          className="status-badge badge-conflict"
                          title={`Referenced upstream ID '${source.upstreamSourceId}' not found`}
                        >
                          Missing Source
                        </span>
                      )}
                    </td>
                    <td data-testid={`signal-flow-cell-${source.id}`}>
                      {flow.hasCycle ? (
                        <span
                          className="status-badge badge-conflict"
                          title="Circular routing detected"
                        >
                          Circular routing detected
                        </span>
                      ) : flow.isDangling ? (
                        <span
                          className="status-badge badge-conflict"
                          title="Missing upstream source in flow"
                        >
                          Missing upstream
                        </span>
                      ) : flow.maxDepthExceeded ? (
                        <span
                          className="status-badge badge-warning"
                          title="Maximum signal flow depth reached"
                        >
                          Max depth
                        </span>
                      ) : flow.hops.length > 1 ? (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: '#54d54a',
                          }}
                        >
                          {formatSignalFlowChain(flow)}
                        </span>
                      ) : (
                        <span style={{ color: '#858585', fontSize: '11px' }}>Origin</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        data-testid={`edit-signal-flow-btn-${source.id}`}
                        onClick={() => handleOpenRouting(source.id, true)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: isEditMode ? '#2864a3' : '#262626',
                          color: isEditMode ? '#ffffff' : '#cbd5e1',
                          border: `1px solid ${isEditMode ? '#38bdf8' : '#444'}`,
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                        title={
                          isEditMode
                            ? `Edit signal flow for ${source.name}`
                            : `View routing details for ${source.name}`
                        }
                      >
                        {isEditMode ? 'Edit Flow' : 'Routing Details'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Signal Flow Detail & Editing Modal */}
      {selectedSource && (
        <SourceSignalFlowModal
          isOpen={Boolean(selectedSource)}
          source={selectedSource}
          allSources={sources}
          validationFindings={snapshot.validationFindings}
          isEditMode={isEditMode}
          onEnterEditMode={enterEditMode}
          onApply={(newUpstreamId) => {
            updateDraftSourceUpstream(selectedSource.id, newUpstreamId);
            setRoutingModalSourceId(null);
          }}
          onClose={() => setRoutingModalSourceId(null)}
        />
      )}
    </div>
  );
};
