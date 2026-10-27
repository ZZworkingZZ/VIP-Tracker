/**
 * Evertz VIP Layout Geometry Definitions
 *
 * Defines the spatial coordinates (x, y, width, height as percentages 0-100)
 * for standard broadcast multiviewer layouts.
 */

import { PipId, createPipId } from './identifiers';

export interface LayoutWindowDefinition {
  readonly id: string;
  readonly pipId?: PipId;
  readonly x: number; // percentage (0 - 100)
  readonly y: number; // percentage (0 - 100)
  readonly width: number; // percentage (0 - 100)
  readonly height: number; // percentage (0 - 100)
  readonly destinationOffset: number; // 0-based offset into output's mapped window inputs
  readonly label?: string;
}

export type LayoutCategory =
  'Standard Grid' | 'Hero Split' | 'High Density' | 'Audio / Metering' | 'Custom';

export interface LayoutDefinition {
  readonly id: string;
  readonly name: string;
  readonly windowCount: number;
  readonly aspectRatio: string; // e.g. '16:9'
  readonly category: LayoutCategory;
  readonly description: string;
  readonly windows: readonly LayoutWindowDefinition[];
  readonly isCustom?: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * 1 BOX (Full Screen single destination)
 */
export const LAYOUT_1_BOX: LayoutDefinition = {
  id: '1-BOX',
  name: '1 BOX',
  windowCount: 1,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: 'Full-screen single destination display',
  windows: [
    {
      id: 'w-1',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      destinationOffset: 0,
    },
  ],
};

/**
 * 2 BOX (Side-by-side dual screen)
 */
export const LAYOUT_2_BOX: LayoutDefinition = {
  id: '2-BOX',
  name: '2 BOX',
  windowCount: 2,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: 'Dual side-by-side 16:9 windows',
  windows: [
    { id: 'w-1', x: 0.2, y: 25.5, width: 49.6, height: 49.6, destinationOffset: 0 },
    { id: 'w-2', x: 50.2, y: 25.5, width: 49.6, height: 49.6, destinationOffset: 1 },
  ],
};

/**
 * 3 BOX (2-over-1 layout: 2 equal upper windows, 1 centered lower window)
 */
export const LAYOUT_3_BOX: LayoutDefinition = {
  id: '3-BOX',
  name: '3 BOX',
  windowCount: 3,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '2-over-1 layout with two equal upper windows and one centered lower window',
  windows: [
    { id: 'w-1', x: 2.0, y: 2.0, width: 47.6, height: 47.6, destinationOffset: 0 },
    { id: 'w-2', x: 50.4, y: 2.0, width: 47.6, height: 47.6, destinationOffset: 1 },
    { id: 'w-3', x: 26.2, y: 51.0, width: 47.6, height: 47.6, destinationOffset: 2 },
  ],
};

/**
 * 4 BOX (Classic 2x2 Quad Split)
 */
export const LAYOUT_4_BOX: LayoutDefinition = {
  id: '4-BOX',
  name: '4 BOX',
  windowCount: 4,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: 'Standard 2x2 quad-split layout',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
    { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
    { id: 'w-3', x: 0, y: 50, width: 50, height: 50, destinationOffset: 2 },
    { id: 'w-4', x: 50, y: 50, width: 50, height: 50, destinationOffset: 3 },
  ],
};

/**
 * 5 BOX (3-over-2 layout: 3 equal upper windows, 2 centered lower windows)
 */
export const LAYOUT_5_BOX: LayoutDefinition = {
  id: '5-BOX',
  name: '5 BOX',
  windowCount: 5,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '3-over-2 layout with three equal upper windows and two centered lower windows',
  windows: [
    { id: 'w-1', x: 2.0, y: 15.0, width: 31.2, height: 31.2, destinationOffset: 0 },
    { id: 'w-2', x: 34.4, y: 15.0, width: 31.2, height: 31.2, destinationOffset: 1 },
    { id: 'w-3', x: 66.8, y: 15.0, width: 31.2, height: 31.2, destinationOffset: 2 },
    { id: 'w-4', x: 18.2, y: 53.8, width: 31.2, height: 31.2, destinationOffset: 3 },
    { id: 'w-5', x: 50.6, y: 53.8, width: 31.2, height: 31.2, destinationOffset: 4 },
  ],
};

/**
 * 6 BOX (3 Columns x 2 Rows)
 */
export const LAYOUT_6_BOX: LayoutDefinition = {
  id: '6-BOX',
  name: '6 BOX',
  windowCount: 6,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '3 columns by 2 rows uniform grid',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 33.333, height: 50, destinationOffset: 0 },
    { id: 'w-2', x: 33.333, y: 0, width: 33.333, height: 50, destinationOffset: 1 },
    { id: 'w-3', x: 66.666, y: 0, width: 33.334, height: 50, destinationOffset: 2 },
    { id: 'w-4', x: 0, y: 50, width: 33.333, height: 50, destinationOffset: 3 },
    { id: 'w-5', x: 33.333, y: 50, width: 33.333, height: 50, destinationOffset: 4 },
    { id: 'w-6', x: 66.666, y: 50, width: 33.334, height: 50, destinationOffset: 5 },
  ],
};

