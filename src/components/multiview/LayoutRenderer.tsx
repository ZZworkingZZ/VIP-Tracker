import React from 'react';
import { LayoutDefinition, LayoutWindowDefinition } from '../../domain/layoutDefinitions';
import { SourceCategory, getSourceCategoryColor } from '../../domain/sourceCategories';

export interface LayoutWindowData {
  readonly destinationOffset: number;
  readonly destinationNumber?: number | null;
  readonly destinationId?: string | null;
  readonly destinationLabel?: string | null;
  readonly sourceName?: string | null;
  readonly sourceCategory?: SourceCategory | null;
  readonly isLocked?: boolean;
}

export interface LayoutRendererProps {
  readonly layout: LayoutDefinition;
  readonly windowsData?: readonly LayoutWindowData[];
  readonly mode?: 'thumbnail' | 'card' | 'detail';
  readonly onClickWindow?: (window: LayoutWindowDefinition, data?: LayoutWindowData) => void;
  readonly highlightWindowId?: string;
  readonly className?: string;
}

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  layout,
  windowsData = [],
  mode = 'card',
  onClickWindow,
  highlightWindowId,
  className = '',
}) => {
  // Map window data by offset for O(1) lookup
  const dataByOffset = React.useMemo(() => {
    const map = new Map<number, LayoutWindowData>();
    for (const d of windowsData) {
      map.set(d.destinationOffset, d);
    }
    return map;
  }, [windowsData]);

  const isHighDensity = layout.windowCount >= 20;

  return (
    <div
      className={`layout-monitor-frame layout-mode-${mode} ${className}`}
      data-testid={`layout-renderer-${layout.id}`}
      style={{
        aspectRatio: '16 / 9',
        position: 'relative',
        width: '100%',
        backgroundColor: '#070a12',
        borderRadius: mode === 'detail' ? '8px' : '6px',
        overflow: 'hidden',
        boxShadow:
          mode === 'detail'
            ? '0 12px 30px rgba(0, 0, 0, 0.6), inset 0 0 0 2px #2e3d54'
            : '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 0 0 1px #222d3d',
      }}
    >
      {layout.windows.map((win) => {
        const winData = dataByOffset.get(win.destinationOffset);
        const hasSource = Boolean(winData?.sourceName);
        const categoryColor = winData?.sourceCategory
          ? getSourceCategoryColor(winData.sourceCategory)
          : undefined;
        const isHighlighted = highlightWindowId === win.id;

        return (
          <div
            key={win.id}
            data-testid={`layout-window-${win.destinationOffset}`}
            onClick={() => onClickWindow && onClickWindow(win, winData)}
            className={`layout-window ${onClickWindow ? 'interactive' : ''} ${
              isHighlighted ? 'highlighted' : ''
            }`}
            style={{
              position: 'absolute',
              left: `${win.x}%`,
              top: `${win.y}%`,
              width: `${win.width}%`,
              height: `${win.height}%`,
              boxSizing: 'border-box',
              padding: mode === 'thumbnail' ? '2px' : isHighDensity ? '1px' : '4px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: hasSource ? '#0e1626' : '#0b0f19',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
              cursor: onClickWindow ? 'pointer' : 'default',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
            title={
              winData
                ? `Dest: ${winData.destinationLabel || winData.destinationNumber || win.destinationOffset + 1} | Source: ${
                    winData.sourceName || 'Unassigned'
                  }`
                : `Window ${win.destinationOffset + 1}`
            }
          >
            {/* THUMBNAIL MODE */}
            {mode === 'thumbnail' && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255, 255, 255, 0.45)',
                  fontSize: isHighDensity ? '8px' : '10px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              >
                {win.destinationOffset + 1}
              </div>
            )}

            {/* CARD MODE */}
            {mode === 'card' && (
              <>
                {/* Header: Destination number / label */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    lineHeight: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: isHighDensity ? '7px' : '9px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: hasSource ? '#94a3b8' : '#475569',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {winData?.destinationLabel ||
                      (winData?.destinationNumber
                        ? `#${winData.destinationNumber}`
                        : win.destinationOffset + 1)}
                  </span>
                  {categoryColor && !isHighDensity && (
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: categoryColor,
                        display: 'inline-block',
                      }}
                    />
                  )}
                </div>

                {/* Body: Routed Source Name */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: isHighDensity ? '0' : '2px 0',
                    overflow: 'hidden',
                  }}
                >
                  {hasSource ? (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: isHighDensity ? '7px' : layout.windowCount <= 4 ? '12px' : '10px',
                        color: '#f8fafc',
                        letterSpacing: '-0.2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {winData?.sourceName}
                    </span>
                  ) : (
                    <span
                      style={{
                        color: 'rgba(255, 255, 255, 0.15)',
                        fontSize: isHighDensity ? '6px' : '9px',
                        fontFamily: 'monospace',
                      }}
                    >
                      —
                    </span>
                  )}
                </div>

                {/* Footer tally line */}
                {categoryColor && (
                  <div
                    style={{
                      height: '2px',
                      width: '100%',
                      backgroundColor: categoryColor,
                      opacity: 0.8,
                      borderRadius: '1px',
                    }}
                  />
                )}
              </>
            )}

            {/* DETAIL MODE */}
            {mode === 'detail' && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      backgroundColor: 'rgba(15, 23, 42, 0.7)',
                      padding: '2px 5px',
                      borderRadius: '3px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    {winData?.destinationLabel || `DEST-${win.destinationOffset + 1}`}
                  </span>
                  {winData?.sourceCategory && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: categoryColor || '#38bdf8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {winData.sourceCategory}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {hasSource ? (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: layout.windowCount <= 4 ? '18px' : '14px',
                        color: '#f8fafc',
                        textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                        backgroundColor: 'rgba(14, 22, 38, 0.8)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: `1px solid ${categoryColor ? categoryColor + '40' : '#334155'}`,
                        maxWidth: '90%',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {winData?.sourceName}
                    </span>
                  ) : (
                    <span
                      style={{
                        color: '#475569',
                        fontSize: '12px',
                        fontStyle: 'italic',
                      }}
                    >
                      Unrouted Destination
                    </span>
                  )}
                </div>

                {categoryColor && (
                  <div
                    style={{
                      height: '3px',
                      width: '100%',
                      backgroundColor: categoryColor,
                      borderRadius: '2px',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
