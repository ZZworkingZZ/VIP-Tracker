import React, { useState, useEffect } from 'react';
import { useTrackerSnapshot } from '../../hooks/useTracker';
import { TRACKER_STORAGE_KEY, TRACKER_SCHEMA_VERSION } from '../../services/storage';

export interface SettingsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { snapshot, resetToBaseline, isLoading } = useTrackerSnapshot();
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowConfirm(false);
      setResetSuccess(false);
    }
  }, [isOpen]);

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

  const handleReset = async () => {
    await resetToBaseline();
    setShowConfirm(false);
    setResetSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const outputsCount = snapshot?.outputs.length ?? 0;
  const destinationsCount = snapshot?.destinations.length ?? 0;
  const sourcesCount = snapshot?.sources.length ?? 0;
  const assignmentsCount = snapshot?.operationalAssignments.length ?? 0;

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      data-testid="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
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
          maxWidth: '560px',
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
            <span style={{ fontSize: '16px' }}>⚙</span>
            <span
              id="settings-modal-title"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              System Settings &amp; Local Data
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings modal"
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

        {/* Content */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {/* Storage Information */}
          <div
            style={{
              backgroundColor: '#161616',
              border: '1px solid #333333',
              borderRadius: '3px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#38bdf8',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Local Data Persistence (Browser)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '12px',
                color: '#cbd5e1',
              }}
            >
              <div>
                <span style={{ color: '#858585' }}>Storage Key: </span>
                <span style={{ fontFamily: 'var(--ev-font-mono)', fontSize: '11px' }}>
                  {TRACKER_STORAGE_KEY}
                </span>
              </div>
              <div>
                <span style={{ color: '#858585' }}>Schema Version: </span>
                <span>{TRACKER_SCHEMA_VERSION}.0</span>
              </div>
              <div>
                <span style={{ color: '#858585' }}>Outputs Tracked: </span>
                <span>{outputsCount} physical outputs</span>
              </div>
              <div>
                <span style={{ color: '#858585' }}>Destinations: </span>
                <span>{destinationsCount} router pins</span>
              </div>
              <div>
                <span style={{ color: '#858585' }}>Cataloged Sources: </span>
                <span>{sourcesCount} sources</span>
              </div>
              <div>
                <span style={{ color: '#858585' }}>Production Groups: </span>
                <span>{assignmentsCount} packages</span>
              </div>
            </div>
          </div>

          {/* Reset Baseline Section */}
          <div
            style={{
              backgroundColor: '#201515',
              border: '1px solid #5a2727',
              borderRadius: '3px',
              padding: '14px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#f87171',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Reset Local Configuration to Baseline
            </div>
            <p
              style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 12px 0', lineHeight: 1.4 }}
            >
              Purges all locally edited layouts, destination ranges, source route patches, and
              production assignments from browser storage. The application will restore the initial
              verified repository baseline dataset (5 multiview frames, 32 outputs, 264
              destinations) and refresh all derived operational views.
            </p>

            {resetSuccess ? (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(84, 213, 74, 0.2)',
                  border: '1px solid #54d54a',
                  color: '#54d54a',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '2px',
                }}
                data-testid="reset-success-message"
              >
                ✓ Local data has been successfully reset to repository baseline.
              </div>
            ) : !showConfirm ? (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                data-testid="reset-local-data-btn"
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#7f1d1d',
                  color: '#ffffff',
                  border: '1px solid #ef4444',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                Reset Local Data
              </button>
            ) : (
              <div
                style={{
                  padding: '10px',
                  backgroundColor: '#2b1010',
                  border: '1px solid #ef4444',
                  borderRadius: '2px',
                }}
                data-testid="reset-confirm-box"
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#fecaca',
                    marginBottom: '8px',
                  }}
                >
                  ⚠️ Are you sure? This will permanently delete all your local layout and routing
                  edits.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isLoading}
                    data-testid="confirm-reset-btn"
                    style={{
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: '1px solid #f87171',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    {isLoading ? 'Resetting...' : 'Yes, Restore Repository Baseline'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '11px',
                      backgroundColor: '#262626',
                      color: '#cbd5e1',
                      border: '1px solid #444444',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 16px',
            backgroundColor: '#202020',
            borderTop: '1px solid #333333',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '5px 14px',
              fontSize: '12px',
              backgroundColor: '#303030',
              color: '#cbd5e1',
              border: '1px solid #444444',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
