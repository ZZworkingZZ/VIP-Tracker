/**
 * Explicit identifier definitions and utilities for VIP Tracker.
 * Distinguishes between Multiview, Output, Destination, Source, and Operational Assignment entities.
 */

export type MultiviewId = 'MV-01' | 'MV-02' | 'MV-03' | 'MV-04' | 'MV-05';

export type OutputId = `OUT:${MultiviewId}-${string}`;
export type DestinationId = `DEST:${MultiviewId}-${string}`;
export type SourceId = `SRC:${string}`;
export type AssignmentId = `ASSIGN:${string}`;

export type EntityType = 'multiview' | 'output' | 'destination' | 'source' | 'assignment';

/**
 * Creates a deterministic, explicit Output ID.
 * Example: createOutputId('MV-04', 2) -> 'OUT:MV-04-02'
 */
export function createOutputId(multiviewId: MultiviewId, outputNumber: number): OutputId {
  const padded = String(outputNumber).padStart(2, '0');
  return `OUT:${multiviewId}-${padded}` as OutputId;
}

/**
 * Creates a deterministic, explicit Destination ID.
 * Example: createDestinationId('MV-04', 37) -> 'DEST:MV-04-37'
 */
export function createDestinationId(
  multiviewId: MultiviewId,
  destinationNumber: number
): DestinationId {
  const padded = String(destinationNumber).padStart(2, '0');
  return `DEST:${multiviewId}-${padded}` as DestinationId;
}

/**
 * Creates a deterministic Source ID from raw source name.
 */
export function createSourceId(rawSourceName: string): SourceId {
  const slug = rawSourceName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_');
  return `SRC:${slug}` as SourceId;
}

/**
 * Creates a deterministic Operational Assignment ID from raw assignment name.
 */
export function createAssignmentId(rawAssignmentName: string): AssignmentId {
  const slug = rawAssignmentName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_');
  return `ASSIGN:${slug}` as AssignmentId;
}

/**
 * Formats an Output ID for human display.
 * Example: 'OUT:MV-04-02' -> 'MV-04-02'
 */
export function formatOutputDisplay(outputId: OutputId): string {
  return outputId.replace(/^OUT:/, '');
}

/**
 * Formats a Destination ID for human display.
 * Example: 'DEST:MV-04-37' -> 'MV-04-37'
 */
export function formatDestinationDisplay(destinationId: DestinationId): string {
  return destinationId.replace(/^DEST:/, '');
}
