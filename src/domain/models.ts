import {
  MultiviewId,
  OutputId,
  DestinationId,
  SourceId,
  AssignmentId,
  PipId,
  EntityType,
} from './identifiers';
import { SourceCategory } from './sourceCategories';
import { LayoutDefinition } from './layoutDefinitions';

export type OutputStatus = 'Available' | 'Assigned' | 'Reserved';
export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationCode =
  | 'UNKNOWN_MULTIVIEW'
  | 'OUTPUT_NUMBER_OUT_OF_CAPACITY'
  | 'DESTINATION_NUMBER_OUT_OF_CAPACITY'
  | 'DESTINATION_START_GREATER_THAN_END'
  | 'DESTINATION_CAPACITY_EXCEEDED'
  | 'OVERLAPPING_OUTPUT_RANGES'
  | 'LAYOUT_WITHOUT_RANGE'
  | 'RANGE_WITHOUT_LAYOUT'
  | 'ASSIGNMENT_WITHOUT_LAYOUT_OR_RANGE'
  | 'DESTINATION_UNKNOWN_SOURCE'
  | 'LOCKED_ASSIGNMENT_INCOMPLETE_TRACKING'
  | 'BOX_COUNT_RANGE_MISMATCH'
  | 'NAMING_INCONSISTENCY'
  | 'SOURCE_SELF_ROUTING'
  | 'SOURCE_UNKNOWN_UPSTREAM'
  | 'SOURCE_CIRCULAR_ROUTING'
  | 'PIP_UNKNOWN_DESTINATION'
  | 'PIP_DUPLICATE_DESTINATION';

export interface Multiview {
  id: MultiviewId;
  displayName: string;
  inputCapacity: number;
  outputCapacity: number;
}

export interface MultiviewOutput {
  id: OutputId;
  multiviewId: MultiviewId;
  outputNumber: number;
  layoutName: string | null;
  destinationStart: number | null;
  destinationEnd: number | null;
  rawDestinationRange?: string | null;
  assignmentName: string | null;
  notes: string | null;
  status: OutputStatus;
  locked: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  operatorId?: string | null;
  pipAssignments?: Record<PipId, DestinationId | null>;
}

export interface Destination {
  id: DestinationId;
  multiviewId: MultiviewId;
  destinationNumber: number;
  assignedSourceId: SourceId | null;
  lawoSourceName?: string | null;
  assignmentName: string | null;
  locked: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  operatorId?: string | null;
}

export type SourceType = 'originating' | 'processing' | 'virtual';

export const LAWO_DEVICE_TYPES = [
  'BSP',
  'Cam',
  'Caption',
  'Color Corrector',
  'Decap/Encap',
  'Decode/Encode',
  'FS',
  'GFX',
  'IPTV',
  'Mon',
  'Multiview',
  'QC',
  'Swr',
  'Transcode',
  'UDX',
] as const;

export type LawoDeviceType = (typeof LAWO_DEVICE_TYPES)[number];

export const LAWO_VENDORS = [
  'AI-Media',
  'AJA',
  'Appear',
  'AWS',
  'Blackmagic Design',
  'CueScript',
  'Evertz',
  'Gnural',
  'Haivision',
  'Lawo',
  'LiveU',
  'Magewell',
  'QuickLink',
  'Ross',
  'Sony',
] as const;

export type LawoVendor = (typeof LAWO_VENDORS)[number];

export type RouterSystem = 'Lawo' | 'Evertz' | 'Both';

export type RouteRole = 'lawo_source' | 'processing' | 'tieline' | 'evertz_source';

export interface Source {
  id: SourceId;
  name: string;
  alias?: string | null;
  normalizedName: string;
  category: SourceCategory;
  active: boolean;
  upstreamSourceId: SourceId | null;
  sourceType: SourceType;
  deviceType?: LawoDeviceType | null;
  vendor?: LawoVendor | null;
  router?: RouterSystem | null;
  routeRole?: RouteRole | null;
  inputLabel?: string | null;
  outputLabel?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  operatorId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SignalFlowLock {
  flowKey: string; // e.g. "OUT:MV-03-01:PIP-01"
  outputId: OutputId;
  pipId: PipId;
  locked: boolean;
  lockedBy: string | null;
  operatorId?: string | null;
  lockedAt: string | null;
  availableAt?: string | null;
  context?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

/**
 * Returns the trimmed non-empty alias for a source, or null if absent/blank.
 */
export function getSourceAlias(
  source: { alias?: string | null } | null | undefined
): string | null {
  if (!source || typeof source.alias !== 'string') return null;
  const trimmed = source.alias.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Formats a source name and optional alias for compact UI surfaces:
 * - With alias: "ENC-115-R22-SDI-1 (Haivision 1)"
 * - Without alias: "ENC-115-R22-SDI-1"
 */
export function formatSourceNameWithAlias(
  name: string | null | undefined,
  alias?: string | null
): string {
  if (!name) return '';
  const cleanAlias = typeof alias === 'string' && alias.trim().length > 0 ? alias.trim() : null;
  return cleanAlias ? `${name} (${cleanAlias})` : name;
}

/**
 * Formats a Source record for compact UI surfaces (dropdowns, selectors, inline chains).
 */
export function formatSourceCompact(
  source: { name: string; alias?: string | null } | null | undefined
): string {
  if (!source) return '';
  return formatSourceNameWithAlias(source.name, source.alias);
}

export interface OperationalAssignment {
  id: AssignmentId;
  rawName: string;
  displayName: string;
  active: boolean;
}

export interface ChangeRecord {
  id: string;
  entityType: EntityType;
  entityId: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
}

export type HistoryEntityType =
  'Output/MV' | 'Layout Assignment' | 'Production Assignment' | 'Source/Destination State';

export type HistoryAction = 'created' | 'updated' | 'cleared';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  operator: string;
  entityType: HistoryEntityType;
  entityId: string;
  action: HistoryAction;
  summary: string;
}

export interface FieldChange {
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  description: string;
}

export interface ChangeSet {
  id: string;
  timestamp: string;
  summary: string;
  changes: FieldChange[];
}

export interface ValidationFinding {
  id: string;
  severity: ValidationSeverity;
  code: ValidationCode;
  message: string;
  entityType: EntityType;
  entityId: string;
  relatedEntityIds: string[];
}

export interface TrackerSnapshotMetadata {
  schemaVersion: number;
  sourceWorkbook: string;
  sourceWorkbookHash: string;
  generatorVersion: string;
  deterministicGeneration?: boolean;
}

export interface TrackerSnapshot {
  metadata?: TrackerSnapshotMetadata;
  multiviews: Multiview[];
  outputs: MultiviewOutput[];
  destinations: Destination[];
  sources: Source[];
  operationalAssignments: OperationalAssignment[];
  changeRecords: ChangeRecord[];
  validationFindings: ValidationFinding[];
  generatedAt: string;
  customLayouts?: LayoutDefinition[];
  history?: HistoryEntry[];
  signalFlowLocks?: Record<string, SignalFlowLock>;
}
