import {
  MAX_REPS,
  MAX_SETS_PER_ENTRY,
  MAX_WEIGHT,
} from '../../modules/workout/dto/requests/log-workouts.dto.js';
import {
  createRng,
  type GenerateOptions,
  generateUserWorkouts,
  hashSeed,
} from './demo-workouts.js';

const exerciseIds = Array.from({ length: 12 }, (_, i) => `exercise-${i}`);

const generate = (overrides: Partial<GenerateOptions> = {}) =>
  generateUserWorkouts({
    entryCount: 2000,
    spanDays: 90,
    exerciseIds,
    endDate: '2026-09-30',
    utcOffsetMinutes: 420,
    rng: createRng(hashSeed('test:user')),
    ...overrides,
  });

describe('generateUserWorkouts', () => {
  it('produces the same entries for the same seed', () => {
    expect(generate()).toEqual(generate());
  });

  it('produces different entries for a different seed', () => {
    expect(generate()).not.toEqual(
      generate({ rng: createRng(hashSeed('test:other')) }),
    );
  });

  it('returns exactly the requested number of entries', () => {
    expect(generate({ entryCount: 777 })).toHaveLength(777);
  });

  it('never goes past the end date in local time', () => {
    const entries = generate({ utcOffsetMinutes: -300 });

    expect(entries.every((e) => e.localDate <= '2026-09-30')).toBe(true);
  });

  it.each([420, -300, 0, 330, 570])(
    'derives localDate from performedAt and offset %i',
    (utcOffsetMinutes) => {
      for (const e of generate({ utcOffsetMinutes, entryCount: 300 })) {
        const local = new Date(
          e.performedAt.getTime() + utcOffsetMinutes * 60_000,
        );
        expect(local.toISOString().slice(0, 10)).toBe(e.localDate);
        expect(e.utcOffsetMinutes).toBe(utcOffsetMinutes);
      }
    },
  );

  it('stays within the API validation limits', () => {
    for (const e of generate()) {
      expect(e.sets.length).toBeGreaterThan(0);
      expect(e.sets.length).toBeLessThanOrEqual(MAX_SETS_PER_ENTRY);
      for (const s of e.sets) {
        expect(s.reps).toBeGreaterThanOrEqual(1);
        expect(s.reps).toBeLessThanOrEqual(MAX_REPS);
        expect(s.weight).toBeGreaterThanOrEqual(0);
        expect(s.weight).toBeLessThanOrEqual(MAX_WEIGHT);
        expect(['kg', 'lb']).toContain(s.unit);
      }
    }
  });

  it('never repeats an exercise at the same instant (natural key)', () => {
    const entries = generate({ entryCount: 10_000, spanDays: 365 });
    const keys = new Set(
      entries.map((e) => `${e.exerciseId}|${e.performedAt.getTime()}`),
    );

    expect(keys.size).toBe(entries.length);
  });

  it('rejects an empty exercise list instead of looping forever', () => {
    expect(() => generate({ exerciseIds: [] })).toThrow(
      /at least one exercise/,
    );
  });

  it('rejects a density that would make sessions overlap', () => {
    expect(() => generate({ entryCount: 50_000, spanDays: 30 })).toThrow(
      /too dense/,
    );
  });
});