/**
 * 7 BOX (1 Hero Window Top-Left, 6 Auxiliary Production Windows)
 */
export const LAYOUT_7_BOX: LayoutDefinition = {
  id: '7-BOX',
  name: '7 BOX',
  windowCount: 7,
  aspectRatio: '16:9',
  category: 'Hero Split',
  description: '1 large hero window top-left with 6 auxiliary production windows',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 66.666, height: 66.666, destinationOffset: 0 },
    { id: 'w-2', x: 66.666, y: 0, width: 33.334, height: 33.333, destinationOffset: 1 },
    { id: 'w-3', x: 66.666, y: 33.333, width: 33.334, height: 33.333, destinationOffset: 2 },
    { id: 'w-4', x: 0, y: 66.666, width: 25, height: 33.334, destinationOffset: 3 },
    { id: 'w-5', x: 25, y: 66.666, width: 25, height: 33.334, destinationOffset: 4 },
    { id: 'w-6', x: 50, y: 66.666, width: 25, height: 33.334, destinationOffset: 5 },
    { id: 'w-7', x: 75, y: 66.666, width: 25, height: 33.334, destinationOffset: 6 },
  ],
};

/**
 * 8 BOX (4 Columns x 2 Rows)
 */
export const LAYOUT_8_BOX: LayoutDefinition = {
  id: '8-BOX',
  name: '8 BOX',
  windowCount: 8,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '4 columns by 2 rows uniform grid',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 25, height: 50, destinationOffset: 0 },
    { id: 'w-2', x: 25, y: 0, width: 25, height: 50, destinationOffset: 1 },
    { id: 'w-3', x: 50, y: 0, width: 25, height: 50, destinationOffset: 2 },
    { id: 'w-4', x: 75, y: 0, width: 25, height: 50, destinationOffset: 3 },
    { id: 'w-5', x: 0, y: 50, width: 25, height: 50, destinationOffset: 4 },
    { id: 'w-6', x: 25, y: 50, width: 25, height: 50, destinationOffset: 5 },
    { id: 'w-7', x: 50, y: 50, width: 25, height: 50, destinationOffset: 6 },
    { id: 'w-8', x: 75, y: 50, width: 25, height: 50, destinationOffset: 7 },
  ],
};

/**
 * 9 BOX (3 Columns x 3 Rows Uniform 9-Way Split)
 */
export const LAYOUT_9_BOX: LayoutDefinition = {
  id: '9-BOX',
  name: '9 BOX',
  windowCount: 9,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '3 columns by 3 rows uniform 9-way split',
  windows: Array.from({ length: 9 }, (_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      id: `w-${i + 1}`,
      x: col * 33.333,
      y: row * 33.333,
      width: col === 2 ? 33.334 : 33.333,
      height: row === 2 ? 33.334 : 33.333,
      destinationOffset: i,
    };
  }),
};

