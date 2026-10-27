import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { SettingsModal } from './SettingsModal';
import { OperatorModal } from './OperatorModal';
import { EditModeBanner } from '../multiview/EditModeBanner';
import { useTrackerSnapshot } from '../../hooks/useTracker';

export const AppShell: React.FC = () => {
  const {
    isLoading,
    loadError,
    snapshot,
    refresh,
    currentOperator,
    recentOperators,
    setOperator,
    setOperatorByName,
    isOperatorModalOpen,
    closeOperatorModal,
  } = useTrackerSnapshot();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const showFatalLoadError = Boolean(loadError && !snapshot);

  return (
    <div className="ev-shell">
      <AppHeader
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
      />
      <EditModeBanner />
      <div className="ev-body">
        <AppSidebar isOpen={sidebarOpen} onOpenSettings={() => setSettingsOpen(true)} />
        <main className="ev-canvas" id="main-content">
          {isLoading && (
            <div className="empty-state" role="status">
              Loading VIP Tracker operational baseline...
            </div>
          )}
          {showFatalLoadError && (
            <div
              className="finding-item finding-error"
              role="alert"
              style={{
                margin: '24px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-badge badge-conflict">Error</span>
                <span style={{ fontWeight: 600 }}>{loadError}</span>
              </div>
              <button
                type="button"
                className="ev-button"
                onClick={() => refresh()}
                data-testid="retry-load-btn"
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Retry
              </button>
            </div>
          )}
          {!isLoading && !showFatalLoadError && <Outlet />}
        </main>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OperatorModal
        isOpen={isOperatorModalOpen}
        currentOperator={currentOperator}
        recentOperators={recentOperators}
        onSelectOperator={setOperatorByName}
        onSwitchToOperator={setOperator}
        onClose={closeOperatorModal}
      />
    </div>
  );
};
