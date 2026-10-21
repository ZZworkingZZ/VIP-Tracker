import React from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { useTrackerSnapshot } from '../../hooks/useTracker';

export const AppShell: React.FC = () => {
  const { isLoading, error } = useTrackerSnapshot();

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="main-content" id="main-content">
        {isLoading && (
          <div className="empty-state" role="status">
            Loading VIP Tracker snapshot...
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
  );
};