/**
 * 10 BOX (Evertz Broadcast Control: 2 Hero Windows Left, 8 Small Windows Right)
 */
export const LAYOUT_10_BOX: LayoutDefinition = {
  id: '10-BOX',
  name: '10 BOX',
  windowCount: 10,
  aspectRatio: '16:9',
  category: 'Hero Split',
  description: '2 large hero windows left with 8 auxiliary windows in 4x2 grid right',
  windows: [
    // 2 Hero windows (left half, stacked)
    { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
    { id: 'w-2', x: 0, y: 50, width: 50, height: 50, destinationOffset: 1 },
    // 8 small windows (right half, 2 cols x 4 rows)
    { id: 'w-3', x: 50, y: 0, width: 25, height: 25, destinationOffset: 2 },
    { id: 'w-4', x: 75, y: 0, width: 25, height: 25, destinationOffset: 3 },
    { id: 'w-5', x: 50, y: 25, width: 25, height: 25, destinationOffset: 4 },
    { id: 'w-6', x: 75, y: 25, width: 25, height: 25, destinationOffset: 5 },
    { id: 'w-7', x: 50, y: 50, width: 25, height: 25, destinationOffset: 6 },
    { id: 'w-8', x: 75, y: 50, width: 25, height: 25, destinationOffset: 7 },
    { id: 'w-9', x: 50, y: 75, width: 25, height: 25, destinationOffset: 8 },
    { id: 'w-10', x: 75, y: 75, width: 25, height: 25, destinationOffset: 9 },
  ],
};

/**
 * 11 BOX (1 Hero Window Top-Left, Surrounded by 10 Auxiliary Windows)
 */
export const LAYOUT_11_BOX: LayoutDefinition = {
  id: '11-BOX',
  name: '11 BOX',
  windowCount: 11,
  aspectRatio: '16:9',
  category: 'Hero Split',
  description: '1 primary hero window with 10 surrounding production monitoring windows',
  windows: [
    // Hero window (w: 50%, h: 66.666%)
    { id: 'w-1', x: 0, y: 0, width: 50, height: 66.666, destinationOffset: 0 },
    // 6 windows on right (2 cols x 3 rows of 25% w, 33.333% h each)
    { id: 'w-2', x: 50, y: 0, width: 25, height: 33.333, destinationOffset: 1 },
    { id: 'w-3', x: 75, y: 0, width: 25, height: 33.333, destinationOffset: 2 },
    { id: 'w-4', x: 50, y: 33.333, width: 25, height: 33.333, destinationOffset: 3 },
    { id: 'w-5', x: 75, y: 33.333, width: 25, height: 33.333, destinationOffset: 4 },
    // 4 windows across bottom row
    { id: 'w-6', x: 0, y: 66.666, width: 25, height: 33.334, destinationOffset: 5 },
    { id: 'w-7', x: 25, y: 66.666, width: 25, height: 33.334, destinationOffset: 6 },
    { id: 'w-8', x: 50, y: 66.666, width: 12.5, height: 33.334, destinationOffset: 7 },
    { id: 'w-9', x: 62.5, y: 66.666, width: 12.5, height: 33.334, destinationOffset: 8 },
    { id: 'w-10', x: 75, y: 66.666, width: 12.5, height: 33.334, destinationOffset: 9 },
    { id: 'w-11', x: 87.5, y: 66.666, width: 12.5, height: 33.334, destinationOffset: 10 },
  ],
};

/**
 * 12 BOX (4 Columns x 3 Rows)
 */
export const LAYOUT_12_BOX: LayoutDefinition = {
  id: '12-BOX',
  name: '12 BOX',
  windowCount: 12,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '4 columns by 3 rows uniform grid',
  windows: Array.from({ length: 12 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return {
      id: `w-${i + 1}`,
      x: col * 25,
      y: row * 33.333,
      width: 25,
      height: 33.333,
      destinationOffset: i,
    };
  }),
};

/**
 * 13 BOX (1 Hero Window Top-Left, 12 Auxiliary Windows)
 */
export const LAYOUT_13_BOX: LayoutDefinition = {
  id: '13-BOX',
  name: '13 BOX',
  windowCount: 13,
  aspectRatio: '16:9',
  category: 'Hero Split',
  description: '1 primary hero window with 12 surrounding auxiliary windows',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 50, height: 66.666, destinationOffset: 0 },
    { id: 'w-2', x: 50, y: 0, width: 25, height: 22.222, destinationOffset: 1 },
    { id: 'w-3', x: 75, y: 0, width: 25, height: 22.222, destinationOffset: 2 },
    { id: 'w-4', x: 50, y: 22.222, width: 25, height: 22.222, destinationOffset: 3 },
    { id: 'w-5', x: 75, y: 22.222, width: 25, height: 22.222, destinationOffset: 4 },
    { id: 'w-6', x: 50, y: 44.444, width: 25, height: 22.222, destinationOffset: 5 },
    { id: 'w-7', x: 75, y: 44.444, width: 25, height: 22.222, destinationOffset: 6 },
    { id: 'w-8', x: 0, y: 66.666, width: 16.666, height: 33.334, destinationOffset: 7 },
    { id: 'w-9', x: 16.666, y: 66.666, width: 16.666, height: 33.334, destinationOffset: 8 },
    { id: 'w-10', x: 33.332, y: 66.666, width: 16.666, height: 33.334, destinationOffset: 9 },
    { id: 'w-11', x: 49.998, y: 66.666, width: 16.666, height: 33.334, destinationOffset: 10 },
    { id: 'w-12', x: 66.664, y: 66.666, width: 16.666, height: 33.334, destinationOffset: 11 },
    { id: 'w-13', x: 83.33, y: 66.666, width: 16.67, height: 33.334, destinationOffset: 12 },
  ],
};

