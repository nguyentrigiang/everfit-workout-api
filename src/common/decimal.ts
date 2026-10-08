import { Decimal } from 'decimal.js';

/** Rounds (half-up) for API responses; stored values keep full precision. */
export function toApiNumber(value: Decimal.Value, decimals = 2): number {
  return new Decimal(value)
    .toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)
    .toNumber();
}
