import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { useTrackerSnapshot } from '../../hooks/useTracker';

export const AppShell: React.FC = () => {
  const { isLoading, error } = useTrackerSnapshot();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="ev-shell">
      <AppHeader
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
      />
      <div className="ev-body">
        <AppSidebar isOpen={sidebarOpen} />
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
    </div>
  );
};
