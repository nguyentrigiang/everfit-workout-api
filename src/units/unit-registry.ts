/**
 * Factor to convert one unit into kilograms. Strings keep decimal.js exact.
 * Adding a unit (e.g. `stone: '6.35029318'`) is the only change needed:
 * validation (SUPPORTED_UNITS) and conversion both read from this registry.
 */
export const DEFAULT_UNIT_REGISTRY = {
  kg: '1',
  lb: '0.45359237', // exact international avoirdupois pound
} as const;

export type UnitRegistry = Readonly<Record<string, string>>;
export type WeightUnit = keyof typeof DEFAULT_UNIT_REGISTRY;

export const SUPPORTED_UNITS = Object.keys(
  DEFAULT_UNIT_REGISTRY,
) as WeightUnit[];

export function isWeightUnit(value: string): value is WeightUnit {
  return Object.hasOwn(DEFAULT_UNIT_REGISTRY, value);
}
