/**
 * Evertz VIP Layout Geometry Definitions
 *
 * Defines the spatial coordinates (x, y, width, height as percentages 0-100)
 * for standard broadcast multiviewer layouts.
 */

export interface LayoutWindowDefinition {
  readonly id: string;
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
    { id: 'w-1', x: 0, y: 0, width: 50, height: 100, destinationOffset: 0 },
    { id: 'w-2', x: 50, y: 0, width: 50, height: 100, destinationOffset: 1 },
  ],
};

/**
 * 3 BOX (1 Hero Window Left, 2 Stacked Windows Right)
 * Standard broadcast control room preview/program geometry
 */
export const LAYOUT_3_BOX: LayoutDefinition = {
  id: '3-BOX',
  name: '3 BOX',
  windowCount: 3,
  aspectRatio: '16:9',
  category: 'Hero Split',
  description: '1 large hero window left with 2 stacked auxiliary windows right',
  windows: [
    { id: 'w-1', x: 0, y: 0, width: 66.666, height: 100, destinationOffset: 0 },
    { id: 'w-2', x: 66.666, y: 0, width: 33.334, height: 50, destinationOffset: 1 },
    { id: 'w-3', x: 66.666, y: 50, width: 33.334, height: 50, destinationOffset: 2 },
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
 * All recognized standard Evertz layouts in the catalog
 */
export const STANDARD_LAYOUTS: readonly LayoutDefinition[] = [
  LAYOUT_1_BOX,
  LAYOUT_2_BOX,
  LAYOUT_3_BOX,
  LAYOUT_4_BOX,
  LAYOUT_6_BOX,
  LAYOUT_8_BOX,
  LAYOUT_10_BOX,
  LAYOUT_11_BOX,
  LAYOUT_12_BOX,
  LAYOUT_16_BOX,
  LAYOUT_20_BOX_AUDIO,
  LAYOUT_36_BOX,
];

/**
 * Generate a dynamic fallback grid definition for non-standard box counts
 */
function createFallbackGrid(count: number, name: string): LayoutDefinition {
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
 * Resolve a layout name (e.g. '4 BOX', 'HOH-WKB-01', '36 BOX') to its geometric definition
 */
export function getLayoutDefinition(
  layoutName: string | null | undefined
): LayoutDefinition | null {
  if (!layoutName || !layoutName.trim()) {
    return null;
  }

  const trimmed = layoutName.trim();
  const normalized = trimmed.toUpperCase().replace(/\s+/g, ' ');

  // Direct exact match by name
  for (const layout of STANDARD_LAYOUTS) {
    if (layout.name.toUpperCase() === normalized || layout.id.toUpperCase() === normalized) {
      return layout;
    }
  }

  // Check aliases like '20 BOX', '20-BOX', '20 BOX AUDIO'
  if (normalized.includes('20') && normalized.includes('BOX')) {
    return LAYOUT_20_BOX_AUDIO;
  }

  // Parse numeric box count e.g. "4 BOX", "8BOX", "12 BOX"
  const match = normalized.match(/^(\d+)\s*BOX/i);
  if (match) {
    const count = parseInt(match[1], 10);
    // Check if one of standard layouts has this count
    const standard = STANDARD_LAYOUTS.find((l) => l.windowCount === count);
    if (standard) {
      return standard;
    }
    return createFallbackGrid(count, trimmed);
  }

  return null;
}
