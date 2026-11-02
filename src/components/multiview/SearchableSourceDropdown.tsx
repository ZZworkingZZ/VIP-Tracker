import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Source, formatSourceCompact } from '../../domain/models';
import { SourceId } from '../../domain/identifiers';
import type { SourcePickerRole } from '../../domain/pickerTypes';
import { SearchableSourcePicker } from './SearchableSourcePicker';
import { computePopoverPosition, type PopoverPosition } from './popoverPosition';

export interface SearchableSourceDropdownProps {
  readonly sources: readonly Source[];
  readonly pickerRole?: SourcePickerRole;
  readonly selectedSourceId: SourceId | null;
  readonly onChange: (sourceId: SourceId | null) => void;
  readonly placeholder?: string;
  readonly unassignLabel?: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly dataTestId?: string;
  readonly searchTestId?: string;
  readonly borderColor?: string;
  readonly style?: React.CSSProperties;
  readonly maxWidth?: string | number;
  readonly popoverWidth?: string | number;
}

export const SearchableSourceDropdown: React.FC<SearchableSourceDropdownProps> = ({
  sources,
  pickerRole,
  selectedSourceId,
  onChange,
  placeholder = '-- Select Source --',
  unassignLabel = '-- BLANK --',
  disabled = false,
  ariaLabel,
  dataTestId,
  searchTestId,
  borderColor,
  style,
  maxWidth = '180px',
  popoverWidth = '360px',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const minPopoverWidth = useMemo(() => {
    if (typeof popoverWidth === 'number') return popoverWidth;
    const n = parseInt(popoverWidth, 10);
    return Number.isFinite(n) && popoverWidth.endsWith('px') ? n : 360;
  }, [popoverWidth]);

  // Approximate width needed for the longest source label (~7px/char + padding), capped by helper.
  const desiredWidth = useMemo(() => {
    let longest = 0;
    for (const s of sources) longest = Math.max(longest, formatSourceCompact(s).length);
    return Math.max(minPopoverWidth, longest * 7 + 120);
  }, [sources, minPopoverWidth]);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Trigger scrolled completely out of the viewport: close cleanly.
    if (r.height > 0 && (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw)) {
      setIsOpen(false);
      return;
    }
    setPosition(
      computePopoverPosition({
        trigger: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
        viewportWidth: vw,
        viewportHeight: vh,
        desiredWidth,
      })
    );
  }, [desiredWidth]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    reposition();
  }, [isOpen, reposition]);

  // Reposition on resize and on any scroll (capture phase catches the overlay body's scroll)
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = (e: Event) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return;
      }
      reposition();
    };
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen, reposition]);

  const selectedSource = sources.find((s) => s.id === selectedSourceId);
  const displayLabel = selectedSource
    ? formatSourceCompact(selectedSource)
    : !selectedSourceId
      ? unassignLabel
      : selectedSourceId;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inside =
        (containerRef.current && containerRef.current.contains(target)) ||
        (popoverRef.current && popoverRef.current.contains(target));
      if (!inside) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  const activeBorder = isOpen ? '#38bdf8' : borderColor ? borderColor : '#383838';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '100%',
        maxWidth,
        ...style,
      }}
    >
      {/* Hidden underlying select for complete test and screen reader backwards compatibility */}
      <select
        aria-label={ariaLabel}
        data-testid={dataTestId}
        value={selectedSourceId ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.value ? (e.target.value as SourceId) : null;
          onChange(val);
        }}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 0,
          height: 0,
          margin: 0,
          padding: 0,
          border: 'none',
        }}
      >
        <option value="">{unassignLabel}</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {formatSourceCompact(s)}
          </option>
        ))}
      </select>

      {/* Styled Dropdown Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-testid={dataTestId ? `trigger-${dataTestId}` : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          width: '100%',
          padding: '2px 6px',
          fontSize: '11px',
          backgroundColor: '#141414',
          color: selectedSource ? '#f8fafc' : '#94a3b8',
          border: `1px solid ${activeBorder}`,
          borderRadius: '2px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayLabel || placeholder}
        </span>
        <span style={{ fontSize: '9px', color: '#64748b', flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Popover Dropdown Panel: portaled to body so overlay overflow can never clip it */}
      {isOpen &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="true"
            data-testid="source-picker-popover"
            style={{
              position: 'fixed',
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              zIndex: 1400,
              width: position.width,
              maxHeight: position.maxHeight,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#1a1a1a',
              border: '1px solid #444444',
              borderRadius: '4px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              padding: '8px',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <SearchableSourcePicker
              sources={sources}
              pickerRole={pickerRole}
              selectedSourceId={selectedSourceId}
              onSelectSource={(id) => {
                onChange(id);
                setIsOpen(false);
              }}
              unassignLabel={unassignLabel}
              searchInputTestId={searchTestId}
              onClose={() => setIsOpen(false)}
              fillHeight
            />
          </div>,
          document.body
        )}
    </div>
  );
};
