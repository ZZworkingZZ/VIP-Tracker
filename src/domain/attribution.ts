import { MultiviewOutput, ChangeRecord } from './models';

/**
 * Structured change attribution metadata for VIP Tracker entities.
 * Decoupled from presentation strings.
 */
export interface ChangeAttribution {
  readonly operatorId: string | null;
  readonly operatorName: string | null;
  readonly timestamp: string;
}

/**
 * Selects the most recent persisted change attribution for an MV Output.
 * Returns null if the output predates attribution tracking or has never been changed.
 * Zero data fabrication: never invents an attribution.
 */
export function selectOutputLastChanged(
  output: MultiviewOutput,
  changeRecords?: readonly ChangeRecord[]
): ChangeAttribution | null {
  // 1. Direct attribution on the output entity
  if (output.updatedAt && (output.updatedBy || output.operatorId)) {
    return {
      operatorId: output.operatorId ?? null,
      operatorName: output.updatedBy ?? null,
      timestamp: output.updatedAt,
    };
  }

  // 2. Fallback: inspect historical ChangeRecords for this output (newest first)
  if (changeRecords && changeRecords.length > 0) {
    for (let i = changeRecords.length - 1; i >= 0; i--) {
      const rec = changeRecords[i];
      if (rec.entityType === 'output' && rec.entityId === output.id && rec.changedAt) {
        if (rec.operatorName || rec.operatorId || rec.changedBy) {
          return {
            operatorId: rec.operatorId ?? null,
            operatorName: rec.operatorName ?? rec.changedBy ?? null,
            timestamp: rec.changedAt,
          };
        }
      }
    }
  }

  return null;
}

export interface FormatLastChangedOptions {
  readonly now?: Date;
  readonly includePrefix?: boolean;
}

/**
 * Formats a ChangeAttribution record for human display.
 * Uses the browser/local application date and time conventions.
 *
 * For changes made today: "6:01 PM by Zach"
 * For changes made on earlier dates: "Oct 26, 6:01 PM by Zach"
 * For null/unrecorded attribution: "Not recorded"
 */
export function formatLastChanged(
  attribution: ChangeAttribution | null | undefined,
  options?: FormatLastChangedOptions
): string {
  if (
    !attribution ||
    !attribution.timestamp ||
    (!attribution.operatorName && !attribution.operatorId)
  ) {
    return options?.includePrefix ? 'Last Changed: Not recorded' : 'Not recorded';
  }

  const date = new Date(attribution.timestamp);
  if (isNaN(date.getTime())) {
    return options?.includePrefix ? 'Last Changed: Not recorded' : 'Not recorded';
  }

  const now = options?.now ?? new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const isSameYear = date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const operator = attribution.operatorName || attribution.operatorId || 'Unknown Operator';

  let presentation: string;
  if (isToday) {
    presentation = `${timeStr} by ${operator}`;
  } else {
    const dateStr = date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: isSameYear ? undefined : 'numeric',
    });
    presentation = `${dateStr}, ${timeStr} by ${operator}`;
  }

  return options?.includePrefix ? `Last Changed: ${presentation}` : presentation;
}
