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
      // Find matching destination record
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
        destinationLabel: dest ? formatDestinationDisplay(dest.id) : `#${destNumber}`,
        sourceName: source?.name || null,
        sourceCategory: source?.category || null,
        isLocked: dest?.locked || false,
      });
    }

    return data;
  }, [output, destinations, sources, layout]);

  const outputDisplayLabel = formatOutputDisplay(output.id);

  if (isAvailable) {
    return (
      <div
        className={`output-display-card available ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
        data-testid={`output-card-${output.id}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0e17',
          border: '1px dashed #222d3d',
          borderRadius: '8px',
          padding: '10px',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          opacity: 0.65,
          minHeight: '190px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 700,
              color: '#64748b',
            }}
          >
            {outputDisplayLabel}
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Out {output.outputNumber}
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            padding: '16px 8px',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              fontWeight: 700,
              color: '#4ade80',
              letterSpacing: '1px',
              marginBottom: '4px',
            }}
          >
            AVAILABLE
          </span>
          <span
            style={{
              fontSize: '11px',
              color: '#475569',
            }}
          >
            No layout assigned
          </span>
        </div>

        <div
          style={{
            marginTop: '8px',
            fontSize: '11px',
            color: '#334155',
            fontFamily: 'monospace',
            textAlign: 'center',
          }}
        >
          Unconfigured Output
        </div>
      </div>
    );
  }

  return (
    <div
      className={`output-display-card assigned ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      data-testid={`output-card-${output.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#111726',
        border: isSelected ? '1px solid #f59e0b' : '1px solid #233044',
        borderRadius: '8px',
        padding: '10px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: isSelected
          ? '0 0 0 2px rgba(245, 158, 11, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)'
          : '0 2px 8px rgba(0, 0, 0, 0.25)',
        transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: output.locked ? '#a855f7' : '#22c55e',
              boxShadow: output.locked ? '0 0 6px #a855f7' : '0 0 6px #22c55e',
              display: 'inline-block',
            }}
            title={output.locked ? 'Locked' : 'Active'}
          />
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 800,
              color: '#f8fafc',
            }}
          >
            {outputDisplayLabel}
          </span>
        </div>

        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: '1px solid rgba(56, 189, 248, 0.3)',
          }}
        >
          {output.layoutName}
        </span>
      </div>

      {/* Miniature Multiview Screen */}
      <div style={{ marginBottom: '8px' }}>
        {layout ? (
          <LayoutRenderer layout={layout} windowsData={windowsData} mode="card" />
        ) : (
          <div
            style={{
              aspectRatio: '16 / 9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0a0e17',
              borderRadius: '6px',
              color: '#64748b',
              fontSize: '11px',
            }}
          >
            Custom layout
          </div>
        )}
      </div>

      {/* Card Footer: Assignment name & Destination range */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: '12px',
            color: '#fbbf24',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '65%',
          }}
          title={output.assignmentName || undefined}
        >
          {output.assignmentName || 'Unassigned'}
        </span>

        {output.destinationStart && output.destinationEnd && (
          <span
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              fontFamily: 'monospace',
            }}
          >
            Dest {output.destinationStart}-{output.destinationEnd}
          </span>
        )}
      </div>
    </div>
  );
};
