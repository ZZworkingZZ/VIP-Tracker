import { MultiviewId, createDestinationId, createSourceId } from '../../domain/identifiers';
import { Destination, Source } from '../../domain/models';
import { VERIFIED_MULTIVIEWS } from '../../domain/constants';
import { classifySourceCategory, inferSourceType } from '../../domain/sourceCategories';

export interface CsvParseResult {
  destinations: Destination[];
  sources: Source[];
  errors: string[];
  totalParsedRows: number;
}

/**
 * Parses the exact structure of reference/Evertz VIP Source Tracker (mockup)(Sources).csv.
 *
 * Structure:
 * Row 1: Header with Multiview IDs (MV-01, MV-02, MV-03, MV-04, MV-05) spaced every 3 columns.
 * Row 2: Subheader (Destination, Source, empty, Destination, Source, empty, ...)
 * Rows 3+: Destination and Source pairs.
 */
export function parseSourcesCsv(csvContent: string): CsvParseResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const errors: string[] = [];
  const destinations: Destination[] = [];
  const sourceMap = new Map<string, Source>();

  if (lines.length < 2) {
    return {
      destinations: [],
      sources: [],
      errors: ['CSV content has fewer than 2 header rows.'],
      totalParsedRows: 0,
    };
  }

  // Multiview capacity lookup
  const capacityMap = new Map<MultiviewId, number>(
    VERIFIED_MULTIVIEWS.map((mv) => [mv.id, mv.inputCapacity])
  );

  const multiviewOrder: MultiviewId[] = ['MV-01', 'MV-02', 'MV-03', 'MV-04', 'MV-05'];

  // Parse data lines (starting at row index 2)
  for (let rowIndex = 2; rowIndex < lines.length; rowIndex++) {
    const rawLine = lines[rowIndex];
    const cells = rawLine.split(',').map((c) => c.trim());

    for (let mvIdx = 0; mvIdx < multiviewOrder.length; mvIdx++) {
      const mvId = multiviewOrder[mvIdx];
      const destCol = mvIdx * 3;
      const srcCol = destCol + 1;

      const destValue = cells[destCol] || '';
      const srcValue = cells[srcCol] || '';

      if (!destValue) {
        continue;
      }

      // Validate destination format: e.g. "MV-01-01" or "MV-03-64"
      const destMatch = destValue.match(/^MV-(\d{2})-(\d{2,3})$/);
      if (!destMatch) {
        errors.push(
          `Row ${rowIndex + 1}, Col ${destCol + 1}: Malformed destination identifier '${destValue}'.`
        );
        continue;
      }

      const parsedMvId = `MV-${destMatch[1]}` as MultiviewId;
      const destNum = parseInt(destMatch[2], 10);

      if (parsedMvId !== mvId) {
        errors.push(
          `Row ${rowIndex + 1}: Column expected ${mvId} but found destination '${destValue}'.`
        );
      }

      const maxCap = capacityMap.get(mvId) ?? 0;
      if (destNum < 1 || destNum > maxCap) {
        errors.push(
          `Row ${rowIndex + 1}: Destination number ${destNum} on ${mvId} exceeds capacity of ${maxCap}.`
        );
      }

      // Process source if present
      let assignedSourceId = null;
      if (srcValue) {
        const sourceId = createSourceId(srcValue);
        assignedSourceId = sourceId;

        if (!sourceMap.has(sourceId)) {
          sourceMap.set(sourceId, {
            id: sourceId,
            name: srcValue, // Preserve exact raw name including spaces and punctuation
            normalizedName: srcValue.toUpperCase().trim(),
            category: classifySourceCategory(srcValue),
            active: true,
            upstreamSourceId: null,
            sourceType: inferSourceType(srcValue),
          });
        }
      }

      const destId = createDestinationId(mvId, destNum);

      destinations.push({
        id: destId,
        multiviewId: mvId,
        destinationNumber: destNum,
        assignedSourceId,
        assignmentName: null,
        locked: false,
        updatedAt: null,
        updatedBy: null,
      });
    }
  }

  return {
    destinations,
    sources: Array.from(sourceMap.values()),
    errors,
    totalParsedRows: lines.length - 2,
  };
}
