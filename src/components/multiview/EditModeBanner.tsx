import React, { useState } from 'react';
import { useTrackerSnapshot } from '../../hooks/useTracker';
import { ReviewChangesModal } from './ReviewChangesModal';

export const EditModeBanner: React.FC = () => {
  const {
    isEditMode,
    hasUnsavedChanges,
    stagedChanges,
    discardChanges,
    saveDraftChanges,
    isSaving,
    isConflict,
    saveError,
    clearSaveError,
    isNewerSharedDataAvailable,
    reloadLatestSharedData,
  } = useTrackerSnapshot();

  const [isReviewOpen, setIsReviewOpen] = useState(false);

  if (!isEditMode) return null;

  const handleDiscard = () => {
    if (hasUnsavedChanges) {
      const confirmDiscard = window.confirm(
        'Discard all staged changes? Any unsaved edits will be lost.'
      );
      if (!confirmDiscard) return;
    }
    discardChanges();
  };

  const handleConfirmSave = async () => {
    try {
      await saveDraftChanges();
      setIsReviewOpen(false);
    } catch {
      // Retain review modal open or let user see error in modal / banner
    }
  };

  const handleReloadLatest = async () => {
    const confirmReload = window.confirm(
      'Reload latest shared data? Your current unsaved edits will be discarded.'
    );
    if (!confirmReload) return;
    await reloadLatestSharedData();
    setIsReviewOpen(false);
  };

  return (
    <>
      <div
        className="ev-edit-mode-banner"
        data-testid="edit-mode-banner"
        role="region"
        aria-label="Edit Mode Controls"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#1a2736',
          borderBottom: '1px solid #2864a3',
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          fontFamily: 'var(--ev-font)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '2px',
              backgroundColor: hasUnsavedChanges
                ? 'rgba(245, 158, 11, 0.25)'
                : 'rgba(56, 189, 248, 0.25)',
              border: `1px solid ${hasUnsavedChanges ? '#f59e0b' : '#38bdf8'}`,
              color: hasUnsavedChanges ? '#fcd34d' : '#38bdf8',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.5px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: hasUnsavedChanges ? '#f59e0b' : '#38bdf8',
                display: 'inline-block',
              }}
            />
            {hasUnsavedChanges ? 'EDIT MODE • UNSAVED' : 'EDIT MODE ACTIVE'}
          </span>

          <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
            {hasUnsavedChanges ? (
              <span>
                <strong>{stagedChanges.length}</strong> staged difference
                {stagedChanges.length === 1 ? '' : 's'} ready for review
              </span>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                Select any output card to modify layout, route sources, or assign production.
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleDiscard}
            data-testid="discard-changes-btn"
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: '#262626',
              color: '#cbd5e1',
              border: '1px solid #444444',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
            title="Discard staged edits and exit edit mode"
          >
            {hasUnsavedChanges ? 'Discard Changes' : 'Exit Edit Mode'}
          </button>

          <button
            type="button"
            onClick={() => setIsReviewOpen(true)}
            disabled={!hasUnsavedChanges}
            data-testid="review-save-btn"
            style={{
              padding: '4px 14px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: hasUnsavedChanges ? '#2864a3' : '#1e3a5a',
              color: hasUnsavedChanges ? '#ffffff' : '#64748b',
              border: `1px solid ${hasUnsavedChanges ? '#38bdf8' : '#2864a3'}`,
              borderRadius: '2px',
              cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
            }}
            title="Review staged differences before committing"
          >
            Review & Save Changes
          </button>
        </div>
      </div>
      {isConflict && (
        <div
          className="ev-conflict-banner"
          data-testid="edit-mode-conflict-banner"
          role="alert"
          style={{
            position: 'sticky',
            top: '41px',
            zIndex: 99,
            backgroundColor: '#7f1d1d',
            borderBottom: '1px solid #ef4444',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fecaca',
            fontFamily: 'var(--ev-font)',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ fontSize: '14px' }}>
              ⚠️
            </span>
            <span>
              Shared data changed after you began editing. Your changes have not been saved.
            </span>
          </div>
          <button
            type="button"
            onClick={handleReloadLatest}
            data-testid="banner-reload-latest-btn"
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#991b1b',
              color: '#ffffff',
              border: '1px solid #f87171',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Reload Latest Shared Data
          </button>
        </div>
      )}
      {!isConflict && saveError && (
        <div
          className="ev-save-error-banner"
          data-testid="edit-mode-save-error-banner"
          role="alert"
          style={{
            position: 'sticky',
            top: '41px',
            zIndex: 99,
            backgroundColor: '#7f1d1d',
            borderBottom: '1px solid #ef4444',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fecaca',
            fontFamily: 'var(--ev-font)',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ fontSize: '14px' }}>
              ⚠️
            </span>
            <span>{saveError}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsReviewOpen(true)}
              data-testid="banner-retry-save-btn"
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: '#2864a3',
                color: '#ffffff',
                border: '1px solid #38bdf8',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              Review & Retry
            </button>
            <button
              type="button"
              onClick={clearSaveError}
              data-testid="banner-dismiss-error-btn"
              aria-label="Dismiss error"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'transparent',
                color: '#fca5a5',
                border: '1px solid #f87171',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {!isConflict && isNewerSharedDataAvailable && (
        <div
          className="ev-update-banner"
          data-testid="edit-mode-update-banner"
          role="status"
          style={{
            position: 'sticky',
            top: '41px',
            zIndex: 99,
            backgroundColor: '#1e3a5a',
            borderBottom: '1px solid #38bdf8',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#e0f2fe',
            fontFamily: 'var(--ev-font)',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ fontSize: '14px' }}>
              ℹ️
            </span>
            <span>Newer shared data is available.</span>
          </div>
          <button
            type="button"
            onClick={handleReloadLatest}
            data-testid="banner-reload-latest-btn"
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: '1px solid #38bdf8',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Reload Latest Shared Data
          </button>
        </div>
      )}

      <ReviewChangesModal
        isOpen={isReviewOpen}
        changes={stagedChanges}
        onClose={() => setIsReviewOpen(false)}
        onSave={handleConfirmSave}
        isSaving={isSaving}
      />
    </>
  );
};
