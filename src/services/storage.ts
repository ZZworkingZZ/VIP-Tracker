import {
  MultiviewOutput,
  Destination,
  Source,
  OperationalAssignment,
  ChangeRecord,
  HistoryEntry,
} from '../domain/models';
import { SourceId, createSourceId } from '../domain/identifiers';
import { inferSourceType, SourceCategory } from '../domain/sourceCategories';
import { LayoutDefinition } from '../domain/layoutDefinitions';

export const TRACKER_STORAGE_KEY = 'vip_tracker_data_v1';
export const TRACKER_SCHEMA_VERSION = 2;
export const CURRENT_SOURCE_SEED_VERSION = 1;

export interface PersistedTrackerData {
  schemaVersion: number;
  sourceSeedVersion?: number;
  outputs: MultiviewOutput[];
  destinations: Destination[];
  sources: Source[];
  operationalAssignments: OperationalAssignment[];
  changeRecords: ChangeRecord[];
  savedAt: string;
  customLayouts?: LayoutDefinition[];
  history?: HistoryEntry[];
}

export interface TrackerStorage {
  load(): PersistedTrackerData | null;
  save(data: PersistedTrackerData): void;
  clear(): void;
}

/**
 * Validates that an arbitrary payload strictly adheres to the current V2 storage schema.
 */
