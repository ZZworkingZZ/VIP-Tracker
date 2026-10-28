import React, { useState, useMemo } from 'react';
import { useTrackerSnapshot } from '../hooks/useTracker';
import { HistoryEntry, HistoryEntityType } from '../domain/models';
import { mergeHistoryEntries } from '../domain/diff';

export const HISTORY_ENTITY_TYPES: readonly HistoryEntityType[] = [
  'Output/MV',
  'Layout Assignment',
  'Production Assignment',
  'Source/Destination State',
];

export function formatHistoryTime(
  isoTimestamp: string,
  now: Date = new Date()
): { display: string; full: string } {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) {
    return { display: isoTimestamp, full: isoTimestamp };
  }

  const full = date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  const diffMs = now.getTime() - date.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (diffMs >= 0 && diffMs < oneDayMs) {
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      return { display: 'Just now', full };
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return { display: `${diffMin} min ago`, full };
    }
    const diffHours = Math.floor(diffMin / 60);
    return { display: `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`, full };
  }

  const isSameYear = date.getFullYear() === now.getFullYear();
  const datePart = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: isSameYear ? undefined : 'numeric',
  });
  const timePart = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return { display: `${datePart}, ${timePart}`, full };
}

export const HistoryPage: React.FC = () => {
  const { activeSnapshot } = useTrackerSnapshot();
  const [selectedType, setSelectedType] = useState<HistoryEntityType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const raw = activeSnapshot?.history ?? [];
    return mergeHistoryEntries(raw, []);
  }, [activeSnapshot]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return historyEntries.filter((entry) => {
      if (selectedType !== 'ALL' && entry.entityType !== selectedType) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        entry.entityId.toLowerCase().includes(q) ||
        entry.operator.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.entityType.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q)
      );
    });
  }, [historyEntries, selectedType, searchQuery]);

  if (!activeSnapshot) return null;

  return (
    <div className="history-page">
      <header className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">Change History</h1>
          <p className="page-description">
            Read-only operational audit log of shared multiviewer, layout, production, and source
            routing changes.
          </p>
        </div>
      </header>

      <section className="controls-bar" aria-label="History Filters">
        <div className="control-group">
          <label htmlFor="history-type-filter" className="control-label">
            Type
          </label>
          <select
            id="history-type-filter"
            data-testid="history-type-filter"
            className="filter-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as HistoryEntityType | 'ALL')}
          >
            <option value="ALL">All Types</option>
            {HISTORY_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group" style={{ flex: 1 }}>
          <label htmlFor="history-search" className="control-label">
            Search History
          </label>
          <input
            id="history-search"
            data-testid="history-search-input"
            type="search"
            className="search-input"
            placeholder="Search by item, operator, or change summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ alignSelf: 'flex-end', paddingBottom: '4px' }}>
          <span className="muted-text" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredEntries.length}</strong> of{' '}
            <strong>{historyEntries.length}</strong> entries
          </span>
        </div>
      </section>

      <div className="table-wrapper">
        <table className="data-table" aria-label="Change History Table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Operator</th>
              <th scope="col">Item</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {historyEntries.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state" data-testid="history-empty-state">
                  No changes recorded yet.
                </td>
              </tr>
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state" data-testid="history-no-matches-state">
                  No changes recorded yet.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => {
                const { display: timeDisplay, full: fullTimestamp } = formatHistoryTime(
                  entry.timestamp
                );
                return (
                  <tr key={entry.id} data-testid={`history-row-${entry.id}`}>
                    <td
                      title={fullTimestamp}
                      data-testid={`history-time-${entry.id}`}
                      style={{ whiteSpace: 'nowrap', color: '#cbd5e1', fontSize: '12px' }}
                    >
                      {timeDisplay}
                    </td>
                    <td
                      data-testid={`history-operator-${entry.id}`}
                      style={{ fontWeight: 600, color: '#38bdf8', whiteSpace: 'nowrap' }}
                    >
                      {entry.operator}
                    </td>
                    <td data-testid={`history-item-${entry.id}`} style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: '#ffffff' }}>{entry.entityId}</span>
                        <span className="status-badge badge-assigned">{entry.entityType}</span>
                      </div>
                    </td>
                    <td
                      data-testid={`history-change-${entry.id}`}
                      style={{ color: '#e2e8f0', fontSize: '12px' }}
                    >
                      {entry.summary}
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

