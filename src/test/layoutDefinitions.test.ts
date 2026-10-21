import { describe, it, expect } from 'vitest';
import {
  STANDARD_LAYOUTS,
  getLayoutDefinition,
  LAYOUT_3_BOX,
  LAYOUT_4_BOX,
  LAYOUT_10_BOX,
  LAYOUT_11_BOX,
  LAYOUT_36_BOX,
} from '../domain/layoutDefinitions';

describe('Layout Definitions Domain Logic', () => {
  it('defines 12 standard Evertz layouts with valid geometry', () => {
    expect(STANDARD_LAYOUTS.length).toBeGreaterThanOrEqual(12);

    for (const layout of STANDARD_LAYOUTS) {
      expect(layout.id).toBeTruthy();
      expect(layout.name).toBeTruthy();
      expect(layout.windowCount).toBeGreaterThan(0);
      expect(layout.windows.length).toBe(layout.windowCount);

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
        expect(win.destinationOffset).toBeGreaterThanOrEqual(0);
        expect(win.destinationOffset).toBeLessThan(layout.windowCount);
      }
    }
  });

  it('correctly models 4 BOX as 2x2 quad split', () => {
    expect(LAYOUT_4_BOX.windowCount).toBe(4);
    expect(LAYOUT_4_BOX.windows).toEqual([
      { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
      { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
      { id: 'w-3', x: 0, y: 50, width: 50, height: 50, destinationOffset: 2 },
      { id: 'w-4', x: 50, y: 50, width: 50, height: 50, destinationOffset: 3 },
    ]);
  });

  it('correctly models 3 BOX as hero window left and 2 stacked right', () => {
    expect(LAYOUT_3_BOX.windowCount).toBe(3);
    const [hero, topAux, botAux] = LAYOUT_3_BOX.windows;
    expect(hero.width).toBeGreaterThan(50);
    expect(hero.height).toBe(100);
    expect(topAux.x).toBeCloseTo(66.666, 1);
    expect(botAux.y).toBe(50);
  });

  it('correctly models 10 BOX and 11 BOX hero split layouts and 36 BOX density', () => {
    expect(LAYOUT_10_BOX.windowCount).toBe(10);
    expect(LAYOUT_11_BOX.windowCount).toBe(11);
    expect(LAYOUT_36_BOX.windowCount).toBe(36);
    expect(LAYOUT_36_BOX.windows.length).toBe(36);
  });

  it('resolves layout names case-insensitively and with whitespace variation', () => {
    expect(getLayoutDefinition('4 BOX')?.id).toBe('4-BOX');
    expect(getLayoutDefinition('4 box')?.id).toBe('4-BOX');
    expect(getLayoutDefinition('4BOX')?.id).toBe('4-BOX');
    expect(getLayoutDefinition('36 BOX')?.id).toBe('36-BOX');
    expect(getLayoutDefinition('10 BOX')?.id).toBe('10-BOX');
    expect(getLayoutDefinition('11 BOX')?.id).toBe('11-BOX');
    expect(getLayoutDefinition('20 Box Audio')?.id).toBe('20-BOX-AUDIO');
    expect(getLayoutDefinition('20 BOX')?.id).toBe('20-BOX-AUDIO');
  });

  it('generates clean fallback grid for uncataloged box counts', () => {
    const custom = getLayoutDefinition('9 BOX');
    expect(custom).not.toBeNull();
    expect(custom?.windowCount).toBe(9);
    expect(custom?.windows.length).toBe(9);
  });

  it('returns null for null, empty or non-matching layout strings', () => {
    expect(getLayoutDefinition(null)).toBeNull();
    expect(getLayoutDefinition('')).toBeNull();
    expect(getLayoutDefinition('   ')).toBeNull();
    expect(getLayoutDefinition('CUSTOM_UNKNOWN')).toBeNull();
  });
});
