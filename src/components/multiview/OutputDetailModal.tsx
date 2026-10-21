import React from 'react';
import { MultiviewOutput, Destination, Source } from '../../domain/models';
import { getLayoutDefinition } from '../../domain/layoutDefinitions';
import { LayoutRenderer, LayoutWindowData } from './LayoutRenderer';
import { formatOutputDisplay, formatDestinationDisplay } from '../../domain/identifiers';

export interface OutputDetailModalProps {
  readonly output: MultiviewOutput | null;
  readonly destinations?: readonly Destination[];
  readonly sources?: readonly Source[];
  readonly allOutputs?: readonly MultiviewOutput[];
  readonly onClose: () => void;
  readonly onSelectOutput?: (output: MultiviewOutput) => void;
}

export const OutputDetailModal: React.FC<OutputDetailModalProps> = ({
  output,
  destinations = [],
  sources = [],
  allOutputs = [],
  onClose,
  onSelectOutput,
}) => {
  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!output) {
    return null;
  }

  const layout = getLayoutDefinition(output.layoutName);
  const isAvailable = output.status === 'Available' || !output.layoutName;
  const outputLabel = formatOutputDisplay(output.id);

  // Derive window destination records
  const windowsData: LayoutWindowData[] = [];
  const coveredDestinations: Destination[] = [];

  if (output.destinationStart && output.destinationEnd && layout) {
    for (let i = 0; i < layout.windowCount; i++) {
      const destNumber = output.destinationStart + i;
      const dest = destinations.find(
        (d) => d.multiviewId === output.multiviewId && d.destinationNumber === destNumber
      );
      const source = dest?.assignedSourceId
        ? sources.find((s) => s.id === dest.assignedSourceId)
        : null;

      if (dest) {
        coveredDestinations.push(dest);
      }

      windowsData.push({
        destinationOffset: i,
        destinationNumber: destNumber,
        destinationId: dest?.id,
        destinationLabel: dest ? formatDestinationDisplay(dest.id) : `#${destNumber}`,
        sourceName: source?.name || null,
        sourceCategory: source?.category || null,
        isLocked: dest?.locked || false,
      });
    }
  }

  // Find previous/next outputs within same multiview
  const siblingOutputs = allOutputs.filter((o) => o.multiviewId === output.multiviewId);
  const currentIndex = siblingOutputs.findIndex((o) => o.id === output.id);
  const prevOutput = currentIndex > 0 ? siblingOutputs[currentIndex - 1] : null;
  const nextOutput =
    currentIndex >= 0 && currentIndex < siblingOutputs.length - 1
      ? siblingOutputs[currentIndex + 1]
      : null;

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      data-testid="output-detail-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        className="output-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#111726',
          border: '1px solid #2e3d54',
          borderRadius: '12px',
          maxWidth: '920px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            backgroundColor: '#0a0e17',
            borderBottom: '1px solid #222d3d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '18px',
                fontWeight: 800,
                color: '#f8fafc',
                letterSpacing: '-0.3px',
              }}
            >
              {outputLabel}
            </span>

            <span
              style={{
                padding: '3px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'monospace',
                backgroundColor: isAvailable
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
                color: isAvailable ? '#4ade80' : '#60a5fa',
                border: `1px solid ${isAvailable ? '#16a34a' : '#2563eb'}`,
              }}
            >
              {isAvailable ? 'AVAILABLE' : output.assignmentName || 'ASSIGNED'}
            </span>

            {output.locked && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(168, 85, 247, 0.18)',
                  color: '#c084fc',
                  border: '1px solid #9333ea',
                }}
              >
                LOCKED
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {prevOutput && onSelectOutput && (
              <button
                type="button"
                onClick={() => onSelectOutput(prevOutput)}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ← Prev ({formatOutputDisplay(prevOutput.id)})
              </button>
            )}

            {nextOutput && onSelectOutput && (
              <button
                type="button"
                onClick={() => onSelectOutput(nextOutput)}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Next ({formatOutputDisplay(nextOutput.id)}) →
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail modal"
              style={{
                marginLeft: '8px',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: '#0a0e17',
              borderRadius: '8px',
              border: '1px solid #1e293b',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                Multiviewer
              </div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                }}
              >
                {output.multiviewId}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                Layout Geometry
              </div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#38bdf8',
                  fontFamily: 'monospace',
                }}
              >
                {output.layoutName || 'None (Available)'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                Destination Range
              </div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                }}
              >
                {output.destinationStart && output.destinationEnd
                  ? `${output.destinationStart} – ${output.destinationEnd} (${
                      output.destinationEnd - output.destinationStart + 1
                    } windows)`
                  : 'None'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>
                Operational Assignment
              </div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#fbbf24',
                  fontFamily: 'monospace',
                }}
              >
                {output.assignmentName || 'None'}
              </div>
            </div>
          </div>

          {/* Visual Multiview Display */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1', margin: 0 }}>
                Visual Multiview Output Display
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Aspect Ratio 16:9 Broadcast Feed
              </span>
            </div>

            {layout ? (
              <LayoutRenderer layout={layout} windowsData={windowsData} mode="detail" />
            ) : (
              <div
                style={{
                  aspectRatio: '16 / 9',
                  backgroundColor: '#070a12',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed #222d3d',
                  color: '#64748b',
                }}
              >
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#4ade80',
                    marginBottom: '4px',
                  }}
                >
                  AVAILABLE OUTPUT
                </span>
                <span style={{ fontSize: '12px' }}>
                  No layout has been assigned to {outputLabel}
                </span>
              </div>
            )}
          </div>

          {/* Destination Breakdown Table */}
          {windowsData.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#cbd5e1',
                  marginBottom: '10px',
                }}
              >
                Covered Destinations & Routed Sources ({windowsData.length})
              </h3>

              <div
                style={{
                  overflowX: 'auto',
                  border: '1px solid #222d3d',
                  borderRadius: '6px',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0a0e17', borderBottom: '1px solid #222d3d' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>
                        Window #
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>
                        Destination Number
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>
                        Destination ID
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>
                        Routed Source
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>
                        Category
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {windowsData.map((win, idx) => (
                      <tr
                        key={win.destinationOffset}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.3)',
                        }}
                      >
                        <td
                          style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#64748b' }}
                        >
                          Window {win.destinationOffset + 1}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: '#f8fafc',
                          }}
                        >
                          #{win.destinationNumber}
                        </td>
                        <td
                          style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#38bdf8' }}
                        >
                          {win.destinationLabel || '—'}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: win.sourceName ? '#f8fafc' : '#475569',
                          }}
                        >
                          {win.sourceName || '— [Unrouted]'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {win.sourceCategory ? (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                color: '#38bdf8',
                              }}
                            >
                              {win.sourceCategory}
                            </span>
                          ) : (
                            <span style={{ color: '#475569' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
