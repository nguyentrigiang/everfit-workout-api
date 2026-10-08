import { UnitConverter } from './unit-converter.js';
import { DEFAULT_UNIT_REGISTRY, isWeightUnit } from './unit-registry.js';

describe('UnitConverter', () => {
  const converter = new UnitConverter(DEFAULT_UNIT_REGISTRY);

  it('keeps kg values unchanged', () => {
    expect(converter.toKg('82.5', 'kg').toString()).toBe('82.5');
  });

  it('converts lb to kg exactly', () => {
    expect(converter.toKg(135, 'lb').toString()).toBe('61.23496995');
  });

  it('converts kg to lb', () => {
    expect(converter.fromKg(100, 'lb').toDecimalPlaces(6).toString()).toBe(
      '220.462262',
    );
  });

  it('round-trips lb → kg → lb', () => {
    const kg = converter.toKg('187.5', 'lb');

    expect(converter.fromKg(kg, 'lb').toDecimalPlaces(6).toString()).toBe(
      '187.5',
    );
  });

  it('throws for a unit that is not in the registry', () => {
    expect(() => converter.toKg(10, 'oz')).toThrow(
      'Unsupported weight unit: oz',
    );
  });

  it('supports a new unit by adding one registry entry (no code change)', () => {
    const withStone = new UnitConverter({
      ...DEFAULT_UNIT_REGISTRY,
      stone: '6.35029318',
    });

    expect(withStone.toKg(1, 'stone').toString()).toBe('6.35029318');
    expect(withStone.fromKg(withStone.toKg(14, 'lb'), 'stone').toString()).toBe(
      '1',
    );
  });
});

describe('isWeightUnit', () => {
  it('accepts supported units and rejects others', () => {
    expect(isWeightUnit('kg')).toBe(true);
    expect(isWeightUnit('lb')).toBe(true);
    expect(isWeightUnit('KG')).toBe(false);
    expect(isWeightUnit('toString')).toBe(false);
  });
});
