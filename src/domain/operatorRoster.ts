/**
 * Single source of truth for predefined operator roster in VIP Tracker.
 * Pure TypeScript — no React or DOM dependencies.
 *
 * Editing this file is the only step required to add, remove, or reorder roster members.
 */

import { Operator } from './operator';

/**
 * Derives a stable, deterministic Operator ID from a display name without random suffixes.
 * E.g., "Zach Z" -> "op_zach_z", "J J" -> "op_j_j", "Alex S" -> "op_alex_s".
 */
export function createRosterOperatorId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `op_${slug}`;
}

const ROSTER_NAMES = [
  'Alex S',
  'Barry A',
  'Bob S',
  'Chris P',
  'Faith L',
  'Greg P',
  'J J',
  'James A',
  'John V',
  'Jorge M',
  'Julia B',
  'Khirlu B',
  'Maddie P',
  'Marcus L',
  'Mark S',
  'Mark V',
  'Matt O',
  'Mike D',
  'Nathan C',
  'Prab G',
  'Rob G',
  'Robin O',
  'Ryan H',
  'Sarah R',
  'Ty Y',
  'Zach Z',
] as const;

export const OPERATOR_ROSTER: readonly Operator[] = Object.freeze(
  ROSTER_NAMES.map((displayName) =>
    Object.freeze({
      id: createRosterOperatorId(displayName),
      displayName,
    })
  )
);

const ROSTER_ID_SET = new Set<string>(OPERATOR_ROSTER.map((op) => op.id));

/**
 * Checks whether an operator ID belongs to the predefined roster.
 */
export function isRosterOperatorId(id: string | null | undefined): boolean {
  if (!id) return false;
  return ROSTER_ID_SET.has(id);
}

/**
 * Finds a roster operator by stable ID.
 */
export function findRosterOperatorById(id: string | null | undefined): Operator | undefined {
  if (!id) return undefined;
  return OPERATOR_ROSTER.find((op) => op.id === id);
}

/**
 * Finds a roster operator by display name (case-insensitive trim match).
 */
export function findRosterOperatorByName(name: string | null | undefined): Operator | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  return OPERATOR_ROSTER.find((op) => op.displayName.toLowerCase() === normalized);
}
