import { Decimal } from 'decimal.js';
import type { UnitRegistry } from './unit-registry.js';

/**
 * Converts weights between units via kg, using exact decimal arithmetic.
 * The app always uses DEFAULT_UNIT_REGISTRY (see WorkoutModule), the same source as
 * request validation; the constructor argument exists so tests can pass another registry.
 */
export class UnitConverter {
  constructor(private readonly registry: UnitRegistry) {}

  toKg(value: Decimal.Value, unit: string): Decimal {
    return new Decimal(value).times(this.factor(unit));
  }

  fromKg(kg: Decimal.Value, unit: string): Decimal {
    return new Decimal(kg).div(this.factor(unit));
  }

  private factor(unit: string): string {
    // Inputs are validated against the registry at the API boundary, so this is a bug.
    if (!Object.hasOwn(this.registry, unit)) {
      throw new Error(`Unsupported weight unit: ${unit}`);
    }
    return this.registry[unit];
  }
}
