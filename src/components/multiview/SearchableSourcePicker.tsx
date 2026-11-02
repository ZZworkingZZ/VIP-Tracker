import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Source, formatSourceCompact } from '../../domain/models';
import { SourceId } from '../../domain/identifiers';
import { SOURCE_CATEGORIES } from '../../domain/sourceCategories';
import { matchesSourceQuery } from '../../domain/sourceSearch';
import { getPickerType, getPickerTypeOrder, type SourcePickerRole } from '../../domain/pickerTypes';

export interface SearchableSourcePickerProps {
  readonly sources: readonly Source[];
  /** When set, chips/groups use the workbook Type for this list role instead of Source.category. */
  readonly pickerRole?: SourcePickerRole;
  readonly selectedSourceId: string | null;
  readonly onSelectSource: (sourceId: SourceId | null) => void;
  readonly onDoubleClickSource?: (sourceId: SourceId | null) => void;
  readonly unassignLabel?: string;
  readonly searchPlaceholder?: string;
  readonly maxHeight?: string | number;
  readonly autoFocus?: boolean;
  readonly searchInputTestId?: string;
  readonly onClose?: () => void;
  readonly showUnassignedOption?: boolean;
  /** Fill the parent's height: results list flexes and is the only scroll region. */
  readonly fillHeight?: boolean;
}