/**
 * 14 BOX (Dual Hero Top, 12 Auxiliary Windows Below)
 */
export const LAYOUT_14_BOX: LayoutDefinition = {
  id: '14-BOX',
  name: '14 BOX',
  windowCount: 14,
  aspectRatio: '16:9',
  category: 'Hero Split',
  description: 'Dual hero program/preview windows top with 12 auxiliary windows below',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 50, height: 50, destinationOffset: 0 },
    { id: 'w-2', x: 50, y: 0, width: 50, height: 50, destinationOffset: 1 },
    ...Array.from({ length: 12 }, (_, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const cellW = 100 / 6;
      return {
        id: `w-${i + 3}`,
        x: col * cellW,
        y: 50 + row * 25,
        width: col === 5 ? 100 - 5 * cellW : cellW,
        height: 25,
        destinationOffset: i + 2,
      };
    }),
  ],
};

/**
 * 15 BOX (5 Columns x 3 Rows Uniform Grid)
 */
export const LAYOUT_15_BOX: LayoutDefinition = {
  id: '15-BOX',
  name: '15 BOX',
  windowCount: 15,
  aspectRatio: '16:9',
  category: 'Standard Grid',
  description: '5 columns by 3 rows uniform grid',
  windows: Array.from({ length: 15 }, (_, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    return {
      id: `w-${i + 1}`,
      x: col * 20,
      y: row * 33.333,
      width: 20,
      height: row === 2 ? 33.334 : 33.333,
      destinationOffset: i,
    };
  }),
};

/**
 * 16 BOX (4 Columns x 4 Rows)
 */
export const LAYOUT_16_BOX: LayoutDefinition = {
  id: '16-BOX',
  name: '16 BOX',
  windowCount: 16,
  aspectRatio: '16:9',
  category: 'High Density',
  description: '4 columns by 4 rows uniform grid',
  windows: Array.from({ length: 16 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return {
      id: `w-${i + 1}`,
      x: col * 25,
      y: row * 25,
      width: 25,
      height: 25,
      destinationOffset: i,
    };
  }),
};

/**
 * 20 Box Audio (5 Columns x 4 Rows with audio metering spaces)
 */
