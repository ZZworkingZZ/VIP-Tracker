import {
  MultiviewOutput,
  Destination,
  Source,
  OperationalAssignment,
  ChangeRecord,
} from '../domain/models';

export const TRACKER_STORAGE_KEY = 'vip_tracker_data_v1';
export const TRACKER_SCHEMA_VERSION = 1;

export interface PersistedTrackerData {
  schemaVersion: number;
  outputs: MultiviewOutput[];
  destinations: Destination[];
  sources: Source[];
  operationalAssignments: OperationalAssignment[];
  changeRecords: ChangeRecord[];
  savedAt: string;
}

export interface TrackerStorage {
  load(): PersistedTrackerData | null;
  save(data: PersistedTrackerData): void;
  clear(): void;
}

/**
 * Standard browser localStorage implementation with version checking and graceful fallback.
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

      const parsed = JSON.parse(raw) as PersistedTrackerData;
      if (parsed.schemaVersion !== TRACKER_SCHEMA_VERSION) {
        console.warn(
          `VIP Tracker: Schema version mismatch (stored: ${parsed.schemaVersion}, current: ${TRACKER_SCHEMA_VERSION}). Discarding legacy data.`
        );
        this.clear();
        return null;
      }

      if (!Array.isArray(parsed.outputs) || !Array.isArray(parsed.destinations)) {
        return null;
      }

      return parsed;
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
 * In-memory storage for unit tests or headless environments.
 */
export class MemoryTrackerStorage implements TrackerStorage {
  private data: PersistedTrackerData | null = null;

  load(): PersistedTrackerData | null {
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  save(data: PersistedTrackerData): void {
    this.data = JSON.parse(JSON.stringify(data));
  }

  clear(): void {
    this.data = null;
  }
}

export const defaultStorage: TrackerStorage = new BrowserLocalStorage();
