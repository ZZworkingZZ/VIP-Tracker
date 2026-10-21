/**
 * Conservative source category classification rules for Evertz VIP Source Tracker.
 * Rules operate strictly on prefix/substring matching and never alter original raw names.
 */

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
  if (/^SW\b|^SWITCHER\b|^ME\b|^AUX\b|^PGM\b|^PST\b/.test(upper)) {
    return 'Switcher';
  }
  if (/^TX\b|^TRANS\b|^SAT\b|^FIBER\b/.test(upper)) {
    return 'Transmission';
  }
  if (/^VCAM\b|^CAM\b|^ROBO\b/.test(upper)) {
    return 'Virtual Camera';
  }
  if (/^VING\b|^INGEST\b/.test(upper)) {
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
