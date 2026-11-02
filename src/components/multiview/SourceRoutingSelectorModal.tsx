import React, { useState, useEffect } from 'react';
import { Source } from '../../domain/models';
import { SourceId, createSourceId } from '../../domain/identifiers';
import { SOURCE_CATEGORIES, SourceCategory, inferSourceType } from '../../domain/sourceCategories';
import type { SourcePickerRole } from '../../domain/pickerTypes';
import { SearchableSourcePicker } from './SearchableSourcePicker';

export interface SourceRoutingSelectorModalProps {
  readonly isOpen: boolean;
  readonly pickerRole?: SourcePickerRole;
  readonly destinationNumber: number;
  readonly destinationId?: string;
  readonly windowIndex?: number;
  readonly currentSourceId: string | null;
  readonly sources: readonly Source[];
  readonly onApplySource: (sourceId: SourceId | null) => void;
  readonly onAddNewSource: (source: Source) => void;
  readonly onClose: () => void;
}

export const SourceRoutingSelectorModal: React.FC<SourceRoutingSelectorModalProps> = ({
  isOpen,
  pickerRole,
  destinationNumber,
  destinationId,
  windowIndex,
  currentSourceId,
  sources,
  onApplySource,
  onAddNewSource,
  onClose,
}) => {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(currentSourceId);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [newSourceName, setNewSourceName] = useState<string>('');
  const [newSourceCategory, setNewSourceCategory] = useState<SourceCategory>('Virtual Camera');

  useEffect(() => {
    setSelectedSourceId(currentSourceId);
    setIsAddingNew(false);
  }, [isOpen, currentSourceId]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddingNew) {
          setIsAddingNew(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAddingNew, onClose]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApplySource(selectedSourceId as SourceId | null);
    onClose();
  };

  const handleCreateAndApplyNew = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSourceName.trim();
    if (!trimmed) return;

    // Check if source with this exact name already exists
    const existing = sources.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      onApplySource(existing.id);
      onClose();
      return;
    }

    const newSourceType = inferSourceType(trimmed);
    const isVirtual = newSourceType === 'virtual';
    const newSource: Source = {
      id: createSourceId(trimmed),
      name: trimmed,
      normalizedName: trimmed,
      category: newSourceCategory,
      active: true,
      upstreamSourceId: null,
      sourceType: newSourceType,
      routeRole: isVirtual ? 'tieline' : 'evertz_source',
      router: isVirtual ? 'Both' : 'Evertz',
    };

    onAddNewSource(newSource);
    onApplySource(newSource.id);
    onClose();
  };

  const renderAddSourceSection = () => {
    if (!isAddingNew) {
      return (
        <button
          type="button"
          onClick={() => {
            setIsAddingNew(true);
            setNewSourceName('');
          }}
          data-testid="show-add-source-form-btn"
          style={{
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: '#2864a3',
            color: '#ffffff',
            border: '1px solid #38bdf8',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          + Catalog New Source in Directory
        </button>
      );
    }

    return (
      <form
        onSubmit={handleCreateAndApplyNew}
        data-testid="add-new-source-form"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '360px',
          margin: '0 auto',
          textAlign: 'left',
        }}
      >
        <div>
          <label
            style={{
              fontSize: '10px',
              color: '#858585',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            New Source Name
          </label>
          <input
            type="text"
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
            placeholder="e.g. CNN-NYP-Feed-1"
            required
            data-testid="new-source-name-input"
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '12px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #444',
              color: '#fff',
              borderRadius: '2px',
            }}
          />
        </div>

        <div>
          <label
            style={{
              fontSize: '10px',
              color: '#858585',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Category
          </label>
          <select
            value={newSourceCategory}
            onChange={(e) => setNewSourceCategory(e.target.value as SourceCategory)}
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '12px',
              backgroundColor: '#262626',
              border: '1px solid #444',
              color: '#fff',
              borderRadius: '2px',
            }}
          >
            {SOURCE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="submit"
            data-testid="save-new-source-btn"
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#2864a3',
              color: '#fff',
              border: '1px solid #38bdf8',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Catalog & Apply Route
          </button>
          <button
            type="button"
            onClick={() => setIsAddingNew(false)}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              backgroundColor: '#262626',
              color: '#cbd5e1',
              border: '1px solid #444',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  };

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      data-testid="source-routing-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="routing-selector-title"
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
        zIndex: 1300,
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
          maxWidth: '640px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          fontFamily: 'var(--ev-font)',
        }}
      >
        {/* Header */}
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
          <div>
            <div
              id="routing-selector-title"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Route Broadcast Source
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {typeof windowIndex === 'number' ? `Window ${windowIndex + 1} · ` : ''}Destination #
              {destinationNumber} {destinationId ? `(${destinationId})` : ''}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close source routing selector"
            data-testid="close-source-routing-btn"
            style={{
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

        {/* Modal Body with SearchableSourcePicker */}
        <div
          style={{
            padding: '12px 16px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <SearchableSourcePicker
            sources={sources}
            pickerRole={pickerRole}
            selectedSourceId={selectedSourceId}
            onSelectSource={setSelectedSourceId}
            onDoubleClickSource={(id) => {
              setSelectedSourceId(id);
              onApplySource(id);
              onClose();
            }}
            searchInputTestId="source-search-input"
            unassignLabel="— Unrouted / Blank (Clear source feed from this window)"
            searchPlaceholder="Filter sources (e.g. CAM, FS, NYP, LINE, vcam31)..."
            maxHeight="360px"
            onClose={onClose}
          />

          <div
            style={{
              marginTop: '4px',
              paddingTop: '8px',
              borderTop: '1px solid #282828',
              textAlign: 'center',
            }}
          >
            {renderAddSourceSection()}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#202020',
            borderTop: '1px solid #333333',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            data-testid="cancel-source-routing-btn"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: '#303030',
              color: '#cbd5e1',
              border: '1px solid #444444',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            data-testid="apply-source-route-btn"
            style={{
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: '#2864a3',
              color: '#ffffff',
              border: '1px solid #38bdf8',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Apply Route
          </button>
        </div>
      </div>
    </div>
  );
};
