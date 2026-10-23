import React, { useState, useEffect, useMemo } from 'react';
import { MultiviewOutput, Destination, Source } from '../../domain/models';
import { STANDARD_LAYOUTS, LayoutDefinition } from '../../domain/layoutDefinitions';
import { LayoutRenderer } from './LayoutRenderer';
import {
  checkDestructiveLayoutReduction,
  DestructiveLayoutReductionWarning,
} from '../../domain/rangeUtils';

export interface LayoutSelectorModalProps {
  readonly isOpen: boolean;
  readonly output: MultiviewOutput;
  readonly destinations: readonly Destination[];
  readonly sources: readonly Source[];
  readonly onSelectLayout: (newLayoutName: string) => void;
  readonly onClose: () => void;
}

export const LayoutSelectorModal: React.FC<LayoutSelectorModalProps> = ({
  isOpen,
  output,
  destinations,
  sources,
  onSelectLayout,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [pendingLayout, setPendingLayout] = useState<LayoutDefinition | null>(null);
  const [reductionWarning, setReductionWarning] =
    useState<DestructiveLayoutReductionWarning | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reductionWarning) {
          setReductionWarning(null);
          setPendingLayout(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, reductionWarning, onClose]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    STANDARD_LAYOUTS.forEach((l) => set.add(l.category));
    return ['ALL', ...Array.from(set)];
  }, []);

  const filteredLayouts = useMemo(() => {
    if (selectedCategory === 'ALL') return STANDARD_LAYOUTS;
    return STANDARD_LAYOUTS.filter((l) => l.category === selectedCategory);
  }, [selectedCategory]);

  if (!isOpen) return null;

  const handleLayoutClick = (layout: LayoutDefinition) => {
    if (layout.name === output.layoutName) {
      onClose();
      return;
    }

    const warning = checkDestructiveLayoutReduction(
      output,
      layout.windowCount,
      destinations as Destination[],
      sources as Source[]
    );

    if (warning.isReduction && warning.affectedDestinationsWithSources.length > 0) {
      setPendingLayout(layout);
      setReductionWarning(warning);
    } else {
      onSelectLayout(layout.name);
      onClose();
    }
  };

  const handleConfirmReduction = () => {
    if (pendingLayout) {
      onSelectLayout(pendingLayout.name);
      setPendingLayout(null);
      setReductionWarning(null);
      onClose();
    }
  };

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
      data-testid="layout-selector-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="layout-catalog-title"
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
        zIndex: 1200,
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
          maxWidth: '820px',
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
            <span
              id="layout-catalog-title"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Select Layout Catalog
            </span>
            <span style={{ fontSize: '11px', color: '#858585', marginLeft: '8px' }}>
              Assign layout geometry for {output.id.replace('OUT:', '')}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close layout selector"
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

        {/* Reduction Warning Prompt if applicable */}
        {reductionWarning && pendingLayout && (
          <div
            style={{
              backgroundColor: '#3b1c1c',
              borderBottom: '1px solid #ef4444',
              padding: '12px 16px',
              color: '#fecaca',
            }}
            data-testid="layout-reduction-warning"
          >
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
              ⚠️ Layout Reduction Warning
            </div>
            <p style={{ fontSize: '12px', margin: '0 0 8px 0', lineHeight: 1.4 }}>
              Switching from <strong>{output.layoutName}</strong> ({reductionWarning.oldWindowCount}{' '}
              windows) to <strong>{pendingLayout.name}</strong> ({pendingLayout.windowCount}{' '}
              windows) will reduce the number of active windows. The following populated source
              assignments will be removed from this output:
            </p>
            <ul style={{ margin: '0 0 10px 16px', padding: 0, fontSize: '11px' }}>
              {reductionWarning.affectedDestinationsWithSources.map((item) => (
                <li key={item.destinationNumber}>
                  Destination #{item.destinationNumber}: <strong>{item.sourceName}</strong>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleConfirmReduction}
                data-testid="confirm-reduction-btn"
                style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: '1px solid #f87171',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                Proceed with {pendingLayout.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReductionWarning(null);
                  setPendingLayout(null);
                }}
                style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: '#262626',
                  color: '#e2e8f0',
                  border: '1px solid #444444',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 16px',
            backgroundColor: '#181818',
            borderBottom: '1px solid #282828',
            overflowX: 'auto',
          }}
        >
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: selectedCategory === cat ? 700 : 500,
                backgroundColor: selectedCategory === cat ? '#2864a3' : '#262626',
                color: selectedCategory === cat ? '#ffffff' : '#94a3b8',
                border: '1px solid',
                borderColor: selectedCategory === cat ? '#38bdf8' : '#383838',
                borderRadius: '2px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Layout Grid */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredLayouts.map((layout) => {
            const isCurrent = output.layoutName === layout.name;
            return (
              <div
                key={layout.name}
                onClick={() => handleLayoutClick(layout)}
                data-testid={`layout-option-${layout.name}`}
                style={{
                  backgroundColor: '#141414',
                  border: `1px solid ${isCurrent ? '#38bdf8' : '#333333'}`,
                  borderRadius: '3px',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  position: 'relative',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                    {layout.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '2px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: '#94a3b8',
                    }}
                  >
                    {layout.windowCount} Boxes
                  </span>
                </div>

                <div
                  style={{
                    aspectRatio: '16 / 9',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #222222',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <LayoutRenderer layout={layout} mode="thumbnail" />
                </div>

                {isCurrent && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '6px',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: '#38bdf8',
                      textTransform: 'uppercase',
                    }}
                  >
                    Current
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
