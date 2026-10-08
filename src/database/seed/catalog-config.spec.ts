import { readFileSync } from 'node:fs';
import { validateCatalogConfig } from './catalog-config.js';

const valid = {
  muscleGroups: [
    { slug: 'chest', name: 'Chest' },
    { slug: 'triceps', name: 'Triceps' },
  ],
  exercises: [{ name: 'Bench Press', muscleGroups: ['chest', 'triceps'] }],
};

describe('validateCatalogConfig', () => {
  it('accepts a valid config', () => {
    expect(validateCatalogConfig(valid)).toEqual(valid);
  });

  it('accepts the shipped config/exercises.json', () => {
    const raw: unknown = JSON.parse(
      readFileSync('config/exercises.json', 'utf8'),
    );

    expect(() => validateCatalogConfig(raw)).not.toThrow();
  });

  it('rejects an exercise that references an unknown muscle group', () => {
    const config = {
      ...valid,
      exercises: [{ name: 'Bench Press', muscleGroups: ['chets'] }],
    };

    expect(() => validateCatalogConfig(config)).toThrow(/unknown slug "chets"/);
  });

  it('rejects exercise names that are duplicates after normalization', () => {
    const config = {
      ...valid,
      exercises: [
        { name: 'Bench Press', muscleGroups: ['chest'] },
        { name: '  bench   press', muscleGroups: ['chest'] },
      ],
    };

    expect(() => validateCatalogConfig(config)).toThrow(
      /exercises\[1\].*duplicates exercises\[0\]/,
    );
  });

  it('rejects an exercise without muscle groups', () => {
    const config = {
      ...valid,
      exercises: [{ name: 'Plank', muscleGroups: [] }],
    };

    expect(() => validateCatalogConfig(config)).toThrow(
      /muscleGroups must be a non-empty array/,
    );
  });

  it('rejects duplicate or malformed slugs', () => {
    const config = {
      muscleGroups: [
        { slug: 'chest', name: 'Chest' },
        { slug: 'chest', name: 'Chest again' },
        { slug: 'Upper Back', name: 'Upper back' },
      ],
      exercises: [],
    };

    expect(() => validateCatalogConfig(config)).toThrow(
      /"chest" is duplicated.*muscleGroups\[2\]\.slug must match/,
    );
  });

  it('rejects a config whose root is not an object', () => {
    expect(() => validateCatalogConfig([])).toThrow(/root must be an object/);
  });

  it('lists every problem in one error', () => {
    const config = {
      muscleGroups: [{ slug: 'chest', name: '' }],
      exercises: [{ name: '', muscleGroups: ['legs'] }],
    };

    expect(() => validateCatalogConfig(config)).toThrow(
      /muscleGroups\[0\]\.name.*exercises\[0\]\.name.*unknown slug "legs"/,
    );
  });

  it('rejects a muscle group listed twice for one exercise', () => {
    const config = {
      ...valid,
      exercises: [{ name: 'Bench Press', muscleGroups: ['chest', 'chest'] }],
    };

    expect(() => validateCatalogConfig(config)).toThrow(
      /lists "chest" more than once/,
    );
  });
});
