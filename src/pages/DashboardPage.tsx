import { useTrackerSnapshot } from '../hooks/useTracker';
import { selectDashboardTotals, selectMultiviewSummaries } from '../domain/selectors';
import { formatOutputDisplay } from '../domain/identifiers';

export const DashboardPage: React.FC = () => {
  const { snapshot } = useTrackerSnapshot();

  if (!snapshot) {
    return null;
  }

  const totals = selectDashboardTotals(snapshot);
  const multiviewSummaries = selectMultiviewSummaries(snapshot);

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <h1 className="page-title">Multiview Operations Dashboard</h1>
        <p className="page-description">
          Operational overview of Evertz VIP multiview outputs, capacities, and active layouts
          across all frames.
        </p>
      </header>

      {/* Top High-Level Metrics */}
      <section className="metrics-grid" aria-label="System Metrics">
        <div className="metric-card">
          <span className="metric-label">Total Multiviews</span>
          <span className="metric-value">{totals.totalMultiviews}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Outputs</span>
          <span className="metric-value">{totals.totalOutputs}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Assigned Outputs</span>
          <span className="metric-value highlight-assigned">{totals.assignedOutputs}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Available Outputs</span>
          <span className="metric-value highlight-available">{totals.availableOutputs}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Locked Resources</span>
          <span className="metric-value highlight-locked">{totals.lockedOutputs}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Active Warnings</span>
          <span className="metric-value highlight-warning">{totals.activeValidationFindings}</span>
        </div>
      </section>

      {/* Multiview Frames Cards Grid */}
      <section aria-label="Multiview Frame Status">
        <h2 className="findings-title" style={{ marginBottom: '1rem' }}>
          Multiview Frames (MV-01 — MV-05)
        </h2>
        <div className="cards-grid">
          {multiviewSummaries.map((summary) => {
            const mv = summary.multiview;
            return (
              <article key={mv.id} className="mv-card">
                <header className="mv-card-header">
                  <div>
                    <h3 className="mv-title">{mv.displayName}</h3>
                    <span className="muted-text" style={{ fontSize: '0.75rem' }}>
                      Capacities: {mv.outputCapacity} Outputs / {mv.destinationCapacity}{' '}
                      Destinations
                    </span>
                  </div>
                  {summary.conflictCount > 0 ? (
                    <span className="status-badge badge-warning">
                      {summary.conflictCount} Warning{summary.conflictCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="status-badge badge-available">Optimal</span>
                  )}
                </header>

                <div className="mv-stats-bar">
                  <span>
                    Assigned: <strong>{summary.assignedOutputsCount}</strong>
                  </span>
                  <span>
                    Available: <strong>{summary.availableOutputsCount}</strong>
                  </span>
                  <span>
                    Locked: <strong>{summary.lockedOutputsCount}</strong>
                  </span>
                </div>

                <div className="mv-outputs-list">
                  {summary.outputs.map((out) => {
                    const isAssigned = out.status === 'Assigned';
                    return (
                      <div key={out.id} className="mv-output-row">
                        <span className="output-id-mono">{formatOutputDisplay(out.id)}</span>
                        <div className="output-info">
                          {isAssigned ? (
                            <>
                              <span className="output-assignment">{out.assignmentName}</span>
                              <span className="output-layout-range">
                                {out.layoutName} (Dest {out.destinationStart}
                                {out.destinationStart !== out.destinationEnd
                                  ? `-${out.destinationEnd}`
                                  : ''}
                                )
                              </span>
                            </>
                          ) : (
                            <span className="muted-text" style={{ fontStyle: 'italic' }}>
                              Available
                            </span>
                          )}
                        </div>
                        <span
                          className={`status-badge ${
                            isAssigned ? 'badge-assigned' : 'badge-available'
                          }`}
                        >
                          {out.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Validation Findings Summary */}
      {snapshot.validationFindings.length > 0 && (
        <section className="findings-container" aria-label="Validation Findings">
          <h2 className="findings-title">
            <span>Data Observations &amp; Warnings</span>
            <span className="status-badge badge-warning">
              {snapshot.validationFindings.length} Total
            </span>
          </h2>
          <div className="findings-list">
            {snapshot.validationFindings.map((finding) => (
              <div
                key={finding.id}
                className={`finding-item finding-${finding.severity}`}
                role="note"
              >
                <span
                  className={`status-badge ${
                    finding.severity === 'error'
                      ? 'badge-conflict'
                      : finding.severity === 'warning'
                        ? 'badge-warning'
                        : 'badge-assigned'
                  }`}
                >
                  {finding.severity.toUpperCase()}
                </span>
                <span className="finding-message">{finding.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
