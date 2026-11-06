import React, { useMemo, useState } from 'react';
import type { TrackerSnapshot } from '../../domain/models';
import type { SourceId } from '../../domain/identifiers';
import {
  applyTielineLawoSourceChange,
  filterTielineFlows,
  resolveAllTielineFlows,
  sortTielineFlows,
  type FlowSortDirection,
  type FlowSortKey,
  type FlowUsageFilter,
  type FlowUsageState,
  type TielineFlowRow,
} from '../../domain/allSignalFlows';
import { getAuthoritativeLawoDropdownSources } from '../../domain/signalFlow';
import { formatSourceCompact } from '../../domain/models';
import { SearchableSourcePicker } from '../multiview/SearchableSourcePicker';

type CommitFn = (
  mutator: (
    base: TrackerSnapshot,
    operator: { id: string; displayName: string } | null,
    timestamp: string
  ) => TrackerSnapshot
) => Promise<void>;

export interface AllSignalFlowsViewProps {
  readonly snapshot: TrackerSnapshot;
  readonly isReadOnly: boolean;
  readonly isSaving: boolean;
  readonly commitSignalFlowChange: CommitFn;
  readonly onFeedback: (banner: { type: 'success' | 'error'; message: string }) => void;
}

const USAGE_LABELS: Record<FlowUsageState, string> = {
  'pip-visible': 'Visible on a PIP',
  'mv-input-unused': 'MV input, not on a PIP',
  'no-mv-input': 'No MV input',
};

const th: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

function unchangedSelection(row: TielineFlowRow, pending: SourceId | null): boolean {
  return (row.lawoSource?.id ?? null) === pending;
}

