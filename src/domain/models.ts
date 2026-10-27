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
  assignmentName: string | null;
  notes: string | null;
  status: OutputStatus;
  locked: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  pipAssignments?: Record<PipId, DestinationId | null>;
}

export interface Destination {
  id: DestinationId;
  multiviewId: MultiviewId;
  destinationNumber: number;
  assignedSourceId: SourceId | null;
  assignmentName: string | null;
  locked: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type SourceType = 'originating' | 'processing' | 'virtual';

export interface Source {
  id: SourceId;
  name: string;
  normalizedName: string;
  category: SourceCategory;
  active: boolean;
  upstreamSourceId: SourceId | null;
  sourceType: SourceType;
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

export interface TrackerSnapshot {
  multiviews: Multiview[];
  outputs: MultiviewOutput[];
  destinations: Destination[];
  sources: Source[];
  operationalAssignments: OperationalAssignment[];
  changeRecords: ChangeRecord[];
  validationFindings: ValidationFinding[];
  generatedAt: string;
  customLayouts?: LayoutDefinition[];
}
