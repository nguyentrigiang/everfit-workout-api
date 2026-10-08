import { Decimal } from 'decimal.js';

/** Scale of the normalized kg columns in the database. */
export const STORED_DECIMALS = 6;

/**
 * Estimated one-rep max, Epley formula: weight × (1 + reps / 30). Applied to every set.
 * Computed as weight × (30 + reps) / 30 (same value) so the only division happens last;
 * dividing reps / 30 first would round 1/3 and give 79.99… instead of 80 for 60 × 10.
 */
export function estimateOneRepMax(
  weightKg: Decimal.Value,
  reps: number,
): Decimal {
  return new Decimal(weightKg).times(30 + reps).div(30);
}

/** Volume of a single set: reps × weight. */
export function setVolume(weightKg: Decimal.Value, reps: number): Decimal {
  return new Decimal(weightKg).times(reps);
}

export interface SetMetrics {
  weightKg: Decimal;
  volumeKg: Decimal;
  e1rmKg: Decimal;
}

/**
 * Values stored per set. The kg weight is rounded to the DB scale first and the
 * metrics are computed from that rounded value, so all three columns agree.
 */
export function computeSetMetrics(
  weightKg: Decimal.Value,
  reps: number,
): SetMetrics {
  const stored = new Decimal(weightKg).toDecimalPlaces(STORED_DECIMALS);
  return {
    weightKg: stored,
    volumeKg: setVolume(stored, reps).toDecimalPlaces(STORED_DECIMALS),
    e1rmKg: estimateOneRepMax(stored, reps).toDecimalPlaces(STORED_DECIMALS),
  };
}
