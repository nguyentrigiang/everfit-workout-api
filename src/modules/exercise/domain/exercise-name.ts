/**
 * Canonical form used to match exercise names (DB unique key, lookups, partial match):
 * Unicode NFKC (so composed/decomposed accents and non-breaking spaces match),
 * trimmed, lowercased, inner whitespace collapsed to single spaces.
 */
export function normalizeExerciseName(name: string): string {
  return cleanDisplayName(name).toLowerCase();
}

/** Display form: same as the canonical form but keeps the original casing. */
export function cleanDisplayName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}
