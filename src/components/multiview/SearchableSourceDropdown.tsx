import React, { useState, useRef, useEffect } from 'react';
import { Source, formatSourceCompact } from '../../domain/models';
import { SourceId } from '../../domain/identifiers';
import { SearchableSourcePicker } from './SearchableSourcePicker';

export interface SearchableSourceDropdownProps {
  readonly sources: readonly Source[];
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 1400,
            width: popoverWidth,
            maxWidth: '90vw',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444444',
            borderRadius: '4px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            padding: '8px',
            boxSizing: 'border-box',
          }}
        >
          <SearchableSourcePicker
            sources={sources}
            selectedSourceId={selectedSourceId}
            onSelectSource={(id) => {
              onChange(id);
              setIsOpen(false);
            }}
            unassignLabel={unassignLabel}
            searchInputTestId={searchTestId}
            onClose={() => setIsOpen(false)}
            maxHeight="260px"
          />
        </div>
      )}
    </div>
  );
};
