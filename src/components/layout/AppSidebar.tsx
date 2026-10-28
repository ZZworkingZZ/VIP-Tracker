import React from 'react';
import { NavLink } from 'react-router-dom';

export interface AppSidebarProps {
  readonly isOpen?: boolean;
  readonly onOpenSettings?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ isOpen = true, onOpenSettings }) => {
  return (
    <aside
      className={`ev-sidebar ${isOpen ? 'open' : 'collapsed'}`}
      aria-label="Multiviewer Navigation"
    >
      <div className="ev-sidebar-section">
        <span className="ev-sidebar-heading">OPERATIONAL VIEWS</span>
        <nav className="ev-sidebar-nav" aria-label="Main Navigation">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `ev-nav-item ${isActive ? 'active' : ''}`}
            title="Multiviewer Displays (MV-01 through MV-05)"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              🖥
            </span>
            <span className="ev-nav-label">Multiviewers</span>
          </NavLink>

          <NavLink
            to="/layouts"
            className={({ isActive }) => `ev-nav-item ${isActive ? 'active' : ''}`}
            title="Evertz Layout Geometry Library & Output Assignments"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              ▦
            </span>
            <span className="ev-nav-label">Layouts</span>
          </NavLink>

          <NavLink
            to="/sources"
            className={({ isActive }) => `ev-nav-item ${isActive ? 'active' : ''}`}
            title="Router Destination Inputs & Patched Sources"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              ⇄
            </span>
            <span className="ev-nav-label">Sources</span>
          </NavLink>

          <NavLink
            to="/productions"
            className={({ isActive }) => `ev-nav-item ${isActive ? 'active' : ''}`}
            title="Operational Assignment Packages across Shows and Rooms"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              ◫
            </span>
            <span className="ev-nav-label">Assignments</span>
          </NavLink>
        </nav>
      </div>

      <div className="ev-sidebar-divider" />

      <div className="ev-sidebar-section">
        <span className="ev-sidebar-heading">UTILITIES</span>
        <nav className="ev-sidebar-nav" aria-label="Utility Navigation">
          <NavLink
            to="/directory"
            className={({ isActive }) => `ev-nav-item ${isActive ? 'active' : ''}`}
            title="Router Source Catalog & Physical Devices"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              ⎘
            </span>
            <span className="ev-nav-label">Source Directory</span>
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) => `ev-nav-item ${isActive ? 'active' : ''}`}
            title="Change History & Audit Log"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              🕒
            </span>
            <span className="ev-nav-label">History</span>
          </NavLink>

          <div
            className="ev-nav-item disabled"
            title="Excel & JSON Configuration Export (Planned for V1.4)"
            aria-disabled="true"
          >
            <span className="ev-nav-icon" aria-hidden="true">
              ⤓
            </span>
            <span className="ev-nav-label">Export</span>
            <span className="ev-nav-badge">V1.4</span>
          </div>

          <button
            type="button"
            className="ev-nav-item"
            title="Application Settings & Local Data Reset"
            onClick={onOpenSettings}
            data-testid="sidebar-settings-btn"
            style={{
              background: 'none',
              border: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <span className="ev-nav-icon" aria-hidden="true">
              ⚙
            </span>
            <span className="ev-nav-label">Settings</span>
          </button>
        </nav>
      </div>

      <div className="ev-sidebar-footer">
        <div className="ev-sidebar-system-info">
          <span className="ev-info-title">VIP ARCHITECTURE</span>
          <span className="ev-info-detail">5 Frames • 32 Outputs</span>
          <span className="ev-info-detail">264 Destinations</span>
        </div>
      </div>
    </aside>
  );
};