export function isValidPersistedTrackerData(data: unknown): data is PersistedTrackerData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.schemaVersion !== TRACKER_SCHEMA_VERSION) return false;
  if (
    'sourceSeedVersion' in d &&
    d.sourceSeedVersion !== undefined &&
    typeof d.sourceSeedVersion !== 'number'
  ) {
    return false;
  }
  if (!Array.isArray(d.outputs) || !Array.isArray(d.destinations) || !Array.isArray(d.sources)) {
    return false;
  }
  for (const o of d.outputs) {
    if (!o || typeof o !== 'object') return false;
    const out = o as Record<string, unknown>;
    if (typeof out.id !== 'string') return false;
    if ('pipAssignments' in out && out.pipAssignments !== undefined) {
      if (typeof out.pipAssignments !== 'object' || out.pipAssignments === null) return false;
      for (const val of Object.values(out.pipAssignments as Record<string, unknown>)) {
        if (val !== null && typeof val !== 'string') return false;
      }
    }
  }
  for (const s of d.sources) {
    if (!s || typeof s !== 'object') return false;
    const src = s as Record<string, unknown>;
    if (typeof src.id !== 'string' || typeof src.name !== 'string') return false;
    if (
      'alias' in src &&
      src.alias !== undefined &&
      src.alias !== null &&
      typeof src.alias !== 'string'
    ) {
      return false;
    }
    if (
      !('upstreamSourceId' in src) ||
      (src.upstreamSourceId !== null && typeof src.upstreamSourceId !== 'string')
    ) {
      return false;
    }
    if (
      src.sourceType !== 'originating' &&
      src.sourceType !== 'processing' &&
      src.sourceType !== 'virtual'
    ) {
      return false;
    }
  }
  if ('customLayouts' in d && d.customLayouts !== undefined) {
    if (!Array.isArray(d.customLayouts)) return false;
    for (const cl of d.customLayouts) {
      if (!cl || typeof cl !== 'object') return false;
      const l = cl as Record<string, unknown>;
      if (
        typeof l.id !== 'string' ||
        typeof l.name !== 'string' ||
        typeof l.windowCount !== 'number' ||
        !Array.isArray(l.windows)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Pure V1-to-V2 schema migration.
 * Inspects the actual persisted structure and updates every stored source collection.
 * Migrates V1 sources to upstreamSourceId: null and conservatively inferred sourceType.
 * Preserves all existing entities and assignments.
 * Never mutates the original object in place; returns a new migrated copy or null on failure.
 */
export function migrateV1ToV2(raw: unknown): PersistedTrackerData | null {
  if (!raw || typeof raw !== 'object') return null;

  try {
    const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

    const migrateSourceList = (sources: unknown[]): Source[] => {
      return sources.map((s) => {
        const src = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
        const name = typeof src.name === 'string' ? src.name : '';
        const id: SourceId =
          typeof src.id === 'string' && src.id.startsWith('SRC:')
            ? (src.id as SourceId)
            : createSourceId(name || String(src.id ?? ''));

        const upstreamSourceId: SourceId | null =
          typeof src.upstreamSourceId === 'string' && src.upstreamSourceId.startsWith('SRC:')
            ? (src.upstreamSourceId as SourceId)
            : null;

        const sourceType =
          src.sourceType === 'originating' ||
          src.sourceType === 'processing' ||
          src.sourceType === 'virtual'
            ? src.sourceType
            : inferSourceType(name);

        return {
          id,
          name,
          ...(typeof src.alias === 'string' && src.alias.trim().length > 0
            ? { alias: src.alias.trim() }
            : {}),
          normalizedName:
            typeof src.normalizedName === 'string' ? src.normalizedName : name.toUpperCase().trim(),
          category: (typeof src.category === 'string' ? src.category : 'Other') as SourceCategory,
          active: src.active !== false,
          upstreamSourceId,
          sourceType,
        };
      });
    };

    const snapshotObj =
      cloned.snapshot && typeof cloned.snapshot === 'object'
        ? (cloned.snapshot as Record<string, unknown>)
        : null;
    const dataObj =
      cloned.data && typeof cloned.data === 'object'
        ? (cloned.data as Record<string, unknown>)
        : null;

    // 1. Top-level sources (standard PersistedTrackerData)
    if (Array.isArray(cloned.sources)) {
      cloned.sources = migrateSourceList(cloned.sources);
    } else if (snapshotObj && Array.isArray(snapshotObj.sources)) {
      cloned.sources = migrateSourceList(snapshotObj.sources);
    } else if (dataObj && Array.isArray(dataObj.sources)) {
      cloned.sources = migrateSourceList(dataObj.sources);
    } else {
      cloned.sources = [];
    }

    // 2. Also migrate nested snapshot/data sources if present
    if (snapshotObj && Array.isArray(snapshotObj.sources)) {
      snapshotObj.sources = migrateSourceList(snapshotObj.sources);
    }
    if (dataObj && Array.isArray(dataObj.sources)) {
      dataObj.sources = migrateSourceList(dataObj.sources);
    }

    if (!Array.isArray(cloned.outputs)) {
      if (snapshotObj && Array.isArray(snapshotObj.outputs)) {
        cloned.outputs = snapshotObj.outputs as MultiviewOutput[];
      } else {
        cloned.outputs = [];
      }
    }

    if (!Array.isArray(cloned.destinations)) {
      if (snapshotObj && Array.isArray(snapshotObj.destinations)) {
        cloned.destinations = snapshotObj.destinations as Destination[];
      } else {
        cloned.destinations = [];
      }
    }

    if (!Array.isArray(cloned.operationalAssignments)) {
      cloned.operationalAssignments = [];
    }

    if (!Array.isArray(cloned.changeRecords)) {
      cloned.changeRecords = [];
    }

    cloned.schemaVersion = TRACKER_SCHEMA_VERSION;
    if (!cloned.savedAt) {
      cloned.savedAt = new Date().toISOString();
    }

    if (isValidPersistedTrackerData(cloned)) {
      return cloned;
    }

    return null;
  } catch (err) {
    console.error('Error migrating VIP Tracker V1 storage to V2:', err);
    return null;
  }
}

/**
 * Standard browser localStorage implementation with non-destructive migration and graceful fallback.
 */
export class BrowserLocalStorage implements TrackerStorage {
  private key: string;

  constructor(key: string = TRACKER_STORAGE_KEY) {
    this.key = key;
  }

  load(): PersistedTrackerData | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error('Failed to parse VIP Tracker data from local storage: malformed JSON.');
        // Never clear or overwrite original stored payload on error
        return null;
      }

      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const record = parsed as Record<string, unknown>;

      // Current schema version: validate and load without modification
      if (record.schemaVersion === TRACKER_SCHEMA_VERSION) {
        if (isValidPersistedTrackerData(record)) {
          return record;
        }
        console.warn('VIP Tracker: Stored V2 data failed structural validation.');
        return null;
      }

      // Legacy schema version 1: non-destructive migration
      if (record.schemaVersion === 1) {
        const migrated = migrateV1ToV2(record);
        if (migrated && isValidPersistedTrackerData(migrated)) {
          // Parsing, migration, and current-schema validation all succeeded
          try {
            window.localStorage.setItem(this.key, JSON.stringify(migrated));
          } catch (writeErr) {
            console.warn('Failed to upgrade local storage payload to V2:', writeErr);
          }
          return migrated;
        }

        console.warn(
          'VIP Tracker: Failed to migrate legacy V1 data to V2. Leaving original payload untouched.'
        );
        return null;
      }

      console.warn(
        `VIP Tracker: Unsupported schema version (${record.schemaVersion}). Leaving storage untouched.`
      );
      return null;
    } catch (err) {
      console.error('Failed to load VIP Tracker data from local storage:', err);
      return null;
    }
  }

  save(data: PersistedTrackerData): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }
      window.localStorage.setItem(this.key, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save VIP Tracker data to local storage:', err);
    }
  }

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(this.key);
      }
    } catch (err) {
      console.error('Failed to clear VIP Tracker local storage:', err);
    }
  }
}

/**
 * In-memory storage with non-destructive migration for unit tests or headless environments.
 */
export class MemoryTrackerStorage implements TrackerStorage {
  private data: unknown | null = null;

  load(): PersistedTrackerData | null {
    if (!this.data) return null;
    const cloned = JSON.parse(JSON.stringify(this.data));
    if (typeof cloned !== 'object' || cloned === null) return null;

    if (cloned.schemaVersion === TRACKER_SCHEMA_VERSION) {
      return isValidPersistedTrackerData(cloned) ? (cloned as PersistedTrackerData) : null;
    }

    if (cloned.schemaVersion === 1) {
      const migrated = migrateV1ToV2(cloned);
      if (migrated && isValidPersistedTrackerData(migrated)) {
        this.data = JSON.parse(JSON.stringify(migrated));
        return migrated;
      }
      return null;
    }

    return null;
  }

  save(data: PersistedTrackerData): void {
    this.data = JSON.parse(JSON.stringify(data));
  }

  clear(): void {
    this.data = null;
  }

  seedRaw(raw: unknown): void {
    this.data = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
  }

  getRaw(): unknown {
    return this.data;
  }
}

export const defaultStorage: TrackerStorage = new BrowserLocalStorage();
