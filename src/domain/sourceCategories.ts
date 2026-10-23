/**
 * Conservative source category classification rules for Evertz VIP Source Tracker.
 * Rules operate strictly on prefix/substring matching and never alter original raw names.
 */

import type { SourceType } from './models';

export const SOURCE_CATEGORIES = [
  'Test',
  'Capture Encoder',
  'J2K Clip',
  'J2K Replay',
  'JXS Clip',
  'JXS Replay',
  'Multiview',
  'Switcher',
  'Transmission',
  'Virtual Camera',
  'Virtual Ingest',
  'Virtual Program',
  'Virtual Tie',
  'Other',
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/**
 * Classifies a raw source name into an operational category based on standard prefixes.
 * Does not mutate or normalize the original string.
 */
export function classifySourceCategory(rawName: string): SourceCategory {
  const upper = rawName.trim().toUpperCase();

  if (/TEST|COLOR|BARS|TONE|BLACK|SYNC/.test(upper)) {
    return 'Test';
  }
  if (/^CAP\b|^CAPTURE\b|ENC\b|ENCODER/.test(upper)) {
    return 'Capture Encoder';
  }
  if (/^J2K.*CLIP|^J2K_CLIP/.test(upper)) {
    return 'J2K Clip';
  }
  if (/^J2K.*RPL|^J2K.*REPLAY/.test(upper)) {
    return 'J2K Replay';
  }
  if (/^JXS.*CLIP|^JXS_CLIP/.test(upper)) {
    return 'JXS Clip';
  }
  if (/^JXS.*RPL|^JXS.*REPLAY|^JXS DEC|^JXS ENC/.test(upper)) {
    return 'JXS Replay';
  }
  if (/^MV\b|^VIP\b|^MULTI\b/.test(upper)) {
    return 'Multiview';
  }
  if (/^SW\b|^SWR\b|^SWITCHER\b|^ME\b|^AUX\b|^PGM\b|^PST\b/.test(upper)) {
    return 'Switcher';
  }
  if (/^TX\b|^TRANS\b|^SAT\b|^FIBER\b/.test(upper)) {
    return 'Transmission';
  }
  if (/^VCAM\b|^CAM\b|^ROBO\b/.test(upper)) {
    return 'Virtual Camera';
  }
  if (/^VING\b|^VINGEST\b|^INGEST\b/.test(upper)) {
    return 'Virtual Ingest';
  }
  if (/^VPGM\b|^PROG\b/.test(upper)) {
    return 'Virtual Program';
  }
  if (/^VTIE\b|^TIE\b/.test(upper)) {
    return 'Virtual Tie';
  }

  return 'Other';
}

/**
 * Maps an operational source category to a distinct visual indicator color.
 */
export function getSourceCategoryColor(category: SourceCategory): string {
  switch (category) {
    case 'Virtual Camera':
      return '#38bdf8'; // sky blue
    case 'J2K Replay':
    case 'JXS Replay':
      return '#34d399'; // emerald
    case 'Switcher':
      return '#fbbf24'; // amber
    case 'Transmission':
      return '#a78bfa'; // purple
    case 'Virtual Program':
      return '#f87171'; // red/coral
    case 'Test':
      return '#94a3b8'; // slate
    case 'Capture Encoder':
      return '#60a5fa'; // blue
    default:
      return '#38bdf8';
  }
}

/**
 * Classifies a raw source name into a topological SourceType based on conservative rules:
 * - Sources starting with 'v' or 'V' represent virtual sources (e.g. Lawo virtuals: vCam-02, VING, VPGM, VTIE).
 * - Sources starting with 'UDX' represent processing equipment (e.g. UDX-03 converters).
 * - All other sources are treated as originating broadcast signals.
 */
export function inferSourceType(rawName: string): SourceType {
  const trimmed = rawName.trim();
  if (/^v/i.test(trimmed)) {
    return 'virtual';
  }
  if (/^UDX/i.test(trimmed)) {
    return 'processing';
  }
  return 'originating';
}

export function isVirtualSource(source: { sourceType?: SourceType; name: string }): boolean {
  if (source.sourceType) {
    return source.sourceType === 'virtual';
  }
  return inferSourceType(source.name) === 'virtual';
}

export function isProcessingSource(source: { sourceType?: SourceType; name: string }): boolean {
  if (source.sourceType) {
    return source.sourceType === 'processing';
  }
  return inferSourceType(source.name) === 'processing';
}

export function isOriginatingSource(source: { sourceType?: SourceType; name: string }): boolean {
  if (source.sourceType) {
    return source.sourceType === 'originating';
  }
  return inferSourceType(source.name) === 'originating';
}
