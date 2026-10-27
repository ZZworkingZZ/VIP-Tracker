import React, { useEffect } from 'react';
import { FieldChange } from '../../domain/models';
import { useTrackerSnapshot } from '../../hooks/useTracker';

export interface ReviewChangesModalProps {
  readonly isOpen: boolean;
  readonly changes: readonly FieldChange[];
  readonly onClose: () => void;
  readonly onSave: () => void;
  readonly isSaving?: boolean;
}

export const ReviewChangesModal: React.FC<ReviewChangesModalProps> = ({
  isOpen,
  changes,
  onClose,
  onSave,
  isSaving = false,
}) => {
  const { currentOperator } = useTrackerSnapshot();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group changes by entityLabel for clean broadcast hierarchy
  const groupedChanges = new Map<string, FieldChange[]>();
  for (const c of changes) {
    const list = groupedChanges.get(c.entityLabel) ?? [];
    list.push(c);
    groupedChanges.set(c.entityLabel, list);
  }

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      data-testid="review-changes-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
    >
      <div
        className="output-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1c1c1c',
          border: '1px solid #444444',
          borderRadius: '4px',
          maxWidth: '580px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          fontFamily: 'var(--ev-font)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#272727',
            borderBottom: '1px solid #383838',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              id="review-modal-title"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Review Changes
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '2px',
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                fontWeight: 700,
              }}
            >
              {changes.length} {changes.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close review modal"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '2px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cccccc',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Change List */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {changes.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#858585' }}>
              No differences detected between draft and persisted state.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Array.from(groupedChanges.entries()).map(([label, group]) => (
                <div
                  key={label}
                  style={{
                    backgroundColor: '#161616',
                    border: '1px solid #333333',
                    borderRadius: '3px',
                    padding: '10px 14px',
                  }}
                  data-testid={`review-group-${label}`}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#ffffff',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderBottom: '1px solid #282828',
                      paddingBottom: '4px',
                    }}
                  >
                    <span>{label}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.map((item, idx) => (
                      <div
                        key={`${item.field}-${idx}`}
                        style={{
                          fontSize: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          paddingLeft: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#858585',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {formatFieldLabel(item.field)}
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: '#e2e8f0',
                            fontFamily: 'var(--ev-font)',
                          }}
                        >
                          <span
                            style={{
                              color: '#94a3b8',
                              textDecoration: 'line-through',
                              opacity: 0.8,
                            }}
                          >
                            {item.previousValue || 'None'}
                          </span>
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>→</span>
                          <span style={{ color: '#54d54a', fontWeight: 700 }}>
                            {item.newValue || 'None'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#202020',
            borderTop: '1px solid #333333',
          }}
        >
          <div
            data-testid="review-attribution-indicator"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: '#94a3b8',
            }}
          >
            <span aria-hidden="true">👤</span>
            <span>
              Attributed to:{' '}
              <strong style={{ color: '#38bdf8' }}>
                {currentOperator?.displayName || 'TECH OPS'}
              </strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: '#303030',
                color: '#cccccc',
                border: '1px solid #484848',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || changes.length === 0}
              data-testid="confirm-save-btn"
              style={{
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: '#2864a3',
                color: '#ffffff',
                border: '1px solid #38bdf8',
                borderRadius: '2px',
                cursor: changes.length === 0 ? 'not-allowed' : 'pointer',
                opacity: changes.length === 0 ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatFieldLabel(field: string): string {
  switch (field) {
    case 'layoutName':
      return 'Layout';
    case 'assignmentName':
      return 'Production Assignment';
    case 'assignedSourceId':
      return 'Source Routing';
    case 'status':
      return 'Status';
    case 'notes':
      return 'Operational Notes';
    case 'locked':
      return 'Lock State';
    case 'sourceCatalog':
      return 'Directory Catalog';
    case 'upstreamSourceId':
      return 'Upstream Source';
    default:
      return field;
  }
}
