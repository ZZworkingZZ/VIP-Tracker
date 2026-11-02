import { Source, getSourceAlias } from './models';

/**
 * Normalizes a string for search matching by lowercasing and stripping all separator characters
 * (spaces, hyphens, underscores, dots, slashes, colons, commas, semicolons).
 * Enables "vcam31", "vcam 31", and "vCam-31" to all match "vCam 31".
 */
export function normalizeSourceSearch(text: string): string {
  return text.toLowerCase().replace(/[\s\-_/\\.:,;]+/g, '');
}

/**
 * Determines whether a source matches a search query case-insensitively and regardless of separators.
 * Matches against both source.name and source.alias.
 */
export function matchesSourceQuery(source: Source, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qNorm = normalizeSourceSearch(q);

  const name = source.name.toLowerCase();
  const nameNorm = normalizeSourceSearch(source.name);
  if (name.includes(q) || (qNorm && nameNorm.includes(qNorm))) return true;

  const alias = getSourceAlias(source)?.toLowerCase();
  if (alias) {
    const aliasNorm = normalizeSourceSearch(alias);
    if (alias.includes(q) || (qNorm && aliasNorm.includes(qNorm))) return true;
  }

  return false;
}
