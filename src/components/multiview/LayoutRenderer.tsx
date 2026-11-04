import React, { useState } from 'react';
import {
  LayoutDefinition,
  LayoutWindowDefinition,
  getWindowPipId,
} from '../../domain/layoutDefinitions';
import { SourceCategory, getSourceCategoryColor } from '../../domain/sourceCategories';
import { PipId, DestinationId } from '../../domain/identifiers';
import { formatSourceNameWithAlias } from '../../domain/models';

export interface LayoutWindowData {
  readonly pipId?: PipId | string;
  readonly outputId?: string;
  readonly multiviewId?: string;
  readonly destinationOffset: number;
  readonly destinationNumber?: number | null;
  readonly destinationId?: string | null;
  readonly destinationLabel?: string | null;
  readonly sourceName?: string | null;
  readonly sourceAlias?: string | null;
  readonly sourceCategory?: SourceCategory | null;
  readonly lawoSourceName?: string | null;
  readonly processingChainLabel?: string | null;
  readonly resolvedFlowSummary?: string | null;
  readonly isFlowIncomplete?: boolean;
  readonly isLocked?: boolean;
}

export interface LayoutRendererProps {
  readonly layout: LayoutDefinition;
  readonly windowsData?: readonly LayoutWindowData[];
  readonly mode?: 'thumbnail' | 'card' | 'detail';
  readonly onClickWindow?: (window: LayoutWindowDefinition, data?: LayoutWindowData) => void;
  readonly onViewSignalFlow?: (pipId: PipId, data?: LayoutWindowData) => void;
  readonly highlightWindowId?: string;
  readonly className?: string;
  readonly onDropDestinationOnPip?: (pipId: PipId, destinationId: DestinationId) => void;
  readonly onMovePip?: (fromPipId: PipId, toPipId: PipId) => void;
  readonly onClearPip?: (pipId: PipId) => void;
  readonly isEditable?: boolean;
  readonly isDraggingInput?: boolean;
}

/** MV input name. The " Input" suffix is dropped by CSS at medium tile sizes; full text stays in the tooltip. */
const PipInputLabel: React.FC<{ label: string; primary?: boolean }> = ({ label, primary }) => {
  const suffix = ' Input';
  const hasSuffix = label.endsWith(suffix);
  return (
    <span className={`pip-input ${primary ? 'pip-input--primary' : ''}`.trim()} title={label}>
      {hasSuffix ? label.slice(0, -suffix.length) : label}
      {hasSuffix && <span className="pip-input-suffix">{suffix}</span>}
    </span>
  );
};

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  layout,
  windowsData = [],
  mode = 'card',
  onClickWindow,
  onViewSignalFlow,
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
            className={`layout-window ${mode === 'thumbnail' ? '' : 'pip-tile'} ${
              onClickWindow ? 'interactive' : ''
            } ${isHighlighted ? 'highlighted' : ''} ${
              showDropTargets ? 'drop-target-active' : ''
            } ${isDragOver ? 'drag-over' : ''}`
              .replace(/\s+/g, ' ')
              .trim()}
            style={{
              position: 'absolute',
              left: `${win.x}%`,
              top: `${win.y}%`,
              width: `${win.width}%`,
              height: `${win.height}%`,
              boxSizing: 'border-box',
              padding: mode === 'thumbnail' ? '2px' : 0,
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
                ? `${pipId} | ${inputLabel || 'No MV Input assigned'} | ${formatSourceNameWithAlias(winData.sourceName, winData.sourceAlias) || 'No routed Source'}`
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

            {/* CARD + DETAIL MODES: one container-query driven tile (see .pip-* in components.css) */}
            {mode !== 'thumbnail' && (
              <div className={`pip-inner pip-inner--${mode}`}>
                <div className="pip-head">
                  <span
                    className={`pip-num ${hasInput ? '' : 'pip-num--empty'}`.trim()}
                    title={pipId}
                  >
                    {pipId}
                  </span>
                  <div className="pip-actions">
                    {mode === 'detail' && winData?.sourceCategory && (
                      <span
                        className="pip-category"
                        title={winData.sourceCategory}
                        style={{ color: categoryColor || '#38bdf8' }}
                      >
                        {winData.sourceCategory}
                      </span>
                    )}
                    {onViewSignalFlow && (
                      <button
                        type="button"
                        className="pip-flow-btn"
                        data-testid={
                          winData?.outputId
                            ? `${mode === 'detail' ? 'detail-' : ''}view-signal-flow-btn-${winData.outputId}-${pipId}`
                            : `${mode === 'detail' ? 'detail-' : ''}view-signal-flow-btn-${pipId}`
                        }
                        aria-label={`View Signal Flow for ${pipId}`}
                        title="View Signal Flow"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewSignalFlow(pipId, winData);
                        }}
                      >
                        <svg
                          className="pip-flow-icon"
                          viewBox="0 0 12 12"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M1 6h8M6 2.5 9.5 6 6 9.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="pip-flow-text">
                          {mode === 'detail' ? 'View Signal Flow' : 'Flow'}
                        </span>
                      </button>
                    )}
                    {mode === 'detail' && isEditable && hasInput && onClearPip && (
                      <button
                        type="button"
                        className="pip-clear-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearPip(pipId);
                        }}
                        title={`Clear MV Input from ${pipId}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                <div className="pip-body">
                  {hasSource ? (
                    <>
                      {winData?.sourceAlias && (
                        <span
                          className="pip-alias"
                          data-testid={`${mode === 'detail' ? 'detail-' : ''}pip-source-alias-${pipId}`}
                          title={winData.sourceAlias}
                        >
                          {winData.sourceAlias}
                        </span>
                      )}
                      <span className="pip-name" title={winData?.sourceName ?? undefined}>
                        {winData?.sourceName}
                      </span>
                      {mode === 'detail' && hasInput && inputLabel && (
                        <PipInputLabel label={inputLabel} />
                      )}
                      {winData?.resolvedFlowSummary && (
                        <span
                          className="pip-status"
                          data-testid={`${mode === 'detail' ? 'detail-' : ''}pip-compact-flow-${pipId}`}
                          title={winData.resolvedFlowSummary}
                        >
                          {winData.resolvedFlowSummary}
                        </span>
                      )}
                    </>
                  ) : hasInput ? (
                    <>
                      <PipInputLabel label={inputLabel || 'MV Input'} primary />
                      {mode === 'detail' && (
                        <span className="pip-status pip-status--muted" title="No routed Source">
                          No routed Source
                        </span>
                      )}
                    </>
                  ) : mode === 'detail' ? (
                    <span className="pip-name pip-name--empty" title="No MV Input assigned">
                      No MV Input assigned
                    </span>
                  ) : (
                    <span className="pip-name pip-name--empty">—</span>
                  )}
                </div>

                {categoryColor && (
                  <div className="pip-tally" style={{ backgroundColor: categoryColor }} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
