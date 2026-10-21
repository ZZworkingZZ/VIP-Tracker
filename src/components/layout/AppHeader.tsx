import React from 'react';
import { NavLink } from 'react-router-dom';

export const AppHeader: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-section">
          <NavLink to="/" className="brand-title">
            <span>Evertz VIP Source Tracker</span>
            <span className="brand-badge">OPS</span>
          </NavLink>
          <span
            className="badge-local-data"
            title="Displaying tracked repository baseline data, not direct live hardware state"
            role="status"
          >
            Local Data
          </span>
        </div>

        <nav className="app-nav" aria-label="Main Navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Displays
          </NavLink>
          <NavLink
            to="/layouts"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Layouts
          </NavLink>
          <NavLink
            to="/sources"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Sources
          </NavLink>
          <NavLink
            to="/productions"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Assignments
          </NavLink>
          <NavLink
            to="/directory"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            Source Directory
          </NavLink>
        </nav>
      </div>
    </header>
  );
};
