import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTrackerSnapshot } from '../../hooks/useTracker';

export interface AppHeaderProps {
  readonly onToggleSidebar?: () => void;
  readonly sidebarOpen?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onToggleSidebar, sidebarOpen = true }) => {
  const { isEditMode, hasUnsavedChanges, currentOperator, openOperatorModal } =
    useTrackerSnapshot();

  let modeText = 'ACTIVE';
  let modeClass = 'ev-status-pill ev-pill-mode active-mode';
  let modeTitle = 'Operational mode: Active Tracking & Configuration';

  if (isEditMode) {
    if (hasUnsavedChanges) {
      modeText = 'EDIT MODE • UNSAVED';
      modeClass = 'ev-status-pill ev-pill-mode edit-mode unsaved';
      modeTitle = 'Operational mode: Edit Mode (Unsaved Staged Changes)';
    } else {
      modeText = 'EDIT MODE';
      modeClass = 'ev-status-pill ev-pill-mode edit-mode';
      modeTitle = 'Operational mode: Edit Mode';
    }
  }

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
        {/* Operational Tracking Baseline Indicator */}
        <span
          className="ev-status-pill ev-pill-local"
          title="Displaying tracked repository baseline data, not direct live hardware state"
          role="status"
        >
          <span className="ev-led-dot green" aria-hidden="true" />
          <span className="pill-text">Local Data</span>
        </span>

        <span className={modeClass} title={modeTitle} data-testid="app-mode-pill">
          <span className="pill-text">{modeText}</span>
        </span>

        <div
          className="ev-user-badge ev-operator-badge"
          data-testid="current-operator-badge"
          title={
            currentOperator
              ? `Current Operator: ${currentOperator.displayName} (${currentOperator.id})`
              : 'Trust-based Operator Identity'
          }
        >
          <span className="user-icon" aria-hidden="true">
            👤
          </span>
          <span className="user-name" data-testid="current-operator-name">
            {currentOperator ? currentOperator.displayName : 'TECH OPS'}
          </span>
          <button
            type="button"
            className="ev-switch-user-btn"
            data-testid="switch-user-btn"
            onClick={openOperatorModal}
            title="Switch operator"
          >
            Switch User
          </button>
        </div>
      </div>
    </header>
  );
};
