import { Source } from '../../domain/models';
import {
  SEED_ALL_SOURCES,
  SEED_EVERTZ_SOURCES,
  SEED_LAWO_SOURCES,
  SEED_LAWO_PROCESSING_DEVICES,
} from './sourceInventory';

/**
 * Authoritative facility master router source catalog ingested from:
 *   data/VIP Tracker Source Directory.xlsx
 *
 * Contains 712 verified broadcast router sources across:
 * - 307 Lawo originating sources
 * - 138 Lawo processing stage devices (UDX, Frame Sync, Color Corrector, Caption)
 * - 117 Lawo-to-Evertz tielines (vCam, vTie, vIngest, vPgm)
 * - 150 Direct Evertz sources (VIP Outputs, JXS, Playback, Switcher, Caption Enc, QC)
 */
export const SEED_SOURCES: Source[] = SEED_ALL_SOURCES;

export const RAW_SEED_SOURCE_NAMES: readonly string[] = SEED_SOURCES.map((s) => s.name);

export { SEED_ALL_SOURCES, SEED_EVERTZ_SOURCES, SEED_LAWO_SOURCES, SEED_LAWO_PROCESSING_DEVICES };
