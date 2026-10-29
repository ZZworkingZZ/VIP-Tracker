import { Source, LawoDeviceType, LawoVendor, RouterSystem, RouteRole } from '../../domain/models';
import { createSourceId } from '../../domain/identifiers';
import { classifySourceCategory, SourceCategory } from '../../domain/sourceCategories';

export interface CreateDirectorySourceOptions {
  id?: string;
  name: string;
  alias?: string | null;
  category?: SourceCategory;
  deviceType?: LawoDeviceType | null;
  vendor?: LawoVendor | null;
  router?: RouterSystem | null;
  routeRole: RouteRole;
  upstreamSourceId?: string | null;
  inputLabel?: string | null;
  outputLabel?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Creates a normalized directory Source record for Lawo sources, Lawo processing devices,
 * or Lawo-to-Evertz tielines with a stable ID and explicit role metadata.
 */
export function createDirectorySource(options: CreateDirectorySourceOptions): Source {
  const id = (
    options.id && options.id.startsWith('SRC:') ? options.id : createSourceId(options.name)
  ) as Source['id'];

  const sourceType =
    options.routeRole === 'processing'
      ? 'processing'
      : options.routeRole === 'tieline'
        ? 'virtual'
        : 'originating';

  return {
    id,
    name: options.name,
    ...(options.alias ? { alias: options.alias } : {}),
    normalizedName: options.name.toUpperCase().trim(),
    category: options.category ?? classifySourceCategory(options.name),
    active: true,
    upstreamSourceId: (options.upstreamSourceId as Source['id']) ?? null,
    sourceType,
    deviceType: options.deviceType ?? null,
    vendor: options.vendor ?? null,
    router: options.router ?? (options.routeRole === 'evertz_source' ? 'Evertz' : 'Lawo'),
    routeRole: options.routeRole,
    ...(options.inputLabel ? { inputLabel: options.inputLabel } : {}),
    ...(options.outputLabel ? { outputLabel: options.outputLabel } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

/**
 * Authoritative ingestion placeholder for Lawo routable originating sources.
 * Per Zero Data Fabrication policy, no fictional Lawo sources are populated here.
 * Populate this array or ingest via VIP-Tracker-Data when authoritative Lawo source exports are provided.
 */
export const SEED_LAWO_SOURCES: readonly Source[] = [];

/**
 * Authoritative ingestion placeholder for Lawo processing devices (UDX, FS, Color Corrector, etc.).
 * Per Zero Data Fabrication policy, no fictional processing devices are populated here.
 */
export const SEED_LAWO_PROCESSING_DEVICES: readonly Source[] = [];
