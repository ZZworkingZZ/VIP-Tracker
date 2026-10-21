import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { SettingsModal } from './SettingsModal';
import { EditModeBanner } from '../multiview/EditModeBanner';
import { useTrackerSnapshot } from '../../hooks/useTracker';

export const AppShell: React.FC = () => {
  const { isLoading, error } = useTrackerSnapshot();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          {error && (
            <div className="finding-item finding-error" role="alert">
              <span className="status-badge badge-conflict">Error</span>
              <span>{error}</span>
            </div>
          )}
          {!isLoading && !error && <Outlet />}
        </main>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};
