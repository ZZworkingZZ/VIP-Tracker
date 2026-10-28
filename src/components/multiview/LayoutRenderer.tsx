import React, { useState } from 'react';
import {
  LayoutDefinition,
  LayoutWindowDefinition,
  getWindowPipId,
} from '../../domain/layoutDefinitions';
import { SourceCategory, getSourceCategoryColor } from '../../domain/sourceCategories';
import { PipId, DestinationId } from '../../domain/identifiers';

export interface LayoutWindowData {
  readonly pipId?: PipId | string;
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
  readonly onDropDestinationOnPip?: (pipId: PipId, destinationId: DestinationId) => void;
  readonly onMovePip?: (fromPipId: PipId, toPipId: PipId) => void;
  readonly onClearPip?: (pipId: PipId) => void;
  readonly isEditable?: boolean;
  readonly isDraggingInput?: boolean;
}

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  layout,
  windowsData = [],
  mode = 'card',
  onClickWindow,
  highlightWindowId,
  className = '',
  onDropDestinationOnPip,
  onMovePip,
  onClearPip,
  isEditable = false,
  isDraggingInput = false,
}) => {
  const [dragOverPipId, setDragOverPipId] = useState<string | null>(null);
  const [internalDraggingPipId, setInternalDraggingPipId] = useState<string | null>(null);
  const canAcceptDrop = isEditable && Boolean(onDropDestinationOnPip || onMovePip);
  const showDropTargets = canAcceptDrop && (isDraggingInput || Boolean(internalDraggingPipId));

  // Map window data by pipId (primary) and destinationOffset (fallback)
  const dataByPipOrOffset = React.useMemo(() => {
    const map = new Map<string, LayoutWindowData>();
    for (const d of windowsData) {
      if (d.pipId) {
        map.set(String(d.pipId), d);
      }
      map.set(String(d.destinationOffset), d);
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
      {layout.windows.map((win, idx) => {
        const pipId = getWindowPipId(win, idx);
        const winData =
          dataByPipOrOffset.get(pipId) ?? dataByPipOrOffset.get(String(win.destinationOffset));
        const hasInput = Boolean(winData?.destinationId || winData?.destinationNumber);
        const hasSource = Boolean(winData?.sourceName);
        const categoryColor = winData?.sourceCategory
          ? getSourceCategoryColor(winData.sourceCategory)
          : undefined;
        const isHighlighted = highlightWindowId === win.id || highlightWindowId === pipId;
        const isDragOver = dragOverPipId === pipId;

        // Display labels
        const inputLabel =
          winData?.destinationLabel ||
          (winData?.destinationId ? winData.destinationId.replace(/^DEST:/, '') + ' Input' : null);

        return (
          <div
            key={win.id || pipId}
            data-testid={`layout-window-${win.destinationOffset}`}
            data-pip-id={pipId}
            data-drop-target={canAcceptDrop ? 'true' : undefined}
            data-drag-over={isDragOver ? 'true' : undefined}
            onClick={() => onClickWindow && onClickWindow(win, winData)}
            onDragEnter={(e) => {
              if (canAcceptDrop) {
                e.preventDefault();
                if (dragOverPipId !== pipId) {
                  setDragOverPipId(pipId);
                }
              }
            }}
            onDragOver={(e) => {
              if (canAcceptDrop) {
                e.preventDefault();
                if (e.dataTransfer) {
                  const allowed = e.dataTransfer.effectAllowed;
                  e.dataTransfer.dropEffect = allowed === 'copy' ? 'copy' : 'move';
                }
                if (dragOverPipId !== pipId) {
                  setDragOverPipId(pipId);
                }
              }
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (related && e.currentTarget.contains(related)) {
                return;
              }
              if (dragOverPipId === pipId) {
                setDragOverPipId(null);
              }
            }}
            onDrop={(e) => {
              if (!canAcceptDrop) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverPipId(null);
              setInternalDraggingPipId(null);

              const moveFromPip = e.dataTransfer?.getData('application/vip-pip-move');
              if (moveFromPip && onMovePip) {
                if (moveFromPip !== pipId) {
                  onMovePip(moveFromPip as PipId, pipId);
                }
                return;
              }

              const droppedDest =
                e.dataTransfer?.getData('application/vip-dest-id') ||
                e.dataTransfer?.getData('text/plain');
              if (
                droppedDest &&
                /^DEST:MV-\d{2}-\d{2}$/.test(droppedDest) &&
                onDropDestinationOnPip
              ) {
                onDropDestinationOnPip(pipId, droppedDest as DestinationId);
              }
            }}
            draggable={isEditable && Boolean(winData?.destinationId) && Boolean(onMovePip)}
            onDragStart={(e) => {
              if (isEditable && winData?.destinationId) {
                e.stopPropagation();
                e.dataTransfer.setData('application/vip-pip-move', pipId);
                e.dataTransfer.effectAllowed = 'move';
                setInternalDraggingPipId(pipId);
              }
            }}
            onDragEnd={() => {
              setInternalDraggingPipId(null);
              setDragOverPipId(null);
            }}
            className={`layout-window ${onClickWindow ? 'interactive' : ''} ${
              isHighlighted ? 'highlighted' : ''
            } ${showDropTargets ? 'drop-target-active' : ''} ${isDragOver ? 'drag-over' : ''}`.trim()}
            style={{
              position: 'absolute',
              left: `${win.x}%`,
              top: `${win.y}%`,
              width: `${win.width}%`,
              height: `${win.height}%`,
              boxSizing: 'border-box',
              padding: mode === 'thumbnail' ? '2px' : isHighDensity ? '1px' : '3px 4px',
              border: isDragOver
                ? '2px solid #38bdf8'
                : isHighlighted
                  ? '2px solid #f59e0b'
                  : showDropTargets
                    ? '1px dashed #38bdf8'
                    : '1px solid #363636',
              backgroundColor: isDragOver
                ? 'rgba(56, 189, 248, 0.22)'
                : showDropTargets
                  ? 'rgba(56, 189, 248, 0.06)'
                  : hasSource
                    ? '#131313'
                    : hasInput
                      ? '#0d0d0d'
                      : '#060606',
              boxShadow: isDragOver
                ? 'inset 0 0 10px rgba(56, 189, 248, 0.35)'
                : showDropTargets
                  ? 'inset 0 0 4px rgba(56, 189, 248, 0.15)'
                  : undefined,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
              cursor: onClickWindow || (isEditable && hasInput) ? 'pointer' : 'default',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
            title={
              winData
                ? `${pipId} | ${inputLabel || 'No MV Input assigned'} | ${winData.sourceName || 'No routed Source'}`
                : `${pipId} (Unassigned)`
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
                {pipId}
              </div>
            )}

            {/* CARD MODE (Evertz Miniature Display Card) */}
            {mode === 'card' && (
              <>
                {/* Header: PIP ID on left, status dot on right */}
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
                      fontWeight: 700,
                      color: hasInput ? '#cbd5e1' : '#555555',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {pipId}
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

                {/* Body: Routed Source Name & Input */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
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
                  ) : hasInput ? (
                    <span
                      style={{
                        fontSize: isHighDensity ? '6px' : '8px',
                        color: '#94a3b8',
                        fontFamily: 'var(--ev-font)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {inputLabel || 'MV Input'}
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
                {/* Header: PIP ID + MV Input + Category/Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--ev-font)',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#f8fafc',
                        backgroundColor: '#1e293b',
                        padding: '2px 5px',
                        borderRadius: '2px',
                        border: '1px solid #475569',
                      }}
                    >
                      {pipId}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--ev-font)',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: hasInput ? '#cbd5e1' : '#64748b',
                        backgroundColor: hasInput ? '#1f1f1f' : '#141414',
                        padding: '2px 5px',
                        borderRadius: '2px',
                        border: '1px solid #333333',
                        maxWidth: '110px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {hasInput ? inputLabel || 'MV Input' : 'No MV Input assigned'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {winData?.sourceCategory && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          color: categoryColor || '#38bdf8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {winData.sourceCategory}
                      </span>
                    )}
                    {isEditable && hasInput && onClearPip && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearPip(pipId);
                        }}
                        title={`Clear MV Input from ${pipId}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '0 2px',
                          fontSize: '11px',
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Body: Visual clarity per Phase 2F */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px 0',
                    textAlign: 'center',
                  }}
                >
                  {hasInput ? (
                    hasSource ? (
                      <>
                        <span
                          style={{
                            fontFamily: 'var(--ev-font)',
                            fontSize: layout.windowCount <= 4 ? '18px' : '14px',
                            fontWeight: 800,
                            color: '#ffffff',
                            letterSpacing: '-0.3px',
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
                            color: '#94a3b8',
                            marginTop: '2px',
                          }}
                        >
                          {inputLabel}
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          style={{
                            fontSize: layout.windowCount <= 4 ? '13px' : '11px',
                            fontWeight: 600,
                            color: '#cbd5e1',
                          }}
                        >
                          {inputLabel}
                        </span>
                        <span
                          style={{
                            color: '#64748b',
                            fontSize: '10px',
                            fontStyle: 'italic',
                            marginTop: '2px',
                          }}
                        >
                          No routed Source
                        </span>
                      </>
                    )
                  ) : (
                    <div style={{ color: '#475569', fontSize: '11px', fontStyle: 'italic' }}>
                      No MV Input assigned
                    </div>
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
