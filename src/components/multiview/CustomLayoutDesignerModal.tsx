import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDefinition,
  LayoutWindowDefinition,
  LayoutCategory,
} from '../../domain/layoutDefinitions';
import { createPipId } from '../../domain/identifiers';

export interface CustomLayoutDesignerModalProps {
  readonly isOpen: boolean;
  readonly initialLayout?: LayoutDefinition | null;
  readonly existingLayoutNames: readonly string[];
  readonly onSave: (layout: LayoutDefinition) => void;
  readonly onClose: () => void;
}

interface DragState {
  type: 'move' | 'resize';
  windowId: string;
  startX: number;
  startY: number;
  initialWinX: number;
  initialWinY: number;
  initialWinW: number;
  initialWinH: number;
}

const SNAP_THRESHOLD = 1.5; // percentage points
const COMMON_GRID_LINES = [0, 12.5, 20, 25, 33.333, 50, 66.666, 75, 80, 87.5, 100];

export const CustomLayoutDesignerModal: React.FC<CustomLayoutDesignerModalProps> = ({
  isOpen,
  initialLayout,
  existingLayoutNames,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(initialLayout && initialLayout.isCustom);

  const [layoutName, setLayoutName] = useState<string>(initialLayout?.name ?? '');
  const [category, setCategory] = useState<LayoutCategory>(initialLayout?.category ?? 'Custom');
  const [description, setDescription] = useState<string>(
    initialLayout?.description ?? 'Custom multiview layout configuration'
  );
  const [windows, setWindows] = useState<LayoutWindowDefinition[]>(() => {
    if (initialLayout && initialLayout.windows.length > 0) {
      return JSON.parse(JSON.stringify(initialLayout.windows));
    }
    // Default starting point: 4-quad split
    return [
      { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
      { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
      { id: 'w-3', x: 0, y: 50, width: 50, height: 50, destinationOffset: 2 },
      { id: 'w-4', x: 50, y: 50, width: 50, height: 50, destinationOffset: 3 },
    ];
  });

  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(() => {
    return initialLayout?.windows[0]?.id ?? 'w-1';
  });

  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(true);
  const [showGridGuides, setShowGridGuides] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);

  // Sync state when initialLayout changes
  useEffect(() => {
    if (initialLayout) {
      setLayoutName(initialLayout.name);
      setCategory(initialLayout.category);
      setDescription(initialLayout.description);
      setWindows(JSON.parse(JSON.stringify(initialLayout.windows)));
      setSelectedWindowId(initialLayout.windows[0]?.id ?? null);
    } else {
      setLayoutName('');
      setCategory('Custom');
      setDescription('Custom multiview layout configuration');
      setWindows([
        { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
        { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
        { id: 'w-3', x: 0, y: 50, width: 50, height: 50, destinationOffset: 2 },
        { id: 'w-4', x: 50, y: 50, width: 50, height: 50, destinationOffset: 3 },
      ]);
      setSelectedWindowId('w-1');
    }
    setErrorMsg(null);
  }, [initialLayout, isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedWindow = windows.find((w) => w.id === selectedWindowId) ?? null;

  // Re-index destination offsets and ensure stable pipId deterministically
  const reindexWindows = (wins: LayoutWindowDefinition[]): LayoutWindowDefinition[] => {
    return wins.map((w, idx) => ({
      ...w,
      pipId: w.pipId || createPipId(idx + 1),
      destinationOffset: idx,
    }));
  };

  // Add Window
  const handleAddWindow = () => {
    setWindows((prev) => {
      const nextIdx = prev.length;
      // Position new window sensibly (e.g. 25% x 25% or 33% x 33%)
      const size = 25;
      const x = (nextIdx * 10) % (100 - size);
      const y = (nextIdx * 10) % (100 - size);
      const newWin: LayoutWindowDefinition = {
        id: `w-${Date.now()}-${nextIdx + 1}`,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: size,
        height: size,
        destinationOffset: nextIdx,
      };
      const updated = [...prev, newWin];
      setSelectedWindowId(newWin.id);
      return reindexWindows(updated);
    });
  };

  // Duplicate Window
  const handleDuplicateWindow = () => {
    if (!selectedWindow) return;
    setWindows((prev) => {
      const offset = 5;
      const nextX = Math.min(100 - selectedWindow.width, selectedWindow.x + offset);
      const nextY = Math.min(100 - selectedWindow.height, selectedWindow.y + offset);
      const newWin: LayoutWindowDefinition = {
        id: `w-${Date.now()}-${prev.length + 1}`,
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
        width: selectedWindow.width,
        height: selectedWindow.height,
        destinationOffset: prev.length,
      };
      const updated = [...prev, newWin];
      setSelectedWindowId(newWin.id);
      return reindexWindows(updated);
    });
  };

  // Delete Window
  const handleDeleteWindow = useCallback(() => {
    if (!selectedWindowId) return;
    setWindows((prev) => {
      if (prev.length <= 1) {
        setErrorMsg('Layout must have at least one window.');
        return prev;
      }
      const filtered = prev.filter((w) => w.id !== selectedWindowId);
      const reindexed = reindexWindows(filtered);
      setSelectedWindowId(reindexed[0]?.id ?? null);
      return reindexed;
    });
  }, [selectedWindowId]);

  // Update selected window property directly
  const handleUpdateSelectedWindow = (prop: 'x' | 'y' | 'width' | 'height', value: number) => {
    if (!selectedWindow) return;
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== selectedWindow.id) return w;
        let x = w.x;
        let y = w.y;
        let width = w.width;
        let height = w.height;

        if (prop === 'x') {
          x = Math.max(0, Math.min(100 - width, value));
        } else if (prop === 'y') {
          y = Math.max(0, Math.min(100 - height, value));
        } else if (prop === 'width') {
          width = Math.max(5, Math.min(100 - x, value));
        } else if (prop === 'height') {
          height = Math.max(5, Math.min(100 - y, value));
        }

        return {
          ...w,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          width: Math.round(width * 1000) / 1000,
          height: Math.round(height * 1000) / 1000,
        };
      })
    );
  };

  // Keyboard navigation for selected window
  useEffect(() => {
    if (!isOpen || !selectedWindowId) return;

    const handleKeyNav = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const step = e.shiftKey ? 5 : 1;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWindows((prev) =>
          prev.map((w) =>
            w.id === selectedWindowId
              ? { ...w, x: Math.max(0, Math.round((w.x - step) * 100) / 100) }
              : w
          )
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWindows((prev) =>
          prev.map((w) =>
            w.id === selectedWindowId
              ? {
                  ...w,
                  x: Math.min(100 - w.width, Math.round((w.x + step) * 100) / 100),
                }
              : w
          )
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWindows((prev) =>
          prev.map((w) =>
            w.id === selectedWindowId
              ? { ...w, y: Math.max(0, Math.round((w.y - step) * 100) / 100) }
              : w
          )
        );
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWindows((prev) =>
          prev.map((w) =>
            w.id === selectedWindowId
              ? {
                  ...w,
                  y: Math.min(100 - w.height, Math.round((w.y + step) * 100) / 100),
                }
              : w
          )
        );
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteWindow();
      }
    };

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [isOpen, selectedWindowId, handleDeleteWindow]);

  // Snapping logic calculation
  const applySnapping = useCallback(
    (
      targetX: number,
      targetY: number,
      width: number,
      height: number,
      activeWinId: string
    ): { x: number; y: number } => {
      if (!snappingEnabled) {
        return { x: targetX, y: targetY };
      }

      let snappedX = targetX;
      let snappedY = targetY;

      // 1. Canvas edge snapping
      if (Math.abs(snappedX) < SNAP_THRESHOLD) snappedX = 0;
      if (Math.abs(snappedX + width - 100) < SNAP_THRESHOLD) snappedX = 100 - width;
      if (Math.abs(snappedY) < SNAP_THRESHOLD) snappedY = 0;
      if (Math.abs(snappedY + height - 100) < SNAP_THRESHOLD) snappedY = 100 - height;

      // 2. Window-to-window snapping
      const others = windows.filter((w) => w.id !== activeWinId);
      for (const other of others) {
        // Snap left edge to other left or right edge
        if (Math.abs(snappedX - other.x) < SNAP_THRESHOLD) {
          snappedX = other.x;
        } else if (Math.abs(snappedX - (other.x + other.width)) < SNAP_THRESHOLD) {
          snappedX = other.x + other.width;
        }
        // Snap right edge to other left or right edge
        if (Math.abs(snappedX + width - other.x) < SNAP_THRESHOLD) {
          snappedX = other.x - width;
        } else if (Math.abs(snappedX + width - (other.x + other.width)) < SNAP_THRESHOLD) {
          snappedX = other.x + other.width - width;
        }

        // Snap top edge to other top or bottom edge
        if (Math.abs(snappedY - other.y) < SNAP_THRESHOLD) {
          snappedY = other.y;
        } else if (Math.abs(snappedY - (other.y + other.height)) < SNAP_THRESHOLD) {
          snappedY = other.y + other.height;
        }
        // Snap bottom edge to other top or bottom edge
        if (Math.abs(snappedY + height - other.y) < SNAP_THRESHOLD) {
          snappedY = other.y - height;
        } else if (Math.abs(snappedY + height - (other.y + other.height)) < SNAP_THRESHOLD) {
          snappedY = other.y + other.height - height;
        }
      }

      // 3. Grid line snapping
      for (const line of COMMON_GRID_LINES) {
        if (Math.abs(snappedX - line) < SNAP_THRESHOLD) snappedX = line;
        if (Math.abs(snappedX + width - line) < SNAP_THRESHOLD) snappedX = line - width;
        if (Math.abs(snappedY - line) < SNAP_THRESHOLD) snappedY = line;
        if (Math.abs(snappedY + height - line) < SNAP_THRESHOLD) snappedY = line - height;
      }

      return { x: snappedX, y: snappedY };
    },
    [snappingEnabled, windows]
  );

  // Mouse / Pointer Drag Handlers
  const handlePointerDown = (
    e: React.PointerEvent,
    win: LayoutWindowDefinition,
    type: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedWindowId(win.id);

    dragStateRef.current = {
      type,
      windowId: win.id,
      startX: e.clientX,
      startY: e.clientY,
      initialWinX: win.x,
      initialWinY: win.y,
      initialWinW: win.width,
      initialWinH: win.height,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaXPercent = ((moveEvent.clientX - state.startX) / rect.width) * 100;
      const deltaYPercent = ((moveEvent.clientY - state.startY) / rect.height) * 100;

      if (state.type === 'move') {
        const rawX = state.initialWinX + deltaXPercent;
        const rawY = state.initialWinY + deltaYPercent;

        const snapped = applySnapping(
          rawX,
          rawY,
          state.initialWinW,
          state.initialWinH,
          state.windowId
        );

        const clampedX = Math.max(0, Math.min(100 - state.initialWinW, snapped.x));
        const clampedY = Math.max(0, Math.min(100 - state.initialWinH, snapped.y));

        setWindows((prev) =>
          prev.map((w) =>
            w.id === state.windowId
              ? {
                  ...w,
                  x: Math.round(clampedX * 1000) / 1000,
                  y: Math.round(clampedY * 1000) / 1000,
                }
              : w
          )
        );
      } else if (state.type === 'resize') {
        let rawW = Math.max(5, state.initialWinW + deltaXPercent);
        let rawH = Math.max(5, state.initialWinH + deltaYPercent);

        if (snappingEnabled) {
          // Snap right and bottom edges
          if (Math.abs(state.initialWinX + rawW - 100) < SNAP_THRESHOLD) {
            rawW = 100 - state.initialWinX;
          }
          if (Math.abs(state.initialWinY + rawH - 100) < SNAP_THRESHOLD) {
            rawH = 100 - state.initialWinY;
          }
        }

        const clampedW = Math.max(5, Math.min(100 - state.initialWinX, rawW));
        const clampedH = Math.max(5, Math.min(100 - state.initialWinY, rawH));

        setWindows((prev) =>
          prev.map((w) =>
            w.id === state.windowId
              ? {
                  ...w,
                  width: Math.round(clampedW * 1000) / 1000,
                  height: Math.round(clampedH * 1000) / 1000,
                }
              : w
          )
        );
      }
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Validate and Save
  const handleSave = () => {
    const trimmedName = layoutName.trim();
    if (!trimmedName) {
      setErrorMsg('Layout name is required.');
      return;
    }

    // Check duplicate name against existing layouts (unless editing same layout)
    const upperName = trimmedName.toUpperCase();
    const isDuplicate = existingLayoutNames.some((n) => {
      if (initialLayout && n.toUpperCase() === initialLayout.name.toUpperCase()) {
        return false;
      }
      return n.toUpperCase() === upperName;
    });

    if (isDuplicate) {
      setErrorMsg(`A layout named "${trimmedName}" already exists. Please choose a unique name.`);
      return;
    }

    if (windows.length === 0) {
      setErrorMsg('Layout must contain at least one window.');
      return;
    }

    // Validate bounds
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (w.x < 0 || w.y < 0 || w.x + w.width > 100.01 || w.y + w.height > 100.01) {
        setErrorMsg(`Window ${i + 1} extends outside the 16:9 canvas boundaries.`);
        return;
      }
    }

    const layoutId =
      initialLayout && initialLayout.isCustom
        ? initialLayout.id
        : `custom-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

    const newLayout: LayoutDefinition = {
      id: layoutId,
      name: trimmedName,
      windowCount: windows.length,
      aspectRatio: '16:9',
      category,
      description: description.trim() || `Custom ${windows.length}-window multiview layout`,
      windows: reindexWindows(windows),
      isCustom: true,
      createdAt: initialLayout?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newLayout);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-designer-title"
      data-testid="custom-layout-designer-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
          width: '94vw',
          maxWidth: '1200px',
          maxHeight: '92vh',
          backgroundColor: '#161616',
          border: '1px solid #383838',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
          overflow: 'hidden',
          color: '#e2e8f0',
        }}
      >
        {/* MODAL HEADER */}
        <header
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #2a2a2a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#1f1f1f',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '2px',
                  backgroundColor: 'rgba(59, 130, 246, 0.25)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  letterSpacing: '0.05em',
                }}
              >
                {isEditing ? 'EDIT CUSTOM LAYOUT' : 'NEW CUSTOM LAYOUT'}
              </span>
              <h2
                id="custom-designer-title"
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                Custom Layout Designer
              </h2>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Visually position and scale 16:9 multiview monitor windows with broadcast snapping and
              deterministic destination offsets.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Custom Layout Designer"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px',
            }}
          >
            &times;
          </button>
        </header>

        {/* ERROR BANNER */}
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: '10px 20px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f87171',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* MODAL BODY */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: '16px',
            padding: '16px 20px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {/* MAIN CANVAS AREA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Canvas Toolbar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                backgroundColor: '#1b1b1b',
                padding: '8px 12px',
                borderRadius: '3px',
                border: '1px solid #2a2a2a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleAddWindow}
                  className="btn btn-primary"
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: '1px solid #3b82f6',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                  data-testid="add-window-button"
                >
                  + Add Window
                </button>

                <button
                  type="button"
                  onClick={handleDuplicateWindow}
                  disabled={!selectedWindow}
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    backgroundColor: '#282828',
                    color: selectedWindow ? '#cbd5e1' : '#64748b',
                    border: '1px solid #404040',
                    borderRadius: '2px',
                    cursor: selectedWindow ? 'pointer' : 'not-allowed',
                  }}
                  data-testid="duplicate-window-button"
                >
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={handleDeleteWindow}
                  disabled={!selectedWindow || windows.length <= 1}
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: selectedWindow && windows.length > 1 ? '#f87171' : '#64748b',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '2px',
                    cursor: selectedWindow && windows.length > 1 ? 'pointer' : 'not-allowed',
                  }}
                  data-testid="delete-window-button"
                >
                  Delete Window
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={snappingEnabled}
                    onChange={(e) => setSnappingEnabled(e.target.checked)}
                  />
                  Smart Snapping
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showGridGuides}
                    onChange={(e) => setShowGridGuides(e.target.checked)}
                  />
                  Grid Guides
                </label>

                <span
                  style={{
                    color: '#38bdf8',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 6px',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    borderRadius: '2px',
                  }}
                >
                  {windows.length} Window{windows.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* 16:9 Canvas Frame */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#0a0a0a',
                border: '2px solid #333333',
                borderRadius: '4px',
                padding: '4px',
                boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.9)',
              }}
            >
              <div
                ref={canvasRef}
                data-testid="designer-canvas"
                onClick={() => setSelectedWindowId(null)}
                style={{
                  aspectRatio: '16 / 9',
                  width: '100%',
                  position: 'relative',
                  backgroundColor: '#000000',
                  overflow: 'hidden',
                  cursor: 'crosshair',
                  userSelect: 'none',
                }}
              >
                {/* Background Grid Guide Lines */}
                {showGridGuides && (
                  <svg
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      opacity: 0.25,
                    }}
                  >
                    {/* Vertical grid lines */}
                    <line
                      x1="25%"
                      y1="0"
                      x2="25%"
                      y2="100%"
                      stroke="#475569"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1="33.333%"
                      y1="0"
                      x2="33.333%"
                      y2="100%"
                      stroke="#38bdf8"
                      strokeDasharray="2 4"
                    />
                    <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#64748b" strokeWidth="1.5" />
                    <line
                      x1="66.666%"
                      y1="0"
                      x2="66.666%"
                      y2="100%"
                      stroke="#38bdf8"
                      strokeDasharray="2 4"
                    />
                    <line
                      x1="75%"
                      y1="0"
                      x2="75%"
                      y2="100%"
                      stroke="#475569"
                      strokeDasharray="3 3"
                    />
                    {/* Horizontal grid lines */}
                    <line
                      x1="0"
                      y1="25%"
                      x2="100%"
                      y2="25%"
                      stroke="#475569"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1="0"
                      y1="33.333%"
                      x2="100%"
                      y2="33.333%"
                      stroke="#38bdf8"
                      strokeDasharray="2 4"
                    />
                    <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#64748b" strokeWidth="1.5" />
                    <line
                      x1="0"
                      y1="66.666%"
                      x2="100%"
                      y2="66.666%"
                      stroke="#38bdf8"
                      strokeDasharray="2 4"
                    />
                    <line
                      x1="0"
                      y1="75%"
                      x2="100%"
                      y2="75%"
                      stroke="#475569"
                      strokeDasharray="3 3"
                    />
                  </svg>
                )}

                {/* Multiview Windows */}
                {windows.map((win, idx) => {
                  const isSelected = win.id === selectedWindowId;
                  return (
                    <div
                      key={win.id}
                      data-testid={`designer-window-${win.destinationOffset}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWindowId(win.id);
                      }}
                      onPointerDown={(e) => handlePointerDown(e, win, 'move')}
                      style={{
                        position: 'absolute',
                        left: `${win.x}%`,
                        top: `${win.y}%`,
                        width: `${win.width}%`,
                        height: `${win.height}%`,
                        boxSizing: 'border-box',
                        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.25)' : '#121212',
                        border: isSelected ? '2px solid #3b82f6' : '1px solid #444444',
                        boxShadow: isSelected
                          ? '0 0 10px rgba(59, 130, 246, 0.6), inset 0 0 0 1px #60a5fa'
                          : 'none',
                        cursor: 'move',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '4px 6px',
                        overflow: 'hidden',
                        zIndex: isSelected ? 10 : 1,
                        transition: dragStateRef.current ? 'none' : 'border-color 0.15s ease',
                      }}
                    >
                      {/* Window Header Badge */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            color: isSelected ? '#ffffff' : '#94a3b8',
                            backgroundColor: isSelected ? '#2563eb' : '#222222',
                            padding: '1px 5px',
                            borderRadius: '2px',
                          }}
                        >
                          W-{idx + 1}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            color: '#64748b',
                            fontWeight: 600,
                          }}
                        >
                          Offset {win.destinationOffset}
                        </span>
                      </div>

                      {/* Window Size Indicator */}
                      <div
                        style={{
                          fontSize: '10px',
                          color: isSelected ? '#93c5fd' : '#475569',
                          textAlign: 'center',
                          fontWeight: 600,
                          pointerEvents: 'none',
                        }}
                      >
                        {Math.round(win.width)}% &times; {Math.round(win.height)}%
                      </div>

                      {/* Resize Handle (Bottom-Right) */}
                      {isSelected && (
                        <div
                          data-testid="window-resize-handle"
                          onPointerDown={(e) => handlePointerDown(e, win, 'resize')}
                          style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            width: '14px',
                            height: '14px',
                            cursor: 'se-resize',
                            backgroundColor: '#3b82f6',
                            clipPath: 'polygon(100% 0, 0 100%, 100% 100%)',
                            zIndex: 20,
                          }}
                          title="Drag to resize window"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Instruction Tip */}
            <div
              style={{
                fontSize: '11px',
                color: '#64748b',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0 4px',
              }}
            >
              <span>Tip: Click &amp; drag windows to move. Drag corner handle to resize.</span>
              <span>Arrow keys: Nudge 1% (Shift: 5%). Delete key: Remove window.</span>
            </div>
          </div>

          {/* SIDE PANEL: LAYOUT PROPERTIES & INSPECTOR */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              backgroundColor: '#1b1b1b',
              padding: '14px',
              borderRadius: '4px',
              border: '1px solid #2a2a2a',
              overflowY: 'auto',
            }}
          >
            {/* Section 1: Layout Metadata */}
            <div>
              <h3
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid #282828',
                  paddingBottom: '4px',
                }}
              >
                Layout Properties
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label
                    htmlFor="custom-layout-name"
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Layout Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="custom-layout-name"
                    type="text"
                    value={layoutName}
                    onChange={(e) => {
                      setLayoutName(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="e.g. STUDIO-A-5WAY"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: '#111111',
                      border: '1px solid #404040',
                      borderRadius: '3px',
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                    data-testid="layout-name-input"
                  />
                </div>

                <div>
                  <label
                    htmlFor="custom-layout-category"
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Category
                  </label>
                  <select
                    id="custom-layout-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as LayoutCategory)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: '#111111',
                      border: '1px solid #404040',
                      borderRadius: '3px',
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: '12px',
                    }}
                  >
                    <option value="Custom">Custom</option>
                    <option value="Standard Grid">Standard Grid</option>
                    <option value="Hero Split">Hero Split</option>
                    <option value="High Density">High Density</option>
                    <option value="Audio / Metering">Audio / Metering</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="custom-layout-desc"
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Description
                  </label>
                  <textarea
                    id="custom-layout-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of monitor arrangement"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: '#111111',
                      border: '1px solid #404040',
                      borderRadius: '3px',
                      padding: '6px 8px',
                      color: '#ffffff',
                      fontSize: '12px',
                      resize: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Selected Window Precision Inspector */}
            <div>
              <h3
                style={{
                  margin: '10px 0 10px 0',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  letterSpacing: '0.05em',
                  borderBottom: '1px solid #282828',
                  paddingBottom: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Selected Window</span>
                {selectedWindow && (
                  <span style={{ color: '#38bdf8', fontSize: '11px', textTransform: 'none' }}>
                    Window #{windows.indexOf(selectedWindow) + 1}
                  </span>
                )}
              </h3>

              {selectedWindow ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: '#94a3b8',
                          marginBottom: '2px',
                        }}
                      >
                        X Position (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={100 - selectedWindow.width}
                        value={selectedWindow.x}
                        onChange={(e) =>
                          handleUpdateSelectedWindow('x', parseFloat(e.target.value) || 0)
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          backgroundColor: '#111111',
                          border: '1px solid #404040',
                          borderRadius: '2px',
                          padding: '4px 6px',
                          color: '#ffffff',
                          fontSize: '12px',
                        }}
                        data-testid="window-x-input"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: '#94a3b8',
                          marginBottom: '2px',
                        }}
                      >
                        Y Position (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={100 - selectedWindow.height}
                        value={selectedWindow.y}
                        onChange={(e) =>
                          handleUpdateSelectedWindow('y', parseFloat(e.target.value) || 0)
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          backgroundColor: '#111111',
                          border: '1px solid #404040',
                          borderRadius: '2px',
                          padding: '4px 6px',
                          color: '#ffffff',
                          fontSize: '12px',
                        }}
                        data-testid="window-y-input"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: '#94a3b8',
                          marginBottom: '2px',
                        }}
                      >
                        Width (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="5"
                        max={100 - selectedWindow.x}
                        value={selectedWindow.width}
                        onChange={(e) =>
                          handleUpdateSelectedWindow('width', parseFloat(e.target.value) || 5)
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          backgroundColor: '#111111',
                          border: '1px solid #404040',
                          borderRadius: '2px',
                          padding: '4px 6px',
                          color: '#ffffff',
                          fontSize: '12px',
                        }}
                        data-testid="window-width-input"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: '#94a3b8',
                          marginBottom: '2px',
                        }}
                      >
                        Height (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="5"
                        max={100 - selectedWindow.y}
                        value={selectedWindow.height}
                        onChange={(e) =>
                          handleUpdateSelectedWindow('height', parseFloat(e.target.value) || 5)
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          backgroundColor: '#111111',
                          border: '1px solid #404040',
                          borderRadius: '2px',
                          padding: '4px 6px',
                          color: '#ffffff',
                          fontSize: '12px',
                        }}
                        data-testid="window-height-input"
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '6px 8px',
                      backgroundColor: '#111111',
                      borderRadius: '2px',
                      border: '1px solid #282828',
                      fontSize: '11px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ color: '#888888' }}>Destination Offset:</span>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                      +{selectedWindow.destinationOffset}
                    </span>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        color: '#64748b',
                        marginBottom: '4px',
                      }}
                    >
                      Quick Size Presets
                    </span>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateSelectedWindow('width', 50);
                          handleUpdateSelectedWindow('height', 50);
                        }}
                        style={{
                          padding: '3px 0',
                          fontSize: '10px',
                          backgroundColor: '#222222',
                          color: '#cbd5e1',
                          border: '1px solid #333333',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        50 &times; 50
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateSelectedWindow('width', 33.333);
                          handleUpdateSelectedWindow('height', 33.333);
                        }}
                        style={{
                          padding: '3px 0',
                          fontSize: '10px',
                          backgroundColor: '#222222',
                          color: '#cbd5e1',
                          border: '1px solid #333333',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        33 &times; 33
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleUpdateSelectedWindow('width', 66.666);
                          handleUpdateSelectedWindow('height', 66.666);
                        }}
                        style={{
                          padding: '3px 0',
                          fontSize: '10px',
                          backgroundColor: '#222222',
                          color: '#cbd5e1',
                          border: '1px solid #333333',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        Hero (66%)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '24px 12px',
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: '12px',
                    backgroundColor: '#141414',
                    borderRadius: '2px',
                    border: '1px dashed #333333',
                  }}
                >
                  Click any window on the canvas to inspect and edit coordinates.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <footer
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #2a2a2a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#1f1f1f',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {windows.length} window{windows.length === 1 ? '' : 's'} defined • Aspect Ratio 16:9
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                backgroundColor: 'transparent',
                color: '#cbd5e1',
                border: '1px solid #404040',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              data-testid="designer-cancel-button"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 700,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: '1px solid #3b82f6',
                borderRadius: '3px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.4)',
              }}
              data-testid="designer-save-button"
            >
              Save Custom Layout
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
