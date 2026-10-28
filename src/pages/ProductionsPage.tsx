import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { selectGroupedProductions, isDuplicateProductionAssignmentName } from '../domain/selectors';
import { formatOutputDisplay } from '../domain/identifiers';
import { OutputDisplayCard } from '../components/multiview/OutputDisplayCard';
import { OutputDetailModal } from '../components/multiview/OutputDetailModal';
import { MultiviewOutput } from '../domain/models';

export const ProductionsPage: React.FC = () => {
  const {
    activeSnapshot,
    isReadOnly,
    addDraftOperationalAssignment,
    renameDraftOperationalAssignment,
    removeDraftOperationalAssignment,
  } = useTrackerSnapshot();
  const snapshot = activeSnapshot;
  const [viewMode, setViewMode] = useState<'display' | 'table'>('display');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<MultiviewOutput | null>(null);

  // Add assignment state
  const [newAssignmentName, setNewAssignmentName] = useState<string>('');
  const [addError, setAddError] = useState<string | null>(null);

  // Inline rename state
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Remove confirmation state
  const [removingTarget, setRemovingTarget] = useState<{
    assignmentName: string;
    outputsUsed: string[];
  } | null>(null);

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

  const handleAddAssignment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isReadOnly) return;
    const trimmed = newAssignmentName.trim();
    if (!trimmed) {
      setAddError('Production Assignment name cannot be empty.');
      return;
    }
    if (
      isDuplicateProductionAssignmentName(
        trimmed,
        snapshot.operationalAssignments,
        snapshot.outputs
      )
    ) {
      setAddError(`Production Assignment "${trimmed}" already exists.`);
      return;
    }
    addDraftOperationalAssignment(trimmed);
    setNewAssignmentName('');
    setAddError(null);
  };

  const handleStartRename = (currentName: string) => {
    if (isReadOnly) return;
    setRenamingName(currentName);
    setRenameValue(currentName);
    setRenameError(null);
  };

  const handleCancelRename = () => {
    setRenamingName(null);
    setRenameValue('');
    setRenameError(null);
  };

  const handleSaveRename = (oldName: string) => {
    if (isReadOnly) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Production Assignment name cannot be empty.');
      return;
    }
    if (trimmed === oldName) {
      handleCancelRename();
      return;
    }
    if (
      isDuplicateProductionAssignmentName(
        trimmed,
        snapshot.operationalAssignments,
        snapshot.outputs,
        oldName
      )
    ) {
      setRenameError(`Production Assignment "${trimmed}" already exists.`);
      return;
    }
    renameDraftOperationalAssignment(oldName, trimmed);
    handleCancelRename();
  };

  const handleConfirmRemove = () => {
    if (!removingTarget || isReadOnly) return;
    removeDraftOperationalAssignment(removingTarget.assignmentName);
    setRemovingTarget(null);
  };

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

      {/* Search, Add, and Summary */}
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
        <div style={{ flex: 1, minWidth: '240px', maxWidth: '380px' }}>
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

        {!isReadOnly && (
          <form
            onSubmit={handleAddAssignment}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              className="filter-input"
              placeholder="New assignment name (e.g. BR ALERT 1)..."
              value={newAssignmentName}
              onChange={(e) => {
                setNewAssignmentName(e.target.value);
                if (addError) setAddError(null);
              }}
              data-testid="new-assignment-input"
              aria-label="New Production Assignment Name"
              style={{ minWidth: '220px' }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="add-assignment-btn"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: '1px solid #3b82f6',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              + Add Assignment
            </button>
          </form>
        )}

        <div>
          <span className="muted-text" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredProductions.length}</strong> distinct operational assignments
          </span>
        </div>
      </section>

      {addError && (
        <div
          role="alert"
          data-testid="add-assignment-error"
          style={{
            marginBottom: '1rem',
            padding: '8px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '3px',
            color: '#fca5a5',
            fontSize: '12px',
          }}
        >
          {addError}
        </div>
      )}

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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {renamingName === prod.assignmentName ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <input
                            type="text"
                            className="filter-input"
                            value={renameValue}
                            onChange={(e) => {
                              setRenameValue(e.target.value);
                              if (renameError) setRenameError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveRename(prod.assignmentName);
                              } else if (e.key === 'Escape') {
                                handleCancelRename();
                              }
                            }}
                            data-testid={`rename-assignment-input-${prod.assignmentName}`}
                            aria-label={`Rename ${prod.assignmentName}`}
                            style={{
                              padding: '3px 8px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#f59e0b',
                              backgroundColor: '#101010',
                              border: '1px solid #f59e0b',
                              borderRadius: '2px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(prod.assignmentName)}
                            data-testid={`save-rename-assignment-${prod.assignmentName}`}
                            style={{
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: '#2864a3',
                              color: '#ffffff',
                              border: '1px solid #38bdf8',
                              borderRadius: '2px',
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            data-testid={`cancel-rename-assignment-${prod.assignmentName}`}
                            style={{
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: '#262626',
                              color: '#cbd5e1',
                              border: '1px solid #444',
                              borderRadius: '2px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          {renameError && (
                            <span
                              role="alert"
                              data-testid="rename-assignment-error"
                              style={{ fontSize: '11px', color: '#f87171', fontWeight: 600 }}
                            >
                              {renameError}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
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
                          {!isReadOnly && (
                            <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                              <button
                                type="button"
                                onClick={() => handleStartRename(prod.assignmentName)}
                                data-testid={`rename-assignment-btn-${prod.assignmentName}`}
                                style={{
                                  padding: '2px 7px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  backgroundColor: '#262626',
                                  color: '#cbd5e1',
                                  border: '1px solid #404040',
                                  borderRadius: '2px',
                                  cursor: 'pointer',
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRemovingTarget({
                                    assignmentName: prod.assignmentName,
                                    outputsUsed: prod.outputsUsed.map((id) =>
                                      formatOutputDisplay(id)
                                    ),
                                  })
                                }
                                data-testid={`remove-assignment-btn-${prod.assignmentName}`}
                                style={{
                                  padding: '2px 7px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '2px',
                                  cursor: 'pointer',
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </>
                      )}
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
                  {matchedOutputs.length > 0 ? (
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
                  ) : (
                    <div
                      style={{
                        padding: '10px 12px',
                        fontSize: '12px',
                        color: '#858585',
                        fontStyle: 'italic',
                      }}
                    >
                      No multiview outputs currently assigned to this production.
                    </div>
                  )}
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
                  <th scope="col">MV</th>
                  <th scope="col">Outputs Allocated</th>
                  <th scope="col">Layouts Used</th>
                  <th scope="col">Lock Status</th>
                  <th scope="col">Observations &amp; Validation</th>
                  {!isReadOnly && (
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredProductions.length === 0 ? (
                  <tr>
                    <td colSpan={isReadOnly ? 6 : 7} className="empty-state">
                      No assignments match the query.
                    </td>
                  </tr>
                ) : (
                  filteredProductions.map((prod) => (
                    <tr key={prod.assignmentName}>
                      <td style={{ fontWeight: 700 }}>
                        {renamingName === prod.assignmentName ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="text"
                              className="filter-input"
                              value={renameValue}
                              onChange={(e) => {
                                setRenameValue(e.target.value);
                                if (renameError) setRenameError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveRename(prod.assignmentName);
                                } else if (e.key === 'Escape') {
                                  handleCancelRename();
                                }
                              }}
                              data-testid={`rename-assignment-input-${prod.assignmentName}`}
                              aria-label={`Rename ${prod.assignmentName}`}
                              style={{ padding: '2px 6px', fontSize: '12px' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(prod.assignmentName)}
                              data-testid={`save-rename-assignment-${prod.assignmentName}`}
                              style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#2864a3',
                                color: '#ffffff',
                                border: '1px solid #38bdf8',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelRename}
                              data-testid={`cancel-rename-assignment-${prod.assignmentName}`}
                              style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                backgroundColor: '#262626',
                                color: '#cbd5e1',
                                border: '1px solid #444',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            {renameError && (
                              <span
                                role="alert"
                                data-testid="rename-assignment-error"
                                style={{ fontSize: '11px', color: '#f87171' }}
                              >
                                {renameError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="mono-cell" style={{ fontSize: '0.95rem' }}>
                            {prod.assignmentName}
                          </span>
                        )}
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
                      {!isReadOnly && (
                        <td style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleStartRename(prod.assignmentName)}
                              data-testid={`rename-assignment-btn-${prod.assignmentName}`}
                              style={{
                                padding: '2px 7px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: '#262626',
                                color: '#cbd5e1',
                                border: '1px solid #404040',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRemovingTarget({
                                  assignmentName: prod.assignmentName,
                                  outputsUsed: prod.outputsUsed.map((id) =>
                                    formatOutputDisplay(id)
                                  ),
                                })
                              }
                              data-testid={`remove-assignment-btn-${prod.assignmentName}`}
                              style={{
                                padding: '2px 7px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Remove Confirmation Modal */}
      {removingTarget && (
        <div
          className="modal-backdrop"
          data-testid="remove-assignment-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-assignment-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#1c1c1c',
              border: '1px solid #444',
              borderRadius: '4px',
              padding: '18px 20px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <h3
              id="remove-assignment-title"
              style={{
                margin: '0 0 10px 0',
                fontSize: '15px',
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              Remove Production Assignment &ldquo;{removingTarget.assignmentName}&rdquo;?
            </h3>
            {removingTarget.outputsUsed.length > 0 ? (
              <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px 0' }}>
                  This assignment is currently in use on the following Multiview output
                  {removingTarget.outputsUsed.length === 1 ? '' : 's'}:
                </p>
                <div
                  data-testid="remove-assignment-affected-mvs"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}
                >
                  {removingTarget.outputsUsed.map((mvLabel) => (
                    <span
                      key={mvLabel}
                      style={{
                        padding: '2px 7px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: '#282828',
                        color: '#f59e0b',
                        border: '1px solid #444',
                        borderRadius: '2px',
                      }}
                    >
                      {mvLabel}
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0, color: '#fca5a5', fontSize: '12px' }}>
                  Confirming will remove &ldquo;{removingTarget.assignmentName}&rdquo; and clear the
                  Production Assignment on{' '}
                  {removingTarget.outputsUsed.length === 1 ? 'this' : 'these'} MV
                  {removingTarget.outputsUsed.length === 1 ? '' : 's'}.
                </p>
              </div>
            ) : (
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#cbd5e1' }}>
                This assignment is not currently assigned to any Multiview outputs.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRemovingTarget(null)}
                data-testid="cancel-remove-assignment-btn"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: '#262626',
                  color: '#cbd5e1',
                  border: '1px solid #444',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                data-testid="confirm-remove-assignment-btn"
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: '1px solid #ef4444',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output Focused Drill-in Modal */}
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
