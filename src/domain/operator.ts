/**
 * Pure domain representation of operator identity in VIP Tracker.
 * Operating on a trust-based model for change attribution and operational accountability.
 * Free of authentication-provider dependencies, roles, passwords, or tokens.
 */

import { findRosterOperatorByName } from './operatorRoster';

export type OperatorId = string;

export interface Operator {
  readonly id: OperatorId;
  readonly displayName: string;
}

/**
 * Creates a clean, typed Operator with a lightweight stable ID.
 * Returns the deterministic roster operator if the name matches the roster,
 * generates an ID derived from a slugified name plus an alphanumeric suffix,
 * or accepts an explicitly provided stable ID.
 */
export function createOperator(displayName: string, explicitId?: string): Operator {
  const trimmed = displayName.trim();
  if (explicitId && explicitId.trim().length > 0) {
    return {
      id: explicitId.trim(),
      displayName: trimmed,
    };
  }

  const rosterOp = findRosterOperatorByName(trimmed);
  if (rosterOp) {
    return rosterOp;
  }

  const slug =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'op';

  const suffix = Math.random().toString(36).substring(2, 8);
  return {
    id: `op_${slug}_${suffix}`,
    displayName: trimmed,
  };
}

/**
 * Type guard for Operator structure.
 */
export function isValidOperator(obj: unknown): obj is Operator {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.id.trim().length > 0 &&
    typeof o.displayName === 'string' &&
    o.displayName.trim().length > 0
  );
}

/**
 * Formats an operator's name for display in header and badges.
 */
export function formatOperatorDisplay(operator: Operator | null | undefined): string {
  if (!operator || !operator.displayName.trim()) {
    return 'TECH OPS';
  }
  return operator.displayName.trim();
}
