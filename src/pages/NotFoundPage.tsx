import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="empty-state" style={{ padding: '4rem 1rem' }}>
      <h1 className="page-title" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
        404
      </h1>
      <p className="page-description" style={{ marginBottom: '2rem' }}>
        The requested multiview operational view does not exist.
      </p>
      <Link to="/" className="nav-link active" style={{ display: 'inline-block' }}>
        Return to Dashboard
      </Link>
    </div>
  );
};
