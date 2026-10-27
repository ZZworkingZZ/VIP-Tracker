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

  it('correctly models Basic 2 BOX as side-by-side equal 16:9 windows matching real Evertz layout', () => {
    // 1. Basic 2 Box contains exactly two PIPs
    expect(LAYOUT_2_BOX.windowCount).toBe(2);
    expect(LAYOUT_2_BOX.windows).toHaveLength(2);

    const [leftPip, rightPip] = LAYOUT_2_BOX.windows;

    // 2. Both PIPs have identical width
    expect(leftPip.width).toBe(rightPip.width);

    // 3. Both PIPs have identical height
    expect(leftPip.height).toBe(rightPip.height);

    // 4. Both PIPs have identical Y position
    expect(leftPip.y).toBe(rightPip.y);

    // 5. Left PIP is positioned left of Right PIP
    expect(leftPip.x).toBeLessThan(rightPip.x);

    // 6. The two PIPs do not overlap
    expect(leftPip.x + leftPip.width).toBeLessThanOrEqual(rightPip.x);

    // 7. The two PIPs fit within layout bounds (0-100 canvas)
    expect(leftPip.x).toBeGreaterThanOrEqual(0);
    expect(leftPip.y).toBeGreaterThanOrEqual(0);
    expect(leftPip.x + leftPip.width).toBeLessThanOrEqual(100);
    expect(leftPip.y + leftPip.height).toBeLessThanOrEqual(100);

    expect(rightPip.x).toBeGreaterThanOrEqual(0);
    expect(rightPip.y).toBeGreaterThanOrEqual(0);
    expect(rightPip.x + rightPip.width).toBeLessThanOrEqual(100);
    expect(rightPip.y + rightPip.height).toBeLessThanOrEqual(100);

    // 8. In a 16:9 canvas, width === height produces exact 16:9 video aspect ratio
    expect(leftPip.width).toBe(leftPip.height);
    expect(rightPip.width).toBe(rightPip.height);

    // 9. Composition is horizontally symmetric within canvas
    const leftMargin = leftPip.x;
    const rightMargin = Number((100 - (rightPip.x + rightPip.width)).toFixed(4));
    expect(leftMargin).toBe(rightMargin);

    // 10. Resolves through canonical layout lookup path
    const resolved = getLayoutDefinition('2 BOX');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('2-BOX');
    expect(resolved?.windows[0]).toMatchObject(LAYOUT_2_BOX.windows[0]);
    expect(resolved?.windows[1]).toMatchObject(LAYOUT_2_BOX.windows[1]);
    expect(resolved?.windows[0].pipId).toBe('PIP-01');
    expect(resolved?.windows[1].pipId).toBe('PIP-02');
  });

  it('correctly models Basic 3 BOX as 2-over-1 symmetric 16:9 windows matching real Evertz layout', () => {
    // 1. Basic 3 Box contains exactly 3 PIPs
    expect(LAYOUT_3_BOX.windowCount).toBe(3);
    expect(LAYOUT_3_BOX.windows).toHaveLength(3);

    const [pip1, pip2, pip3] = LAYOUT_3_BOX.windows;

    // 2. All 3 PIPs have identical width
    expect(pip1.width).toBe(pip2.width);
    expect(pip2.width).toBe(pip3.width);

    // 3. All 3 PIPs have identical height
    expect(pip1.height).toBe(pip2.height);
    expect(pip2.height).toBe(pip3.height);

    // 4. PIP 1 and PIP 2 have identical Y positions
    expect(pip1.y).toBe(pip2.y);

    // 5. PIP 1 is left of PIP 2
    expect(pip1.x).toBeLessThan(pip2.x);

    // 6. PIP 3 is below the upper row
    expect(pip3.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 7. PIP 3 is horizontally centered
    const expectedCenteredX = Number(((100 - pip3.width) / 2).toFixed(4));
    expect(pip3.x).toBe(expectedCenteredX);

    // 8. None of the PIPs overlap
    // PIP 1 and PIP 2 horizontal non-overlap:
    expect(pip1.x + pip1.width).toBeLessThanOrEqual(pip2.x);
    // PIP 3 is strictly below row 1:
    expect(pip3.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 9. All PIPs are within layout bounds (0-100 canvas)
    for (const pip of [pip1, pip2, pip3]) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x + pip.width).toBeLessThanOrEqual(100);
      expect(pip.y + pip.height).toBeLessThanOrEqual(100);
    }

    // 10. All three produce equivalent physical 16:9 geometry in the existing 16:9 canvas
    expect(pip1.width).toBe(pip1.height);
    expect(pip2.width).toBe(pip2.height);
    expect(pip3.width).toBe(pip3.height);

    // 11. The upper pair has balanced exterior margins
    const topRowLeftMargin = pip1.x;
    const topRowRightMargin = Number((100 - (pip2.x + pip2.width)).toFixed(4));
    expect(topRowLeftMargin).toBe(topRowRightMargin);

    // 12. Basic 3 Box resolves through canonical layout lookup
    const resolved = getLayoutDefinition('3 BOX');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('3-BOX');
    expect(resolved?.windows[0]).toMatchObject(LAYOUT_3_BOX.windows[0]);
    expect(resolved?.windows[1]).toMatchObject(LAYOUT_3_BOX.windows[1]);
    expect(resolved?.windows[2]).toMatchObject(LAYOUT_3_BOX.windows[2]);
    expect(resolved?.windows[0].pipId).toBe('PIP-01');
    expect(resolved?.windows[1].pipId).toBe('PIP-02');
    expect(resolved?.windows[2].pipId).toBe('PIP-03');

    // 13. Basic 2 Box geometry remains unchanged
    expect(LAYOUT_2_BOX.windows[0]).toMatchObject({ x: 0.2, y: 25.5, width: 49.6, height: 49.6 });
    expect(LAYOUT_2_BOX.windows[1]).toMatchObject({ x: 50.2, y: 25.5, width: 49.6, height: 49.6 });
  });

  it('correctly models Basic 5 BOX as 3-over-2 symmetric equal 16:9 windows', () => {
    // 1. Basic 5 Box contains exactly 5 PIPs
    expect(LAYOUT_5_BOX.windowCount).toBe(5);
    expect(LAYOUT_5_BOX.windows).toHaveLength(5);

    const [pip1, pip2, pip3, pip4, pip5] = LAYOUT_5_BOX.windows;

    // 2. All 5 PIPs have identical width
    expect(pip1.width).toBe(pip2.width);
    expect(pip2.width).toBe(pip3.width);
    expect(pip3.width).toBe(pip4.width);
    expect(pip4.width).toBe(pip5.width);

    // 3. All 5 PIPs have identical height
    expect(pip1.height).toBe(pip2.height);
    expect(pip2.height).toBe(pip3.height);
    expect(pip3.height).toBe(pip4.height);
    expect(pip4.height).toBe(pip5.height);

    // 4. All 5 PIPs represent equivalent physical 16:9 windows (width === height in 16:9 container)
    for (const pip of [pip1, pip2, pip3, pip4, pip5]) {
      expect(pip.width).toBe(pip.height);
    }

    // 5. PIPs 1–3 share the same Y coordinate
    expect(pip1.y).toBe(pip2.y);
    expect(pip2.y).toBe(pip3.y);

    // 6. PIPs 4–5 share the same Y coordinate
    expect(pip4.y).toBe(pip5.y);

    // 7. Bottom row is below top row
    expect(pip4.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 8. Top-row PIPs are ordered left-to-right
    expect(pip1.x).toBeLessThan(pip2.x);
    expect(pip2.x).toBeLessThan(pip3.x);

    // 9. Bottom-row PIPs are ordered left-to-right
    expect(pip4.x).toBeLessThan(pip5.x);

    // 10. Top-row horizontal gaps are equal
    const topGap1 = Number((pip2.x - (pip1.x + pip1.width)).toFixed(4));
    const topGap2 = Number((pip3.x - (pip2.x + pip2.width)).toFixed(4));
    expect(topGap1).toBe(topGap2);

    // 11. Top-row outside margins are balanced
    const topRowLeftMargin = pip1.x;
    const topRowRightMargin = Number((100 - (pip3.x + pip3.width)).toFixed(4));
    expect(topRowLeftMargin).toBe(topRowRightMargin);

    // 12. Bottom-row pair is horizontally centered as a GROUP
    const bottomGroupWidth = pip5.x + pip5.width - pip4.x;
    const expectedBottomGroupX = Number(((100 - bottomGroupWidth) / 2).toFixed(4));
    expect(pip4.x).toBe(expectedBottomGroupX);

    // 13. Bottom-row gap is consistent with intended visual spacing (matches top gap)
    const bottomGap = Number((pip5.x - (pip4.x + pip4.width)).toFixed(4));
    expect(bottomGap).toBe(topGap1);

    // 14. No PIPs overlap
    expect(pip1.x + pip1.width).toBeLessThanOrEqual(pip2.x);
    expect(pip2.x + pip2.width).toBeLessThanOrEqual(pip3.x);
    expect(pip4.x + pip4.width).toBeLessThanOrEqual(pip5.x);
    expect(pip4.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);
    expect(pip5.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 15. Every PIP remains within the 0–100 layout bounds
    for (const pip of [pip1, pip2, pip3, pip4, pip5]) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x + pip.width).toBeLessThanOrEqual(100);
      expect(pip.y + pip.height).toBeLessThanOrEqual(100);
    }

    // 16. Canonical lookup for "5 BOX" resolves to this definition
    const resolved = getLayoutDefinition('5 BOX');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('5-BOX');
    expect(resolved?.category).toBe('Standard Grid');
    expect(resolved?.windows[0]).toMatchObject(LAYOUT_5_BOX.windows[0]);
    expect(resolved?.windows[1]).toMatchObject(LAYOUT_5_BOX.windows[1]);
    expect(resolved?.windows[2]).toMatchObject(LAYOUT_5_BOX.windows[2]);
    expect(resolved?.windows[3]).toMatchObject(LAYOUT_5_BOX.windows[3]);
    expect(resolved?.windows[4]).toMatchObject(LAYOUT_5_BOX.windows[4]);

    // 17. Stable PIP IDs remain PIP-01 through PIP-05
    expect(resolved?.windows[0].pipId).toBe('PIP-01');
    expect(resolved?.windows[1].pipId).toBe('PIP-02');
    expect(resolved?.windows[2].pipId).toBe('PIP-03');
    expect(resolved?.windows[3].pipId).toBe('PIP-04');
    expect(resolved?.windows[4].pipId).toBe('PIP-05');

    // 18. Basic 2 Box remains unchanged
    expect(LAYOUT_2_BOX.windows[0]).toMatchObject({ x: 0.2, y: 25.5, width: 49.6, height: 49.6 });
    expect(LAYOUT_2_BOX.windows[1]).toMatchObject({ x: 50.2, y: 25.5, width: 49.6, height: 49.6 });

    // 19. Basic 3 Box remains unchanged
    expect(LAYOUT_3_BOX.windows[0]).toMatchObject({ x: 2.0, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[1]).toMatchObject({ x: 50.4, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[2]).toMatchObject({ x: 26.2, y: 51.0, width: 47.6, height: 47.6 });

    // 20. Basic 4 Box remains unchanged
    expect(LAYOUT_4_BOX.windows[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[1]).toMatchObject({ x: 50, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[2]).toMatchObject({ x: 0, y: 50, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[3]).toMatchObject({ x: 50, y: 50, width: 50, height: 50 });
  });

  it('correctly models Basic 6 BOX as symmetric 3x2 grid of equal 16:9 windows matching real Evertz layout', () => {
    // 1. Basic 6 Box contains exactly 6 PIPs
    expect(LAYOUT_6_BOX.windowCount).toBe(6);
    expect(LAYOUT_6_BOX.windows).toHaveLength(6);

    const [pip1, pip2, pip3, pip4, pip5, pip6] = LAYOUT_6_BOX.windows;

    // 2. All 6 PIPs have identical width
    expect(pip1.width).toBe(pip2.width);
    expect(pip2.width).toBe(pip3.width);
    expect(pip3.width).toBe(pip4.width);
    expect(pip4.width).toBe(pip5.width);
    expect(pip5.width).toBe(pip6.width);

    // 3. All 6 PIPs have identical height
    expect(pip1.height).toBe(pip2.height);
    expect(pip2.height).toBe(pip3.height);
    expect(pip3.height).toBe(pip4.height);
    expect(pip4.height).toBe(pip5.height);
    expect(pip5.height).toBe(pip6.height);

    // 4. All 6 produce equivalent physical 16:9 geometry (width === height in 16:9 container)
    for (const pip of [pip1, pip2, pip3, pip4, pip5, pip6]) {
      expect(pip.width).toBe(pip.height);
    }

    // 5. PIPs 1–3 have identical Y positions
    expect(pip1.y).toBe(pip2.y);
    expect(pip2.y).toBe(pip3.y);

    // 6. PIPs 4–6 have identical Y positions
    expect(pip4.y).toBe(pip5.y);
    expect(pip5.y).toBe(pip6.y);

    // 7. Bottom row is below top row
    expect(pip4.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 8. PIP 1 X === PIP 4 X
    expect(pip1.x).toBe(pip4.x);

    // 9. PIP 2 X === PIP 5 X
    expect(pip2.x).toBe(pip5.x);

    // 10. PIP 3 X === PIP 6 X
    expect(pip3.x).toBe(pip6.x);

    // 11. Top-row horizontal gaps are equal
    const topGap1 = Number((pip2.x - (pip1.x + pip1.width)).toFixed(4));
    const topGap2 = Number((pip3.x - (pip2.x + pip2.width)).toFixed(4));
    expect(topGap1).toBe(topGap2);

    // 12. Bottom-row horizontal gaps are equal
    const bottomGap1 = Number((pip5.x - (pip4.x + pip4.width)).toFixed(4));
    const bottomGap2 = Number((pip6.x - (pip5.x + pip5.width)).toFixed(4));
    expect(bottomGap1).toBe(bottomGap2);

    // 13. Top and bottom horizontal gaps match
    expect(topGap1).toBe(bottomGap1);

    // 14. Left/right outside margins are balanced
    const leftMargin = pip1.x;
    const rightMargin = Number((100 - (pip3.x + pip3.width)).toFixed(4));
    expect(leftMargin).toBe(rightMargin);

    // 15. No PIPs overlap
    expect(pip1.x + pip1.width).toBeLessThanOrEqual(pip2.x);
    expect(pip2.x + pip2.width).toBeLessThanOrEqual(pip3.x);
    expect(pip4.x + pip4.width).toBeLessThanOrEqual(pip5.x);
    expect(pip5.x + pip5.width).toBeLessThanOrEqual(pip6.x);
    expect(pip4.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);
    expect(pip5.y).toBeGreaterThanOrEqual(pip2.y + pip2.height);
    expect(pip6.y).toBeGreaterThanOrEqual(pip3.y + pip3.height);

    // 16. All PIPs remain within normalized layout bounds (0-100 canvas)
    for (const pip of [pip1, pip2, pip3, pip4, pip5, pip6]) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x + pip.width).toBeLessThanOrEqual(100);
      expect(pip.y + pip.height).toBeLessThanOrEqual(100);
    }

    // 17. Canonical "6 BOX" lookup resolves to this definition
    const resolved = getLayoutDefinition('6 BOX');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('6-BOX');
    expect(resolved?.category).toBe('Standard Grid');
    expect(resolved?.windows[0]).toMatchObject(LAYOUT_6_BOX.windows[0]);
    expect(resolved?.windows[1]).toMatchObject(LAYOUT_6_BOX.windows[1]);
    expect(resolved?.windows[2]).toMatchObject(LAYOUT_6_BOX.windows[2]);
    expect(resolved?.windows[3]).toMatchObject(LAYOUT_6_BOX.windows[3]);
    expect(resolved?.windows[4]).toMatchObject(LAYOUT_6_BOX.windows[4]);
    expect(resolved?.windows[5]).toMatchObject(LAYOUT_6_BOX.windows[5]);

    // 18. Stable PIP IDs remain PIP-01 through PIP-06
    expect(resolved?.windows[0].pipId).toBe('PIP-01');
    expect(resolved?.windows[1].pipId).toBe('PIP-02');
    expect(resolved?.windows[2].pipId).toBe('PIP-03');
    expect(resolved?.windows[3].pipId).toBe('PIP-04');
    expect(resolved?.windows[4].pipId).toBe('PIP-05');
    expect(resolved?.windows[5].pipId).toBe('PIP-06');

    // 19. Basic 2 geometry remains unchanged
    expect(LAYOUT_2_BOX.windows[0]).toMatchObject({ x: 0.2, y: 25.5, width: 49.6, height: 49.6 });
    expect(LAYOUT_2_BOX.windows[1]).toMatchObject({ x: 50.2, y: 25.5, width: 49.6, height: 49.6 });

    // 20. Basic 3 geometry remains unchanged
    expect(LAYOUT_3_BOX.windows[0]).toMatchObject({ x: 2.0, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[1]).toMatchObject({ x: 50.4, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[2]).toMatchObject({ x: 26.2, y: 51.0, width: 47.6, height: 47.6 });

    // 21. Basic 4 geometry remains unchanged
    expect(LAYOUT_4_BOX.windows[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[1]).toMatchObject({ x: 50, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[2]).toMatchObject({ x: 0, y: 50, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[3]).toMatchObject({ x: 50, y: 50, width: 50, height: 50 });

    // 22. Basic 5 geometry remains unchanged
    expect(LAYOUT_5_BOX.windows[0]).toMatchObject({ x: 2.0, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[1]).toMatchObject({ x: 34.4, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[2]).toMatchObject({ x: 66.8, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[3]).toMatchObject({ x: 18.2, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[4]).toMatchObject({ x: 50.6, y: 53.8, width: 31.2, height: 31.2 });
  });

  it('correctly models Basic 8 BOX as symmetric 4x2 grid of equal 16:9 windows matching real Evertz layout', () => {
    // 1. Basic 8 Box contains exactly 8 PIPs
    expect(LAYOUT_8_BOX.windowCount).toBe(8);
    expect(LAYOUT_8_BOX.windows).toHaveLength(8);

    const [pip1, pip2, pip3, pip4, pip5, pip6, pip7, pip8] = LAYOUT_8_BOX.windows;

    // 2. All 8 PIPs have identical width
    expect(pip1.width).toBe(pip2.width);
    expect(pip2.width).toBe(pip3.width);
    expect(pip3.width).toBe(pip4.width);
    expect(pip4.width).toBe(pip5.width);
    expect(pip5.width).toBe(pip6.width);
    expect(pip6.width).toBe(pip7.width);
    expect(pip7.width).toBe(pip8.width);

    // 3. All 8 PIPs have identical height
    expect(pip1.height).toBe(pip2.height);
    expect(pip2.height).toBe(pip3.height);
    expect(pip3.height).toBe(pip4.height);
    expect(pip4.height).toBe(pip5.height);
    expect(pip5.height).toBe(pip6.height);
    expect(pip6.height).toBe(pip7.height);
    expect(pip7.height).toBe(pip8.height);

    // 4. All 8 represent equivalent physical 16:9 windows (width === height in 16:9 container)
    for (const pip of [pip1, pip2, pip3, pip4, pip5, pip6, pip7, pip8]) {
      expect(pip.width).toBe(pip.height);
    }

    // 5. PIPs 1–4 share identical Y
    expect(pip1.y).toBe(pip2.y);
    expect(pip2.y).toBe(pip3.y);
    expect(pip3.y).toBe(pip4.y);

    // 6. PIPs 5–8 share identical Y
    expect(pip5.y).toBe(pip6.y);
    expect(pip6.y).toBe(pip7.y);
    expect(pip7.y).toBe(pip8.y);

    // 7. Bottom row is below top row
    expect(pip5.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 8. PIP 1 X === PIP 5 X
    expect(pip1.x).toBe(pip5.x);

    // 9. PIP 2 X === PIP 6 X
    expect(pip2.x).toBe(pip6.x);

    // 10. PIP 3 X === PIP 7 X
    expect(pip3.x).toBe(pip7.x);

    // 11. PIP 4 X === PIP 8 X
    expect(pip4.x).toBe(pip8.x);

    // 12. All three gaps in the top row are equal
    const topGap1 = Number((pip2.x - (pip1.x + pip1.width)).toFixed(4));
    const topGap2 = Number((pip3.x - (pip2.x + pip2.width)).toFixed(4));
    const topGap3 = Number((pip4.x - (pip3.x + pip3.width)).toFixed(4));
    expect(topGap1).toBe(topGap2);
    expect(topGap2).toBe(topGap3);

    // 13. All three gaps in the bottom row are equal
    const bottomGap1 = Number((pip6.x - (pip5.x + pip5.width)).toFixed(4));
    const bottomGap2 = Number((pip7.x - (pip6.x + pip6.width)).toFixed(4));
    const bottomGap3 = Number((pip8.x - (pip7.x + pip7.width)).toFixed(4));
    expect(bottomGap1).toBe(bottomGap2);
    expect(bottomGap2).toBe(bottomGap3);

    // 14. Top and bottom horizontal gaps match
    expect(topGap1).toBe(bottomGap1);

    // 15. Left/right exterior margins are balanced
    const leftMargin = pip1.x;
    const rightMargin = Number((100 - (pip4.x + pip4.width)).toFixed(4));
    expect(leftMargin).toBe(rightMargin);

    // 16. No PIPs overlap
    expect(pip1.x + pip1.width).toBeLessThanOrEqual(pip2.x);
    expect(pip2.x + pip2.width).toBeLessThanOrEqual(pip3.x);
    expect(pip3.x + pip3.width).toBeLessThanOrEqual(pip4.x);
    expect(pip5.x + pip5.width).toBeLessThanOrEqual(pip6.x);
    expect(pip6.x + pip6.width).toBeLessThanOrEqual(pip7.x);
    expect(pip7.x + pip7.width).toBeLessThanOrEqual(pip8.x);
    expect(pip5.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);
    expect(pip6.y).toBeGreaterThanOrEqual(pip2.y + pip2.height);
    expect(pip7.y).toBeGreaterThanOrEqual(pip3.y + pip3.height);
    expect(pip8.y).toBeGreaterThanOrEqual(pip4.y + pip4.height);

    // 17. Every PIP remains inside 0–100 normalized bounds
    for (const pip of [pip1, pip2, pip3, pip4, pip5, pip6, pip7, pip8]) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x + pip.width).toBeLessThanOrEqual(100);
      expect(pip.y + pip.height).toBeLessThanOrEqual(100);
    }

    // 18. Canonical "8 BOX" lookup resolves to this definition
    const resolved = getLayoutDefinition('8 BOX');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('8-BOX');
    expect(resolved?.category).toBe('Standard Grid');
    expect(resolved?.windows[0]).toMatchObject(LAYOUT_8_BOX.windows[0]);
    expect(resolved?.windows[1]).toMatchObject(LAYOUT_8_BOX.windows[1]);
    expect(resolved?.windows[2]).toMatchObject(LAYOUT_8_BOX.windows[2]);
    expect(resolved?.windows[3]).toMatchObject(LAYOUT_8_BOX.windows[3]);
    expect(resolved?.windows[4]).toMatchObject(LAYOUT_8_BOX.windows[4]);
    expect(resolved?.windows[5]).toMatchObject(LAYOUT_8_BOX.windows[5]);
    expect(resolved?.windows[6]).toMatchObject(LAYOUT_8_BOX.windows[6]);
    expect(resolved?.windows[7]).toMatchObject(LAYOUT_8_BOX.windows[7]);

    // 19. Stable IDs remain PIP-01 through PIP-08
    expect(resolved?.windows[0].pipId).toBe('PIP-01');
    expect(resolved?.windows[1].pipId).toBe('PIP-02');
    expect(resolved?.windows[2].pipId).toBe('PIP-03');
    expect(resolved?.windows[3].pipId).toBe('PIP-04');
    expect(resolved?.windows[4].pipId).toBe('PIP-05');
    expect(resolved?.windows[5].pipId).toBe('PIP-06');
    expect(resolved?.windows[6].pipId).toBe('PIP-07');
    expect(resolved?.windows[7].pipId).toBe('PIP-08');

    // 20. Basic 2 remains unchanged
    expect(LAYOUT_2_BOX.windows[0]).toMatchObject({ x: 0.2, y: 25.5, width: 49.6, height: 49.6 });
    expect(LAYOUT_2_BOX.windows[1]).toMatchObject({ x: 50.2, y: 25.5, width: 49.6, height: 49.6 });

    // 21. Basic 3 remains unchanged
    expect(LAYOUT_3_BOX.windows[0]).toMatchObject({ x: 2.0, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[1]).toMatchObject({ x: 50.4, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[2]).toMatchObject({ x: 26.2, y: 51.0, width: 47.6, height: 47.6 });

    // 22. Basic 4 remains unchanged
    expect(LAYOUT_4_BOX.windows[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[1]).toMatchObject({ x: 50, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[2]).toMatchObject({ x: 0, y: 50, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[3]).toMatchObject({ x: 50, y: 50, width: 50, height: 50 });

    // 23. Basic 5 remains unchanged
    expect(LAYOUT_5_BOX.windows[0]).toMatchObject({ x: 2.0, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[1]).toMatchObject({ x: 34.4, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[2]).toMatchObject({ x: 66.8, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[3]).toMatchObject({ x: 18.2, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[4]).toMatchObject({ x: 50.6, y: 53.8, width: 31.2, height: 31.2 });

    // 24. Basic 6 remains unchanged
    expect(LAYOUT_6_BOX.windows[0]).toMatchObject({ x: 2.0, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[1]).toMatchObject({ x: 34.4, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[2]).toMatchObject({ x: 66.8, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[3]).toMatchObject({ x: 2.0, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[4]).toMatchObject({ x: 34.4, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[5]).toMatchObject({ x: 66.8, y: 53.8, width: 31.2, height: 31.2 });
  });

  it('correctly models Basic 7 BOX as symmetric 4-over-3 grid of equal 16:9 windows', () => {
    // 1. Basic 7 Box contains exactly 7 PIPs
    expect(LAYOUT_7_BOX.windowCount).toBe(7);
    expect(LAYOUT_7_BOX.windows).toHaveLength(7);

    const [pip1, pip2, pip3, pip4, pip5, pip6, pip7] = LAYOUT_7_BOX.windows;

    // 2. All 7 PIPs have identical width
    expect(pip1.width).toBe(pip2.width);
    expect(pip2.width).toBe(pip3.width);
    expect(pip3.width).toBe(pip4.width);
    expect(pip4.width).toBe(pip5.width);
    expect(pip5.width).toBe(pip6.width);
    expect(pip6.width).toBe(pip7.width);

    // 3. All 7 PIPs have identical height
    expect(pip1.height).toBe(pip2.height);
    expect(pip2.height).toBe(pip3.height);
    expect(pip3.height).toBe(pip4.height);
    expect(pip4.height).toBe(pip5.height);
    expect(pip5.height).toBe(pip6.height);
    expect(pip6.height).toBe(pip7.height);

    // 4. Physical 16:9 aspect ratio (width === height in 16:9 canvas)
    for (const pip of [pip1, pip2, pip3, pip4, pip5, pip6, pip7]) {
      expect(pip.width).toBe(pip.height);
    }

    // 5. PIPs 1–4 share the same Y position
    expect(pip1.y).toBe(pip2.y);
    expect(pip2.y).toBe(pip3.y);
    expect(pip3.y).toBe(pip4.y);

    // 6. PIPs 5–7 share the same Y position
    expect(pip5.y).toBe(pip6.y);
    expect(pip6.y).toBe(pip7.y);

    // 7. Bottom row is below top row
    expect(pip5.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);

    // 8. Top row horizontal gaps are equal
    const topGap1 = Number((pip2.x - (pip1.x + pip1.width)).toFixed(4));
    const topGap2 = Number((pip3.x - (pip2.x + pip2.width)).toFixed(4));
    const topGap3 = Number((pip4.x - (pip3.x + pip3.width)).toFixed(4));
    expect(topGap1).toBe(topGap2);
    expect(topGap2).toBe(topGap3);

    // 9. Bottom row horizontal gaps are equal
    const bottomGap1 = Number((pip6.x - (pip5.x + pip5.width)).toFixed(4));
    const bottomGap2 = Number((pip7.x - (pip6.x + pip6.width)).toFixed(4));
    expect(bottomGap1).toBe(bottomGap2);

    // 10. Bottom row gap matches top row gap
    expect(bottomGap1).toBe(topGap1);

    // 11. Top row has balanced left/right exterior margins
    const topRowLeftMargin = pip1.x;
    const topRowRightMargin = Number((100 - (pip4.x + pip4.width)).toFixed(4));
    expect(topRowLeftMargin).toBe(topRowRightMargin);

    // 12. Bottom row has balanced left/right exterior margins
    const bottomRowLeftMargin = pip5.x;
    const bottomRowRightMargin = Number((100 - (pip7.x + pip7.width)).toFixed(4));
    expect(bottomRowLeftMargin).toBe(bottomRowRightMargin);

    // 13. Bottom row group is mathematically centered
    const bottomGroupWidth = Number((pip7.x + pip7.width - pip5.x).toFixed(4));
    const expectedBottomGroupX = Number(((100 - bottomGroupWidth) / 2).toFixed(4));
    expect(pip5.x).toBe(expectedBottomGroupX);

    // 14. No PIPs overlap
    expect(pip1.x + pip1.width).toBeLessThanOrEqual(pip2.x);
    expect(pip2.x + pip2.width).toBeLessThanOrEqual(pip3.x);
    expect(pip3.x + pip3.width).toBeLessThanOrEqual(pip4.x);
    expect(pip5.x + pip5.width).toBeLessThanOrEqual(pip6.x);
    expect(pip6.x + pip6.width).toBeLessThanOrEqual(pip7.x);
    expect(pip5.y).toBeGreaterThanOrEqual(pip1.y + pip1.height);
    expect(pip6.y).toBeGreaterThanOrEqual(pip2.y + pip2.height);
    expect(pip7.y).toBeGreaterThanOrEqual(pip3.y + pip3.height);

    // 15. Every PIP remains inside canvas boundaries
    for (const pip of [pip1, pip2, pip3, pip4, pip5, pip6, pip7]) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x + pip.width).toBeLessThanOrEqual(100);
      expect(pip.y + pip.height).toBeLessThanOrEqual(100);
    }

    // 16. Canonical layout lookup resolves correctly
    const resolved = getLayoutDefinition('7 BOX');
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('7-BOX');
    expect(resolved?.category).toBe('Standard Grid');
    expect(resolved?.windows[0]).toMatchObject(LAYOUT_7_BOX.windows[0]);
    expect(resolved?.windows[1]).toMatchObject(LAYOUT_7_BOX.windows[1]);
    expect(resolved?.windows[2]).toMatchObject(LAYOUT_7_BOX.windows[2]);
    expect(resolved?.windows[3]).toMatchObject(LAYOUT_7_BOX.windows[3]);
    expect(resolved?.windows[4]).toMatchObject(LAYOUT_7_BOX.windows[4]);
    expect(resolved?.windows[5]).toMatchObject(LAYOUT_7_BOX.windows[5]);
    expect(resolved?.windows[6]).toMatchObject(LAYOUT_7_BOX.windows[6]);

    // 17. Stable PIP IDs remain PIP-01 through PIP-07
    expect(resolved?.windows[0].pipId).toBe('PIP-01');
    expect(resolved?.windows[1].pipId).toBe('PIP-02');
    expect(resolved?.windows[2].pipId).toBe('PIP-03');
    expect(resolved?.windows[3].pipId).toBe('PIP-04');
    expect(resolved?.windows[4].pipId).toBe('PIP-05');
    expect(resolved?.windows[5].pipId).toBe('PIP-06');
    expect(resolved?.windows[6].pipId).toBe('PIP-07');

    // 18. Basic 2 remains unchanged
    expect(LAYOUT_2_BOX.windows[0]).toMatchObject({ x: 0.2, y: 25.5, width: 49.6, height: 49.6 });
    expect(LAYOUT_2_BOX.windows[1]).toMatchObject({ x: 50.2, y: 25.5, width: 49.6, height: 49.6 });

    // 19. Basic 3 remains unchanged
    expect(LAYOUT_3_BOX.windows[0]).toMatchObject({ x: 2.0, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[1]).toMatchObject({ x: 50.4, y: 2.0, width: 47.6, height: 47.6 });
    expect(LAYOUT_3_BOX.windows[2]).toMatchObject({ x: 26.2, y: 51.0, width: 47.6, height: 47.6 });

    // 20. Basic 4 remains unchanged
    expect(LAYOUT_4_BOX.windows[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[1]).toMatchObject({ x: 50, y: 0, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[2]).toMatchObject({ x: 0, y: 50, width: 50, height: 50 });
    expect(LAYOUT_4_BOX.windows[3]).toMatchObject({ x: 50, y: 50, width: 50, height: 50 });

    // 21. Basic 5 remains unchanged
    expect(LAYOUT_5_BOX.windows[0]).toMatchObject({ x: 2.0, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[1]).toMatchObject({ x: 34.4, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[2]).toMatchObject({ x: 66.8, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[3]).toMatchObject({ x: 18.2, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_5_BOX.windows[4]).toMatchObject({ x: 50.6, y: 53.8, width: 31.2, height: 31.2 });

    // 22. Basic 6 remains unchanged
    expect(LAYOUT_6_BOX.windows[0]).toMatchObject({ x: 2.0, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[1]).toMatchObject({ x: 34.4, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[2]).toMatchObject({ x: 66.8, y: 15.0, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[3]).toMatchObject({ x: 2.0, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[4]).toMatchObject({ x: 34.4, y: 53.8, width: 31.2, height: 31.2 });
    expect(LAYOUT_6_BOX.windows[5]).toMatchObject({ x: 66.8, y: 53.8, width: 31.2, height: 31.2 });

    // 23. Basic 8 remains unchanged
    expect(LAYOUT_8_BOX.windows[0]).toMatchObject({ x: 2.0, y: 15.0, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[1]).toMatchObject({ x: 26.3, y: 15.0, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[2]).toMatchObject({ x: 50.6, y: 15.0, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[3]).toMatchObject({ x: 74.9, y: 15.0, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[4]).toMatchObject({ x: 2.0, y: 53.8, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[5]).toMatchObject({ x: 26.3, y: 53.8, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[6]).toMatchObject({ x: 50.6, y: 53.8, width: 23.1, height: 23.1 });
    expect(LAYOUT_8_BOX.windows[7]).toMatchObject({ x: 74.9, y: 53.8, width: 23.1, height: 23.1 });
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
