import React from 'react';
import { NavLink } from 'react-router-dom';

export interface AppHeaderProps {
  readonly onToggleSidebar?: () => void;
  readonly sidebarOpen?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onToggleSidebar, sidebarOpen = true }) => {
  return (
    <header className="ev-top-bar" role="banner">
      <div className="ev-top-bar-left">
        <button
          type="button"
          className="ev-hamburger-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Collapse navigation sidebar' : 'Expand navigation sidebar'}
          aria-expanded={sidebarOpen}
          title="Toggle Navigation Sidebar"
        >
          <span className="ev-hamburger-icon" aria-hidden="true">
            ☰
          </span>
        </button>

        <NavLink to="/" className="ev-brand-lockup" title="Return to Multiviewer Displays">
          <span className="ev-brand-badge">VIP</span>
          <div className="ev-brand-text">
            <span className="ev-brand-title">VIP TRACKER</span>
            <span className="ev-brand-subtitle">Evertz VIP Source Tracker</span>
          </div>
        </NavLink>
      </div>

      <div className="ev-top-bar-right">
        {/* Read-Only Operational Tracking Baseline Indicator */}
        <span
          className="ev-status-pill ev-pill-local"
          title="Displaying tracked repository baseline data, not direct live hardware state"
          role="status"
        >
          <span className="ev-led-dot green" aria-hidden="true" />
          <span className="pill-text">Local Data</span>
        </span>

        <span
          className="ev-status-pill ev-pill-mode"
          title="Operational mode: Read-Only Operational Tracking"
        >
          <span className="pill-text">READ-ONLY</span>
        </span>

        <div className="ev-user-badge" title="Role: Technical Operations / Broadcast Engineering">
          <span className="user-icon" aria-hidden="true">
            👤
          </span>
          <span className="user-name">TECH OPS</span>
        </div>
      </div>
    </header>
  );
};