export const LAYOUT_20_BOX_AUDIO: LayoutDefinition = {
  id: '20-BOX-AUDIO',
  name: '20 Box Audio',
  windowCount: 20,
  aspectRatio: '16:9',
  category: 'Audio / Metering',
  description: '5 columns by 4 rows optimized for video sources with audio bars',
  windows: Array.from({ length: 20 }, (_, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    return {
      id: `w-${i + 1}`,
      x: col * 20,
      y: row * 25,
      width: 20,
      height: 25,
      destinationOffset: i,
    };
  }),
};

/**
 * 24 BOX (6 Columns x 4 Rows High Density)
 */
export const LAYOUT_24_BOX: LayoutDefinition = {
  id: '24-BOX',
  name: '24 BOX',
  windowCount: 24,
  aspectRatio: '16:9',
  category: 'High Density',
  description: '6 columns by 4 rows high-density production grid',
  windows: Array.from({ length: 24 }, (_, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const cellW = 100 / 6;
    return {
      id: `w-${i + 1}`,
      x: col * cellW,
      y: row * 25,
      width: col === 5 ? 100 - 5 * cellW : cellW,
      height: 25,
      destinationOffset: i,
    };
  }),
};

/**
 * 28 BOX (7 Columns x 4 Rows High Density)
 */
export const LAYOUT_28_BOX: LayoutDefinition = {
  id: '28-BOX',
  name: '28 BOX',
  windowCount: 28,
  aspectRatio: '16:9',
  category: 'High Density',
  description: '7 columns by 4 rows high-density engineering wall',
  windows: Array.from({ length: 28 }, (_, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    const cellW = 100 / 7;
    return {
      id: `w-${i + 1}`,
      x: col * cellW,
      y: row * 25,
      width: col === 6 ? 100 - 6 * cellW : cellW,
      height: 25,
      destinationOffset: i,
    };
  }),
};

/**
 * 32 BOX (8 Columns x 4 Rows High Density)
 */
export const LAYOUT_32_BOX: LayoutDefinition = {
  id: '32-BOX',
  name: '32 BOX',
  windowCount: 32,
  aspectRatio: '16:9',
  category: 'High Density',
  description: '8 columns by 4 rows high-density destination wall',
  windows: Array.from({ length: 32 }, (_, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    return {
      id: `w-${i + 1}`,
      x: col * 12.5,
      y: row * 25,
      width: 12.5,
      height: 25,
      destinationOffset: i,
    };
  }),
};

/**
 * 36 BOX (6 Columns x 6 Rows High-Density Engineering Monitor)
 */
export const LAYOUT_36_BOX: LayoutDefinition = {
  id: '36-BOX',
  name: '36 BOX',
  windowCount: 36,
  aspectRatio: '16:9',
  category: 'High Density',
  description: '6 columns by 6 rows high-density destination wall',
  windows: Array.from({ length: 36 }, (_, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    return {
      id: `w-${i + 1}`,
      x: col * (100 / 6),
      y: row * (100 / 6),
      width: 100 / 6,
      height: 100 / 6,
      destinationOffset: i,
    };
  }),
};

/**
 * All recognized standard Evertz layouts in the catalog (ordered by window count)
 */
export const STANDARD_LAYOUTS: readonly LayoutDefinition[] = [
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
];

/**
 * Generate a dynamic fallback grid definition for non-standard box counts
 */
export function createFallbackGrid(count: number, name: string): LayoutDefinition {
  // Choose sensible cols and rows
  const cols = Math.ceil(Math.sqrt(count * (16 / 9)));
  const rows = Math.ceil(count / cols);
  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;

  const windows: LayoutWindowDefinition[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    windows.push({
      id: `w-${i + 1}`,
      x: col * cellWidth,
      y: row * cellHeight,
      width: cellWidth,
      height: cellHeight,
      destinationOffset: i,
    });
  }

  return {
    id: `CUSTOM-${count}-BOX`,
    name,
    windowCount: count,
    aspectRatio: '16:9',
    category: 'Custom',
    description: `Dynamic ${count}-window grid layout`,
    windows,
  };
}

