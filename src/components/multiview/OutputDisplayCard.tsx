import React from 'react';
import { MultiviewOutput, Destination, Source } from '../../domain/models';
import { getLayoutDefinition } from '../../domain/layoutDefinitions';
import { LayoutRenderer, LayoutWindowData } from './LayoutRenderer';
import { formatOutputDisplay, formatDestinationDisplay } from '../../domain/identifiers';

export interface OutputDisplayCardProps {
  readonly output: MultiviewOutput;
  readonly destinations?: readonly Destination[];
  readonly sources?: readonly Source[];
  readonly onClick?: () => void;
  readonly isSelected?: boolean;
}

export const OutputDisplayCard: React.FC<OutputDisplayCardProps> = ({
  output,
  destinations = [],
  sources = [],
  onClick,
  isSelected = false,
}) => {
  const isAvailable = output.status === 'Available' || !output.layoutName;
  const layout = React.useMemo(() => getLayoutDefinition(output.layoutName), [output.layoutName]);

  // Compute window data by matching destinations covering this output range
  const windowsData = React.useMemo(() => {
    if (!output.destinationStart || !output.destinationEnd || !layout) {
      return [];
    }

    const data: LayoutWindowData[] = [];
    for (let i = 0; i < layout.windowCount; i++) {
      const destNumber = output.destinationStart + i;
      const dest = destinations.find(
        (d) => d.multiviewId === output.multiviewId && d.destinationNumber === destNumber
      );
      const source = dest?.assignedSourceId
        ? sources.find((s) => s.id === dest.assignedSourceId)
        : null;

      data.push({
        destinationOffset: i,
        destinationNumber: destNumber,
        destinationId: dest?.id,
        destinationLabel: dest ? formatDestinationDisplay(dest.id) : `Src ${destNumber}`,
        sourceName: source?.name || null,
        sourceCategory: source?.category || null,
        isLocked: dest?.locked || false,
      });
    }

    return data;
  }, [output, destinations, sources, layout]);

  const outputDisplayLabel = formatOutputDisplay(output.id);

  // Status LED color computation
  const statusColor = React.useMemo(() => {
    if (isAvailable) return 'var(--ev-text-dim)';
    if (output.locked) return 'var(--ev-status-locked)';
    return 'var(--ev-status-ok)';
  }, [isAvailable, output.locked]);

  const statusTitle = isAvailable
    ? 'Available (Unassigned)'
    : output.locked
      ? 'Locked Resource'
      : 'Valid tracking baseline';

  /* --------------------------------------------------------------------------
     AVAILABLE / UNASSIGNED OUTPUT CARD
     -------------------------------------------------------------------------- */
  if (isAvailable) {
    return (
      <article
        className={`ev-output-card available ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
        data-testid={`output-card-${output.id}`}
        role="button"
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
          }
        }}
        aria-label={`${outputDisplayLabel} (Available)`}
      >
        <div className="ev-card-header">
          <div className="ev-card-id-group">
            <span className="ev-card-output-id">{outputDisplayLabel}</span>
          </div>
          <div className="ev-card-status-group">
            <span
              className="ev-status-dot available"
              style={{ backgroundColor: statusColor }}
              title={statusTitle}
              aria-label={statusTitle}
            />
          </div>
        </div>

        <div className="ev-card-screen-frame available-frame">
          <div className="ev-available-placeholder">
            <span className="ev-available-title">AVAILABLE</span>
            <span className="ev-available-sub">No layout assigned</span>
          </div>
        </div>

        <div className="ev-card-footer">
          <span className="ev-card-assignment unassigned">Available</span>
          <span className="ev-card-dest-range">Out {output.outputNumber}</span>
        </div>
      </article>
    );
  }

  /* --------------------------------------------------------------------------
     ACTIVE ASSIGNED OUTPUT CARD (EVERTZ MULTIVIEWER DISPLAY CARD)
     -------------------------------------------------------------------------- */
  return (
    <article
      className={`ev-output-card assigned ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      data-testid={`output-card-${output.id}`}
      role="button"
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${outputDisplayLabel} ${output.layoutName} (${output.assignmentName || 'Assigned'})`}
    >
      {/* Top Header: Output ID + Layout Badge + Status LED */}
      <div className="ev-card-header">
        <div className="ev-card-id-group">
          <span className="ev-card-output-id">{outputDisplayLabel}</span>
          {output.locked && (
            <span
              className="ev-card-lock-badge"
              title="Output is locked for operational production"
            >
              🔒
            </span>
          )}
        </div>

        <div className="ev-card-status-group">
          <span className="ev-card-layout-badge">{output.layoutName}</span>
          <span
            className="ev-status-dot active"
            style={{ backgroundColor: statusColor }}
            title={statusTitle}
            aria-label={statusTitle}
          />
        </div>
      </div>

      {/* Center Screen: Evertz Miniature Multiview Geometry & Routed Sources */}
      <div className="ev-card-screen-frame">
        {layout ? (
          <LayoutRenderer layout={layout} windowsData={windowsData} mode="card" />
        ) : (
          <div className="ev-custom-layout-fallback">Custom layout</div>
        )}
      </div>

      {/* Bottom Footer: Assignment Name & Destination Range */}
      <div className="ev-card-footer">
        <span className="ev-card-assignment" title={output.assignmentName || 'Unassigned'}>
          {output.assignmentName || 'Unassigned'}
        </span>

        {output.destinationStart && output.destinationEnd && (
          <span
            className="ev-card-dest-range"
            title={`Multiview router destinations ${output.destinationStart} through ${output.destinationEnd}`}
          >
            Dest {output.destinationStart}–{output.destinationEnd}
          </span>
        )}
      </div>
    </article>
  );
};