export const SearchableSourcePicker: React.FC<SearchableSourcePickerProps> = ({
  sources,
  pickerRole,
  selectedSourceId,
  onSelectSource,
  onDoubleClickSource,
  unassignLabel = '— Unrouted / Blank —',
  searchPlaceholder = 'Filter sources (e.g. vcam31, cam, swr)...',
  maxHeight = '380px',
  autoFocus = true,
  searchInputTestId = 'source-picker-search-input',
  onClose,
  showUnassignedOption = true,
  fillHeight = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Focus search input automatically on mount
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const categoryOf = useMemo(
    () =>
      (s: Source): string => {
        if (pickerRole) return getPickerType(pickerRole, s.id);
        return s.category && s.category.trim() ? s.category.trim() : 'Uncategorized';
      },
    [pickerRole]
  );

  // Derive available categories and their counts dynamically from canonical sources
  const { categories, categoryCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sources) {
      const cat = categoryOf(s);
      counts[cat] = (counts[cat] || 0) + 1;
    }

    const knownOrder = new Map(
      (pickerRole ? getPickerTypeOrder(pickerRole) : SOURCE_CATEGORIES).map((c, i) => [
        c as string,
        i,
      ])
    );
    const sortedCats = Object.keys(counts).sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      if (!pickerRole && a === 'Other') return 1;
      if (!pickerRole && b === 'Other') return -1;
      const orderA = knownOrder.get(a);
      const orderB = knownOrder.get(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return a.localeCompare(b);
    });

    return { categories: sortedCats, categoryCounts: counts };
  }, [sources, pickerRole, categoryOf]);

  // Filter sources by category and query
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      const cat = categoryOf(s);
      if (selectedCategory !== 'ALL' && cat !== selectedCategory) return false;
      return matchesSourceQuery(s, searchQuery);
    });
  }, [sources, selectedCategory, searchQuery, categoryOf]);

  // Grouped sections when "ALL" is selected
  const groupedSections = useMemo(() => {
    if (selectedCategory !== 'ALL') {
      return [{ category: selectedCategory, items: filteredSources }];
    }

    const catMap = new Map<string, Source[]>();
    for (const s of filteredSources) {
      const cat = categoryOf(s);
      if (!catMap.has(cat)) {
        catMap.set(cat, []);
      }
      catMap.get(cat)!.push(s);
    }

    const groups: Array<{ category: string; items: Source[] }> = [];
    for (const cat of categories) {
      const items = catMap.get(cat);
      if (items && items.length > 0) {
        groups.push({ category: cat, items });
      }
    }
    return groups;
  }, [selectedCategory, filteredSources, categories, categoryOf]);

  // Flattened visible items for keyboard navigation: unassigned option (if present) followed by sources
  const visibleNavItems = useMemo<Array<Source | null>>(() => {
    const list: Array<Source | null> = [];
    if (showUnassignedOption) {
      list.push(null);
    }
    for (const section of groupedSections) {
      for (const item of section.items) {
        list.push(item);
      }
    }
    return list;
  }, [showUnassignedOption, groupedSections]);

  // Reset highlighted index when visible items change
  useEffect(() => {
    if (visibleNavItems.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    // If the currently assigned source is in the visible list, highlight it
    if (selectedSourceId) {
      const idx = visibleNavItems.findIndex((item) => item?.id === selectedSourceId);
      if (idx >= 0) {
        setHighlightedIndex(idx);
        return;
      }
    }
    setHighlightedIndex(0);
  }, [visibleNavItems, selectedSourceId]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      const el = itemRefs.current[highlightedIndex];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onClose) {
        // First Escape closes only the picker; do not let it reach ancestor Escape handlers.
        e.stopPropagation();
        onClose();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleNavItems.length > 0) {
        setHighlightedIndex((prev) => (prev < visibleNavItems.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleNavItems.length > 0) {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : visibleNavItems.length - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < visibleNavItems.length) {
        const item = visibleNavItems[highlightedIndex];
        const targetId = item ? item.id : null;
        onSelectSource(targetId);
        onDoubleClickSource?.(targetId);
      }
    }
  };

  let currentNavIndex = 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        ...(fillHeight ? { flex: 1, minHeight: 0 } : {}),
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search Input */}
      <div style={{ position: 'relative', width: '100%', flexShrink: 0 }}>
        <input
          ref={inputRef}
          type="search"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid={searchInputTestId}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: '12px',
            backgroundColor: '#101010',
            border: '1px solid #444444',
            borderRadius: '2px',
            color: '#ffffff',
            fontFamily: 'var(--ev-font)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category Chips Bar */}
      <div
        data-testid="category-chips-row"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          flexShrink: 0,
          paddingBottom: '2px',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          data-testid="category-chip-all"
          style={{
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: selectedCategory === 'ALL' ? 700 : 500,
            borderRadius: '12px',
            border: selectedCategory === 'ALL' ? '1px solid #38bdf8' : '1px solid #383838',
            backgroundColor: selectedCategory === 'ALL' ? '#1e3a5a' : '#222222',
            color: selectedCategory === 'ALL' ? '#38bdf8' : '#94a3b8',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          All ({sources.length})
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategory === cat;
          const count = categoryCounts[cat] || 0;
          const chipTestId = `category-chip-${cat.toLowerCase().replace(/[\s/]+/g, '-')}`;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              data-testid={chipTestId}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: isSelected ? 700 : 500,
                borderRadius: '12px',
                border: isSelected ? '1px solid #38bdf8' : '1px solid #383838',
                backgroundColor: isSelected ? '#1e3a5a' : '#222222',
                color: isSelected ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Sources List */}
      <div
        ref={listRef}
        data-testid="source-picker-list"
        style={{
          overflowY: 'auto',
          ...(fillHeight ? { flex: 1, minHeight: 0 } : { maxHeight }),
          border: '1px solid #282828',
          borderRadius: '2px',
          backgroundColor: '#121212',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {/* Unrouted / Unassigned Option */}
        {showUnassignedOption &&
          (() => {
            const navIndex = currentNavIndex++;
            const isSelected = selectedSourceId === null;
            const isHighlighted = highlightedIndex === navIndex;
            return (
              <div
                key="__unassigned__"
                ref={(el) => {
                  itemRefs.current[navIndex] = el;
                }}
                onClick={() => onSelectSource(null)}
                onDoubleClick={() => onDoubleClickSource?.(null)}
                data-testid="source-option-unrouted"
                style={{
                  padding: '6px 10px',
                  backgroundColor: isHighlighted ? '#1e2d42' : isSelected ? '#203a55' : '#141414',
                  border: `1px solid ${isSelected ? '#38bdf8' : isHighlighted ? '#2a4365' : '#222222'}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: isSelected ? '#38bdf8' : '#858585',
                    }}
                  >
                    {unassignLabel}
                  </span>
                </div>
                {isSelected && (
                  <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>
                    Selected
                  </span>
                )}
              </div>
            );
          })()}

        {/* Grouped or Filtered Sections */}
        {groupedSections.map((section) => {
          const showHeader = selectedCategory === 'ALL';
          const headerTestId = `category-header-${section.category.toLowerCase().replace(/[\s/]+/g, '-')}`;

          return (
            <div
              key={section.category}
              style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
              {showHeader && (
                <div
                  data-testid={headerTestId}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    backgroundColor: '#182230',
                    color: '#94a3b8',
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #283548',
                    borderTop: '1px solid #283548',
                    marginTop: '4px',
                    marginBottom: '2px',
                  }}
                >
                  {section.category} ({section.items.length})
                </div>
              )}

              {section.items.map((source) => {
                const navIndex = currentNavIndex++;
                const isSelected = selectedSourceId === source.id;
                const isHighlighted = highlightedIndex === navIndex;
                const cat = categoryOf(source);

                return (
                  <div
                    key={source.id}
                    ref={(el) => {
                      itemRefs.current[navIndex] = el;
                    }}
                    onClick={() => onSelectSource(source.id)}
                    onDoubleClick={() => onDoubleClickSource?.(source.id)}
                    data-testid={`source-option-${source.id}`}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: isHighlighted
                        ? '#1e2d42'
                        : isSelected
                          ? '#203a55'
                          : '#141414',
                      border: `1px solid ${isSelected ? '#38bdf8' : isHighlighted ? '#2a4365' : '#222222'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>
                        {formatSourceCompact(source)}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: '2px',
                          backgroundColor: 'rgba(40, 100, 163, 0.3)',
                          color: '#60a5fa',
                        }}
                      >
                        {cat}
                      </span>
                    </div>

                    {isSelected && (
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>
                        Selected
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Empty State */}
        {filteredSources.length === 0 && (
          <div
            data-testid="no-matching-sources"
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              backgroundColor: '#141414',
              borderRadius: '2px',
              border: '1px dashed #333333',
              color: '#858585',
              fontSize: '11px',
            }}
          >
            No matching sources
            {searchQuery ? ` for "${searchQuery}"` : ''}
            {selectedCategory !== 'ALL' ? ` in ${selectedCategory}` : ''}.
          </div>
        )}
      </div>
    </div>
  );
};