/**
 * Module-level registry for custom user-created layouts
 */
let customLayoutRegistry: LayoutDefinition[] = [];

export function setCustomLayoutRegistry(layouts: readonly LayoutDefinition[]): void {
  customLayoutRegistry = [...layouts];
}

export function getCustomLayoutRegistry(): readonly LayoutDefinition[] {
  return customLayoutRegistry;
}

export function clearCustomLayoutRegistry(): void {
  customLayoutRegistry = [];
}

/**
 * Gets or computes the PIP ID for a given window and position.
 */
export function getWindowPipId(window: LayoutWindowDefinition, index: number): PipId {
  if (window.pipId) {
    return window.pipId;
  }
  if (window.id.startsWith('PIP-')) {
    return window.id as PipId;
  }
  return createPipId(index + 1);
}

/**
 * Ensures all windows in a layout definition have deterministic pipId values.
 */
export function ensureLayoutPipIds(layout: LayoutDefinition): LayoutDefinition {
  const needsPipIds = layout.windows.some((w) => !w.pipId);
  if (!needsPipIds) return layout;
  return {
    ...layout,
    windows: layout.windows.map((w, idx) => ({
      ...w,
      pipId: getWindowPipId(w, idx),
    })),
  };
}

/**
 * Returns structured PIP information for each window in a layout.
 */
export function getLayoutPips(layout: LayoutDefinition): Array<{
  pipId: PipId;
  window: LayoutWindowDefinition;
  index: number;
}> {
  return layout.windows.map((w, idx) => ({
    pipId: getWindowPipId(w, idx),
    window: w,
    index: idx,
  }));
}

/**
 * Resolve a layout name (e.g. '4 BOX', '5 BOX', 'CONTROL-ROOM', '99 BOX') to its geometric definition.
 * Resolution hierarchy:
 * 1. Explicit built-in definition from STANDARD_LAYOUTS
 * 2. Saved custom definition (passed in or from customLayoutRegistry)
 * 3. Fallback grid for otherwise unknown numeric box counts
 */
export function getLayoutDefinition(
  layoutName: string | null | undefined,
  customLayouts?: readonly LayoutDefinition[]
): LayoutDefinition | null {
  if (!layoutName || !layoutName.trim()) {
    return null;
  }

  const trimmed = layoutName.trim();
  const normalized = trimmed.toUpperCase().replace(/\s+/g, ' ');

  // 1. Exact match in STANDARD_LAYOUTS by name or id
  for (const layout of STANDARD_LAYOUTS) {
    if (layout.name.toUpperCase() === normalized || layout.id.toUpperCase() === normalized) {
      return ensureLayoutPipIds(layout);
    }
  }

  // 2. Exact match in Custom Layouts (passed explicitly, or from registry)
  const activeCustoms = customLayouts ?? customLayoutRegistry;
  for (const layout of activeCustoms) {
    if (layout.name.toUpperCase() === normalized || layout.id.toUpperCase() === normalized) {
      return ensureLayoutPipIds(layout);
    }
  }

  // 3. Check aliases like '20 BOX', '20-BOX', '20 BOX AUDIO'
  if (normalized.includes('20') && normalized.includes('BOX')) {
    return ensureLayoutPipIds(LAYOUT_20_BOX_AUDIO);
  }

  // 4. Parse numeric box count e.g. "4 BOX", "8BOX", "12 BOX"
  const match = normalized.match(/^(\d+)\s*BOX/i);
  if (match) {
    const count = parseInt(match[1], 10);
    // Check if one of standard layouts has this count
    const standard = STANDARD_LAYOUTS.find((l) => l.windowCount === count);
    if (standard) {
      return ensureLayoutPipIds(standard);
    }
    const custom = activeCustoms.find((l) => l.windowCount === count);
    if (custom) {
      return ensureLayoutPipIds(custom);
    }
    return ensureLayoutPipIds(createFallbackGrid(count, trimmed));
  }

  return null;
}
