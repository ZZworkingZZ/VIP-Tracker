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
        destinationLabel: dest ? formatDestinationDisplay(dest.id) : `Src ${destNumber}`,
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
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        className="output-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1c1c1c',
          border: '1px solid #444444',
          borderRadius: '4px',
          maxWidth: '920px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          fontFamily: 'var(--ev-font)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#272727',
            borderBottom: '1px solid #383838',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '16px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.2px',
              }}
            >
              {outputLabel}
            </span>

            <span
              style={{
                padding: '2px 8px',
                borderRadius: '2px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: isAvailable ? 'rgba(84, 213, 74, 0.2)' : 'rgba(40, 100, 163, 0.4)',
                color: isAvailable ? '#54d54a' : '#60a5fa',
                border: `1px solid ${isAvailable ? '#54d54a' : '#3378c2'}`,
              }}
            >
              {isAvailable ? 'AVAILABLE' : output.assignmentName || 'ASSIGNED'}
            </span>

            {output.locked && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '2px',
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(168, 85, 247, 0.25)',
                  color: '#c084fc',
                  border: '1px solid #9333ea',
                }}
              >
                LOCKED
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {prevOutput && onSelectOutput && (
              <button
                type="button"
                onClick={() => onSelectOutput(prevOutput)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: '#303030',
                  color: '#e2e8f0',
                  border: '1px solid #444444',
                  borderRadius: '2px',
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
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: '#303030',
                  color: '#e2e8f0',
                  border: '1px solid #444444',
                  borderRadius: '2px',
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
                marginLeft: '6px',
                width: '28px',
                height: '28px',
                borderRadius: '2px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cccccc',
                fontSize: '16px',
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
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {/* Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: '#161616',
              borderRadius: '2px',
              border: '1px solid #333333',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Multiviewer Frame
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {output.multiviewId}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Layout Geometry
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#60a5fa',
                }}
              >
                {output.layoutName || 'None (Available)'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Destination Range
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#ffffff',
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
              <div
                style={{
                  fontSize: '10px',
                  color: '#858585',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Operational Assignment
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#f59e0b',
                }}
              >
                {output.assignmentName || 'None'}
              </div>
            </div>
          </div>

          {/* Visual Multiview Display */}
          <div style={{ marginBottom: '18px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                Visual Multiview Output Display
              </h3>
              <span style={{ fontSize: '11px', color: '#858585' }}>
                Aspect Ratio 16:9 Broadcast Monitor
              </span>
            </div>

            {layout ? (
              <LayoutRenderer layout={layout} windowsData={windowsData} mode="detail" />
            ) : (
              <div
                style={{
                  aspectRatio: '16 / 9',
                  backgroundColor: '#111111',
                  borderRadius: '2px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed #383838',
                  color: '#858585',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#54d54a',
                    marginBottom: '4px',
                    letterSpacing: '1px',
                  }}
                >
                  AVAILABLE OUTPUT
                </span>
                <span style={{ fontSize: '11px' }}>
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
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#e2e8f0',
                  marginBottom: '8px',
                }}
              >
                Covered Destinations & Routed Sources ({windowsData.length})
              </h3>

              <div
                style={{
                  overflowX: 'auto',
                  border: '1px solid #333333',
                  borderRadius: '2px',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#242424', borderBottom: '1px solid #383838' }}>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          color: '#b8b8b8',
                          fontWeight: 700,
                        }}
                      >
                        Window #
                      </th>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          color: '#b8b8b8',
                          fontWeight: 700,
                        }}
                      >
                        Destination Number
                      </th>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          color: '#b8b8b8',
                          fontWeight: 700,
                        }}
                      >
                        Destination ID
                      </th>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          color: '#b8b8b8',
                          fontWeight: 700,
                        }}
                      >
                        Routed Source
                      </th>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          color: '#b8b8b8',
                          fontWeight: 700,
                        }}
                      >
                        Category
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {windowsData.map((win, idx) => (
                      <tr
                        key={win.destinationOffset}
                        style={{
                          borderBottom: '1px solid #282828',
                          backgroundColor: idx % 2 === 0 ? '#191919' : '#141414',
                        }}
                      >
                        <td style={{ padding: '6px 10px', color: '#858585' }}>
                          Window {win.destinationOffset + 1}
                        </td>
                        <td
                          style={{
                            padding: '6px 10px',
                            fontWeight: 700,
                            color: '#ffffff',
                          }}
                        >
                          #{win.destinationNumber}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#60a5fa' }}>
                          {win.destinationLabel || '—'}
                        </td>
                        <td
                          style={{
                            padding: '6px 10px',
                            fontWeight: 700,
                            color: win.sourceName ? '#ffffff' : '#555555',
                          }}
                        >
                          {win.sourceName || '— [Unrouted]'}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {win.sourceCategory ? (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '2px',
                                backgroundColor: 'rgba(40, 100, 163, 0.3)',
                                color: '#60a5fa',
                              }}
                            >
                              {win.sourceCategory}
                            </span>
                          ) : (
                            <span style={{ color: '#555555' }}>—</span>
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