export const AllSignalFlowsView: React.FC<AllSignalFlowsViewProps> = ({
  snapshot,
  isReadOnly,
  isSaving,
  commitSignalFlowChange,
  onFeedback,
}) => {
  const [query, setQuery] = useState('');
  const [usage, setUsage] = useState<FlowUsageFilter>('ALL');
  const [sortKey, setSortKey] = useState<FlowSortKey>('tieline');
  const [sortDir, setSortDir] = useState<FlowSortDirection>('asc');
  const [editingId, setEditingId] = useState<SourceId | null>(null);
  const [pendingLawoId, setPendingLawoId] = useState<SourceId | null>(null);
  const [confirmedShared, setConfirmedShared] = useState(false);

  const allRows = useMemo(() => resolveAllTielineFlows(snapshot), [snapshot]);
  const rows = useMemo(
    () => sortTielineFlows(filterTielineFlows(allRows, { query, usage }), sortKey, sortDir),
    [allRows, query, usage, sortKey, sortDir]
  );

  const editingRow: TielineFlowRow | null = allRows.find((r) => r.tielineId === editingId) ?? null;
  const lawoOptions = useMemo(
    () =>
      editingRow ? getAuthoritativeLawoDropdownSources(snapshot.sources, editingRow.tielineId) : [],
    [snapshot.sources, editingRow]
  );

  const isFiltered = query.trim() !== '' || usage !== 'ALL';

  const toggleSort = (key: FlowSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const sortMark = (key: FlowSortKey) => (key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const openEditor = (row: TielineFlowRow) => {
    setEditingId(row.tielineId);
    setPendingLawoId(row.lawoSource?.id ?? null);
    setConfirmedShared(false);
  };
  const closeEditor = () => setEditingId(null);

  const needsConfirm = Boolean(editingRow && editingRow.affectedOtherTielines.length > 0);
  const currentSourceText = editingRow?.lawoSource
    ? formatSourceCompact(editingRow.lawoSource)
    : 'No source assigned';
  const proposedSourceText = (() => {
    if (!editingRow || unchangedSelection(editingRow, pendingLawoId)) {
      return editingRow?.lawoSource ? 'No change selected' : 'Select a source';
    }
    if (pendingLawoId === null) return 'No source assigned';
    const picked = lawoOptions.find((o) => o.id === pendingLawoId);
    return picked ? formatSourceCompact(picked) : pendingLawoId;
  })();
  const unchanged = editingRow ? (editingRow.lawoSource?.id ?? null) === pendingLawoId : true;

  const handleApply = async () => {
    if (!editingRow || isReadOnly || unchanged) return;
    if (needsConfirm && !confirmedShared) return;
    const { tielineId, tieline } = editingRow;
    const nextId = pendingLawoId;
    try {
      await commitSignalFlowChange((base, op, ts) =>
        applyTielineLawoSourceChange(base, tielineId, nextId, op, ts)
      );
      const nextName = nextId
        ? (snapshot.sources.find((s) => s.id === nextId)?.name ?? nextId)
        : 'BLANK';
      onFeedback({
        type: 'success',
        message: `Saved Lawo source for ${tieline.name}: ${nextName}.`,
      });
      closeEditor();
    } catch (err) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Failed to save route for ${tieline.name}.`,
      });
    }
  };

  return (
    <div data-testid="all-signal-flows-view">
      <p className="page-description" data-testid="all-signal-flows-description">
        All Signal Flows lists the tieline → Lawo source paths tracked in VIP Tracker. It is not
        live discovery of router, SDVN, VSM or Lawo state. Changing a route here updates the tracked
        Lawo source only; it does not add or remove MV inputs or PIPs.
      </p>

      <div
        className="controls-bar"
        style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '0.75rem 0' }}
      >
        <input
          type="text"
          className="filter-input search-input"
          placeholder="Search tieline, alias, Lawo source, MV input…"
          aria-label="Search signal flows"
          data-testid="all-flows-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="filter-select"
          aria-label="Usage filter"
          data-testid="all-flows-usage-filter"
          value={usage}
          onChange={(e) => setUsage(e.target.value as FlowUsageFilter)}
        >
          <option value="ALL">All usage states</option>
          <option value="pip-visible">{USAGE_LABELS['pip-visible']}</option>
          <option value="mv-input-unused">{USAGE_LABELS['mv-input-unused']}</option>
          <option value="no-mv-input">{USAGE_LABELS['no-mv-input']}</option>
          <option value="unresolved">Unresolved</option>
        </select>
        <span
          data-testid="all-flows-count"
          style={{
            alignSelf: 'center',
            fontSize: '12px',
            fontWeight: isFiltered ? 700 : 400,
            color: isFiltered ? '#38bdf8' : undefined,
          }}
        >
          {rows.length} of {allRows.length} signal flows
        </span>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th
                style={th}
                onClick={() => toggleSort('tieline')}
                aria-sort={
                  sortKey === 'tieline' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                Tieline{sortMark('tieline')}
              </th>
              <th
                style={th}
                onClick={() => toggleSort('source')}
                aria-sort={
                  sortKey === 'source' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                Current Lawo source{sortMark('source')}
              </th>
              <th>Processing</th>
              <th>MV input</th>
              <th
                style={th}
                onClick={() => toggleSort('usage')}
                aria-sort={
                  sortKey === 'usage' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                PIP visibility{sortMark('usage')}
              </th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No signal flows match the current search and filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.tielineId}
                  data-testid={`all-flow-row-${row.tielineId}`}
                  data-usage-state={row.usageState}
                >
                  <td>
                    <strong>{row.tieline.name}</strong>
                    {row.tielineAlias && (
                      <div style={{ fontSize: '11px', color: '#38bdf8' }}>{row.tielineAlias}</div>
                    )}
                  </td>
                  <td data-testid={`all-flow-source-${row.tielineId}`}>
                    {row.lawoSource ? (
                      formatSourceCompact(row.lawoSource)
                    ) : (
                      <span style={{ color: '#f87171' }}>BLANK</span>
                    )}
                  </td>
                  <td>{row.processingStages.map((s) => s.name).join(' → ') || '—'}</td>
                  <td data-testid={`all-flow-mv-${row.tielineId}`}>
                    {row.mvInputs.length ? row.mvInputs.map((m) => m.label).join(', ') : 'None'}
                  </td>
                  <td data-testid={`all-flow-pip-${row.tielineId}`}>
                    <div>{USAGE_LABELS[row.usageState]}</div>
                    {row.pipUses.length > 0 && (
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {row.pipUses.map((p) => p.label).join(', ')}
                      </div>
                    )}
                  </td>
                  <td>
                    {row.isUnresolved ? (
                      <span title={row.unresolvedReasons.join('; ')} style={{ color: '#f87171' }}>
                        Unresolved
                      </span>
                    ) : (
                      'OK'
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="toggle-btn"
                      data-testid={`edit-all-flow-${row.tielineId}`}
                      aria-label={`Edit Lawo source for ${row.tieline.name}`}
                      disabled={isReadOnly || isSaving}
                      onClick={() => openEditor(row)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingRow && (
        <div
          className="output-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="all-flow-edit-title"
          data-testid="all-flow-edit-modal"
          onClick={closeEditor}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
            padding: '16px',
          }}
        >
          <div
            className="output-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1c1c1c',
              border: '1px solid #444',
              borderRadius: '4px',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#272727',
                borderBottom: '1px solid #383838',
              }}
            >
              <div
                id="all-flow-edit-title"
                style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase' }}
              >
                Change Lawo source for {editingRow.tieline.name}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Current source:{' '}
                {editingRow.lawoSource ? formatSourceCompact(editingRow.lawoSource) : 'BLANK'}
                {' · '}MV input:{' '}
                {editingRow.mvInputs.length
                  ? editingRow.mvInputs.map((m) => m.label).join(', ')
                  : 'none'}{' '}
                (unchanged)
              </div>
            </div>
            <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
              {needsConfirm && (
                <div
                  role="alert"
                  data-testid="all-flow-shared-warning"
                  style={{
                    marginBottom: '8px',
                    padding: '8px',
                    border: '1px solid #f59e0b',
                    color: '#fcd34d',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    Shared processing stage — other tielines will also be rerouted
                  </div>
                  <dl
                    style={{
                      margin: 0,
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '2px 8px',
                    }}
                  >
                    <dt>Editing</dt>
                    <dd style={{ margin: 0 }} data-testid="shared-warning-editing">
                      {editingRow.tieline.name}
                    </dd>
                    <dt>Current Lawo source</dt>
                    <dd style={{ margin: 0 }} data-testid="shared-warning-current">
                      {currentSourceText}
                    </dd>
                    <dt>Proposed Lawo source</dt>
                    <dd style={{ margin: 0 }} data-testid="shared-warning-proposed">
                      {proposedSourceText}
                    </dd>
                    <dt>Shared processing stage(s)</dt>
                    <dd style={{ margin: 0 }} data-testid="shared-warning-stages">
                      {editingRow.sharedProcessingStages.map((s) => s.name).join(', ')}
                    </dd>
                    <dt>Also rerouted</dt>
                    <dd style={{ margin: 0 }} data-testid="shared-warning-affected">
                      {editingRow.affectedOtherTielines.map((s) => s.name).join(', ')}
                    </dd>
                  </dl>
                  <label style={{ display: 'block', marginTop: '6px' }}>
                    <input
                      type="checkbox"
                      data-testid="all-flow-confirm-shared"
                      checked={confirmedShared}
                      onChange={(e) => setConfirmedShared(e.target.checked)}
                    />{' '}
                    I understand and want to apply this change
                  </label>
                </div>
              )}
              <SearchableSourcePicker
                sources={lawoOptions}
                pickerRole="lawoSource"
                selectedSourceId={pendingLawoId}
                onSelectSource={setPendingLawoId}
                searchInputTestId="all-flow-source-search"
                unassignLabel="— BLANK (no Lawo source) —"
                searchPlaceholder="Filter Lawo sources…"
                maxHeight="360px"
                onClose={closeEditor}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '12px 16px',
                backgroundColor: '#202020',
                borderTop: '1px solid #333',
              }}
            >
              <button
                type="button"
                className="toggle-btn"
                onClick={closeEditor}
                data-testid="all-flow-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                className="toggle-btn active"
                data-testid="all-flow-apply-btn"
                disabled={isSaving || isReadOnly || unchanged || (needsConfirm && !confirmedShared)}
                onClick={() => void handleApply()}
              >
                Apply Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
