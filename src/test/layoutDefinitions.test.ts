import { describe, it, expect, beforeEach } from 'vitest';
import {
  STANDARD_LAYOUTS,
  getLayoutDefinition,
  createFallbackGrid,
  setCustomLayoutRegistry,
  clearCustomLayoutRegistry,
  LayoutDefinition,
  LAYOUT_1_BOX,
  LAYOUT_2_BOX,
  LAYOUT_3_BOX,
  LAYOUT_4_BOX,
  LAYOUT_5_BOX,
  LAYOUT_6_BOX,
  LAYOUT_7_BOX,
  LAYOUT_8_BOX,
  LAYOUT_9_BOX,
  LAYOUT_10_BOX,
  LAYOUT_11_BOX,
  LAYOUT_12_BOX,
  LAYOUT_13_BOX,
  LAYOUT_14_BOX,
  LAYOUT_15_BOX,
  LAYOUT_16_BOX,
  LAYOUT_20_BOX_AUDIO,
  LAYOUT_24_BOX,
  LAYOUT_28_BOX,
  LAYOUT_32_BOX,
  LAYOUT_36_BOX,
} from '../domain/layoutDefinitions';

describe('Layout Definitions Domain Logic', () => {
  beforeEach(() => {
    clearCustomLayoutRegistry();
  });

  it('defines 21 standard Evertz layouts with valid, bounded geometry', () => {
    expect(STANDARD_LAYOUTS.length).toBe(21);

    for (const layout of STANDARD_LAYOUTS) {
      expect(layout.id).toBeTruthy();
      expect(layout.name).toBeTruthy();
      expect(layout.windowCount).toBeGreaterThan(0);
      expect(layout.windows.length).toBe(layout.windowCount);

      const seenOffsets = new Set<number>();

      // Verify every window definition
      for (const win of layout.windows) {
        expect(win.x).toBeGreaterThanOrEqual(0);
        expect(win.x).toBeLessThan(100);
        expect(win.y).toBeGreaterThanOrEqual(0);
        expect(win.y).toBeLessThan(100);
        expect(win.width).toBeGreaterThan(0);
        expect(win.width).toBeLessThanOrEqual(100);
        expect(win.height).toBeGreaterThan(0);
        expect(win.height).toBeLessThanOrEqual(100);

        // Bounded within 0-100 canvas (allowing 0.001 floating point tolerance)
        expect(win.x + win.width).toBeLessThanOrEqual(100.001);
        expect(win.y + win.height).toBeLessThanOrEqual(100.001);

        // Destination offset must be valid and sequentially unique
        expect(win.destinationOffset).toBeGreaterThanOrEqual(0);
        expect(win.destinationOffset).toBeLessThan(layout.windowCount);
        expect(seenOffsets.has(win.destinationOffset)).toBe(false);
        seenOffsets.add(win.destinationOffset);
      }

      // Check all offsets from 0 to windowCount - 1 are present
      expect(seenOffsets.size).toBe(layout.windowCount);
    }
  });

  it('verifies explicit standard layout box counts and window counts', () => {
    // Required Phase 1 catalog additions
    expect(LAYOUT_5_BOX.windowCount).toBe(5);
    expect(LAYOUT_5_BOX.windows.length).toBe(5);

    expect(LAYOUT_7_BOX.windowCount).toBe(7);
    expect(LAYOUT_7_BOX.windows.length).toBe(7);

    expect(LAYOUT_9_BOX.windowCount).toBe(9);
    expect(LAYOUT_9_BOX.windows.length).toBe(9);

    expect(LAYOUT_13_BOX.windowCount).toBe(13);
    expect(LAYOUT_13_BOX.windows.length).toBe(13);

    expect(LAYOUT_14_BOX.windowCount).toBe(14);
    expect(LAYOUT_14_BOX.windows.length).toBe(14);

    expect(LAYOUT_15_BOX.windowCount).toBe(15);
    expect(LAYOUT_15_BOX.windows.length).toBe(15);

    expect(LAYOUT_24_BOX.windowCount).toBe(24);
    expect(LAYOUT_24_BOX.windows.length).toBe(24);

    expect(LAYOUT_28_BOX.windowCount).toBe(28);
    expect(LAYOUT_28_BOX.windows.length).toBe(28);

    expect(LAYOUT_32_BOX.windowCount).toBe(32);
    expect(LAYOUT_32_BOX.windows.length).toBe(32);

    // Existing standard layouts preserved
    expect(LAYOUT_1_BOX.windowCount).toBe(1);
    expect(LAYOUT_2_BOX.windowCount).toBe(2);
    expect(LAYOUT_3_BOX.windowCount).toBe(3);
    expect(LAYOUT_4_BOX.windowCount).toBe(4);
    expect(LAYOUT_6_BOX.windowCount).toBe(6);
    expect(LAYOUT_8_BOX.windowCount).toBe(8);
    expect(LAYOUT_10_BOX.windowCount).toBe(10);
    expect(LAYOUT_11_BOX.windowCount).toBe(11);
    expect(LAYOUT_12_BOX.windowCount).toBe(12);
    expect(LAYOUT_16_BOX.windowCount).toBe(16);
    expect(LAYOUT_20_BOX_AUDIO.windowCount).toBe(20);
    expect(LAYOUT_36_BOX.windowCount).toBe(36);
  });

  it('correctly models 5 BOX as hero split with 4 auxiliary windows', () => {
    expect(LAYOUT_5_BOX.category).toBe('Hero Split');
    const hero = LAYOUT_5_BOX.windows[0];
    expect(hero.width).toBeCloseTo(66.666, 1);
    expect(hero.height).toBeCloseTo(66.666, 1);
    expect(LAYOUT_5_BOX.windows.map((w) => w.destinationOffset)).toEqual([0, 1, 2, 3, 4]);
  });

  it('correctly models 7 BOX as hero split with 6 auxiliary windows', () => {
    expect(LAYOUT_7_BOX.category).toBe('Hero Split');
    const hero = LAYOUT_7_BOX.windows[0];
    expect(hero.width).toBeCloseTo(66.666, 1);
    expect(hero.height).toBeCloseTo(66.666, 1);
    expect(LAYOUT_7_BOX.windows.map((w) => w.destinationOffset)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('correctly models 9 BOX as 3x3 uniform grid', () => {
    expect(LAYOUT_9_BOX.category).toBe('Standard Grid');
    expect(LAYOUT_9_BOX.windows.length).toBe(9);
    for (let i = 0; i < 9; i++) {
      expect(LAYOUT_9_BOX.windows[i].destinationOffset).toBe(i);
    }
  });

  it('correctly models 13 BOX and 14 BOX hero split layouts', () => {
    expect(LAYOUT_13_BOX.category).toBe('Hero Split');
    expect(LAYOUT_13_BOX.windows.length).toBe(13);

    expect(LAYOUT_14_BOX.category).toBe('Hero Split');
    expect(LAYOUT_14_BOX.windows.length).toBe(14);
    // 14 BOX has dual hero PGM/PVW windows on top
    const [hero1, hero2] = LAYOUT_14_BOX.windows;
    expect(hero1.width).toBe(50);
    expect(hero1.height).toBe(50);
    expect(hero2.x).toBe(50);
    expect(hero2.width).toBe(50);
  });

  it('correctly models 15 BOX, 24 BOX, 28 BOX, and 32 BOX layouts', () => {
    expect(LAYOUT_15_BOX.category).toBe('Standard Grid');
    expect(LAYOUT_24_BOX.category).toBe('High Density');
    expect(LAYOUT_28_BOX.category).toBe('High Density');
    expect(LAYOUT_32_BOX.category).toBe('High Density');

    expect(LAYOUT_15_BOX.windows.length).toBe(15);
    expect(LAYOUT_24_BOX.windows.length).toBe(24);
    expect(LAYOUT_28_BOX.windows.length).toBe(28);
    expect(LAYOUT_32_BOX.windows.length).toBe(32);
  });

  it('resolves layout names case-insensitively and with whitespace variation', () => {
    expect(getLayoutDefinition('4 BOX')?.id).toBe('4-BOX');
    expect(getLayoutDefinition('4 box')?.id).toBe('4-BOX');
    expect(getLayoutDefinition('4BOX')?.id).toBe('4-BOX');
    expect(getLayoutDefinition('5 BOX')?.id).toBe('5-BOX');
    expect(getLayoutDefinition('7 BOX')?.id).toBe('7-BOX');
    expect(getLayoutDefinition('9 BOX')?.id).toBe('9-BOX');
    expect(getLayoutDefinition('13 BOX')?.id).toBe('13-BOX');
    expect(getLayoutDefinition('14 BOX')?.id).toBe('14-BOX');
    expect(getLayoutDefinition('15 BOX')?.id).toBe('15-BOX');
    expect(getLayoutDefinition('24 BOX')?.id).toBe('24-BOX');
    expect(getLayoutDefinition('28 BOX')?.id).toBe('28-BOX');
    expect(getLayoutDefinition('32 BOX')?.id).toBe('32-BOX');
    expect(getLayoutDefinition('36 BOX')?.id).toBe('36-BOX');
    expect(getLayoutDefinition('20 Box Audio')?.id).toBe('20-BOX-AUDIO');
    expect(getLayoutDefinition('20 BOX')?.id).toBe('20-BOX-AUDIO');
  });

  it('uses createFallbackGrid for genuinely unknown box counts', () => {
    const fallback17 = getLayoutDefinition('17 BOX');
    expect(fallback17).not.toBeNull();
    expect(fallback17?.id).toBe('CUSTOM-17-BOX');
    expect(fallback17?.windowCount).toBe(17);
    expect(fallback17?.windows.length).toBe(17);

    const fallback99 = getLayoutDefinition('99 BOX');
    expect(fallback99).not.toBeNull();
    expect(fallback99?.id).toBe('CUSTOM-99-BOX');
    expect(fallback99?.windowCount).toBe(99);

    const direct = createFallbackGrid(19, '19 BOX');
    expect(direct.windowCount).toBe(19);
    expect(direct.category).toBe('Custom');
  });

  it('resolves custom layouts passed explicitly or via registry', () => {
    const customLayout: LayoutDefinition = {
      id: 'custom-studio-a',
      name: 'STUDIO-A-SPLIT',
      windowCount: 5,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Studio A custom split',
      windows: [
        { id: 'w-1', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
        { id: 'w-2', x: 50, y: 0, width: 25, height: 50, destinationOffset: 1 },
        { id: 'w-3', x: 75, y: 0, width: 25, height: 50, destinationOffset: 2 },
        { id: 'w-4', x: 50, y: 50, width: 25, height: 50, destinationOffset: 3 },
        { id: 'w-5', x: 75, y: 50, width: 25, height: 50, destinationOffset: 4 },
      ],
      isCustom: true,
    };

    // Passed explicitly
    const resolvedExplicit = getLayoutDefinition('STUDIO-A-SPLIT', [customLayout]);
    expect(resolvedExplicit?.id).toBe('custom-studio-a');
    expect(resolvedExplicit?.windowCount).toBe(5);

    // Case-insensitive match
    const resolvedLower = getLayoutDefinition('studio-a-split', [customLayout]);
    expect(resolvedLower?.id).toBe('custom-studio-a');

    // Via registry
    setCustomLayoutRegistry([customLayout]);
    const resolvedRegistry = getLayoutDefinition('STUDIO-A-SPLIT');
    expect(resolvedRegistry?.id).toBe('custom-studio-a');
  });

  it('preserves resolution hierarchy: standard > custom > fallback > null', () => {
    const override4Box: LayoutDefinition = {
      id: 'custom-4-box-fake',
      name: '4 BOX',
      windowCount: 4,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Attempt to override standard',
      windows: [],
      isCustom: true,
    };

    // Standard layout takes priority over custom layout with same name
    const resolved = getLayoutDefinition('4 BOX', [override4Box]);
    expect(resolved?.id).toBe('4-BOX'); // Standard, not custom!

    // Custom layout resolves when not in standard catalog
    const myCustom: LayoutDefinition = {
      id: 'custom-special',
      name: 'CONTROL-WALL-1',
      windowCount: 8,
      aspectRatio: '16:9',
      category: 'Custom',
      description: 'Special wall',
      windows: [],
      isCustom: true,
    };
    expect(getLayoutDefinition('CONTROL-WALL-1', [myCustom])?.id).toBe('custom-special');

    // Unknown count falls back to fallback grid
    expect(getLayoutDefinition('47 BOX')?.id).toBe('CUSTOM-47-BOX');

    // Unrecognized non-numeric string returns null
    expect(getLayoutDefinition(null)).toBeNull();
    expect(getLayoutDefinition('')).toBeNull();
    expect(getLayoutDefinition('   ')).toBeNull();
    expect(getLayoutDefinition('NON_EXISTENT_NAME')).toBeNull();
  });
});
