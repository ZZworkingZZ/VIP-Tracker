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
        backgroundColor: '#000000',
        borderRadius: mode === 'detail' ? '4px' : '2px',
        overflow: 'hidden',
        boxShadow:
          mode === 'detail'
            ? '0 12px 30px rgba(0, 0, 0, 0.7), inset 0 0 0 1px #444444'
            : '0 2px 6px rgba(0, 0, 0, 0.5), inset 0 0 0 1px #2a2a2a',
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
              padding: mode === 'thumbnail' ? '2px' : isHighDensity ? '1px' : '3px 4px',
              border: '1px solid #363636',
              backgroundColor: hasSource ? '#131313' : '#080808',
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
            {/* THUMBNAIL MODE (Used in Layout Library) */}
            {mode === 'thumbnail' && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontSize: isHighDensity ? '8px' : '10px',
                  fontFamily: 'var(--ev-font)',
                  fontWeight: 700,
                }}
              >
                {win.destinationOffset + 1}
              </div>
            )}

            {/* CARD MODE (Evertz Miniature Display Card) */}
            {mode === 'card' && (
              <>
                {/* Header: Destination number / label (e.g. Src 47 or Dest 47) */}
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
                      fontFamily: 'var(--ev-font)',
                      fontWeight: 600,
                      color: hasSource ? '#9e9e9e' : '#555555',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {winData?.destinationNumber
                      ? `Src ${winData.destinationNumber}`
                      : winData?.destinationLabel || win.destinationOffset + 1}
                  </span>
                  {categoryColor && !isHighDensity && (
                    <span
                      style={{
                        width: '4px',
                        height: '4px',
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
                    padding: isHighDensity ? '0' : '1px 0',
                    overflow: 'hidden',
                  }}
                >
                  {hasSource ? (
                    <span
                      style={{
                        fontFamily: 'var(--ev-font)',
                        fontWeight: 700,
                        fontSize: isHighDensity ? '7px' : layout.windowCount <= 4 ? '12px' : '10px',
                        color: '#f4f4f4',
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
                        fontFamily: 'var(--ev-font)',
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
                      opacity: 0.85,
                      borderRadius: '1px',
                    }}
                  />
                )}
              </>
            )}

            {/* DETAIL MODE (Full-size Output Inspection Modal) */}
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
                      fontFamily: 'var(--ev-font)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#b8b8b8',
                      backgroundColor: '#1f1f1f',
                      padding: '2px 6px',
                      borderRadius: '2px',
                      border: '1px solid #444444',
                    }}
                  >
                    {winData?.destinationLabel || `DEST-${win.destinationOffset + 1}`}
                  </span>
                  {winData?.sourceCategory && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
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
                    padding: '8px 0',
                  }}
                >
                  {hasSource ? (
                    <>
                      <span
                        style={{
                          fontFamily: 'var(--ev-font)',
                          fontSize: layout.windowCount <= 4 ? '20px' : '15px',
                          fontWeight: 800,
                          color: '#ffffff',
                          letterSpacing: '-0.3px',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '95%',
                        }}
                      >
                        {winData?.sourceName}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#858585',
                          marginTop: '2px',
                        }}
                      >
                        Destination Pin #{winData?.destinationNumber}
                      </span>
                    </>
                  ) : (
                    <span
                      style={{
                        color: '#555555',
                        fontSize: '12px',
                        fontStyle: 'italic',
                      }}
                    >
                      No Route Assigned
                    </span>
                  )}
                </div>

                {categoryColor && (
                  <div
                    style={{
                      height: '3px',
                      width: '100%',
                      backgroundColor: categoryColor,
                      borderRadius: '1px',
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
