import {
  SOURCE_PICKER_TYPES,
  SOURCE_PICKER_TYPE_ORDER,
  type SourcePickerRole,
} from '../data/seed/sourceInventory';

export type { SourcePickerRole };

export const PICKER_UNCATEGORIZED = 'Uncategorized';

/**
 * Returns the workbook Type value for a canonical source ID in the given picker role.
 * Blank, missing, or non-seed (custom) sources resolve to "Uncategorized".
 * Reads the generated seed catalog only; never persisted tracker data.
 */
export function getPickerType(role: SourcePickerRole, sourceId: string): string {
  const raw = SOURCE_PICKER_TYPES[role][sourceId];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : PICKER_UNCATEGORIZED;
}

/** Sheet Type values for a role in order of first appearance in the workbook. */
export function getPickerTypeOrder(role: SourcePickerRole): readonly string[] {
  return SOURCE_PICKER_TYPE_ORDER[role];
}
