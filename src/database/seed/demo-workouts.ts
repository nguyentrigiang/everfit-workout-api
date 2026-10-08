/**
 * Deterministic workout history for demo and performance data. Pure: no DB, no clock.
 * The same seed always produces the same entries, so EXPLAIN results are reproducible.
 */

export type Rng = () => number;

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, to derive a per-user seed so skipping one user does not change the others. */
export function hashSeed(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

export interface DemoSet {
  reps: number;
  weight: number;
  unit: 'kg' | 'lb';
}

export interface DemoEntry {
  exerciseId: string;
  performedAt: Date;
  localDate: string;
  utcOffsetMinutes: number;
  sets: DemoSet[];
}

export interface GenerateOptions {
  entryCount: number;
  /** Days of history ending at endDate; denser users get several sessions per day. */
  spanDays: number;
  exerciseIds: string[];
  /** Last local calendar day (YYYY-MM-DD) that may contain workouts. */
  endDate: string;
  utcOffsetMinutes: number;
  rng: Rng;
}

const AVG_ENTRIES_PER_SESSION = 4.5;
const MINUTES_BETWEEN_EXERCISES = 15;
const FIRST_SESSION_MINUTE = 5 * 60;
const LAST_SESSION_MINUTE = 21 * 60;
/** Keeps each session's window (16h / sessions) longer than a 6-exercise session. */
const MAX_SESSIONS_PER_DAY = 10;
const LB_PER_KG = 2.20462;
const DAY_MS = 86_400_000;

const int = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const roundTo = (value: number, step: number) =>
  Math.round(value / step) * step;

export function generateUserWorkouts(options: GenerateOptions): DemoEntry[] {
  const { entryCount, spanDays, exerciseIds, rng, utcOffsetMinutes } = options;
  if (exerciseIds.length === 0 || entryCount <= 0 || spanDays <= 0) {
    // An empty exercise list would never produce an entry (endless loop).
    throw new Error('Need at least one exercise, entry and day');
  }
  // Per-exercise starting weight in kg; ~15% of exercises are bodyweight (weight 0).
  const baseKg = new Map(
    exerciseIds.map((id) => [id, rng() < 0.15 ? 0 : int(rng, 10, 140)]),
  );
  const sessionsPerDay = entryCount / (AVG_ENTRIES_PER_SESSION * spanDays);
  if (sessionsPerDay > MAX_SESSIONS_PER_DAY) {
    // Sessions would overlap, and the same exercise could repeat at the same instant.
    throw new Error(
      `${entryCount} entries over ${spanDays} days is too dense; increase spanDays`,
    );
  }
  const endDay = Date.parse(`${options.endDate}T00:00:00Z`);

  const entries: DemoEntry[] = [];
  for (let day = 0; entries.length < entryCount; day++) {
    const dayMs = endDay - day * DAY_MS;
    const localDate = new Date(dayMs).toISOString().slice(0, 10);
    // Older days are lighter: weights grow towards endDate.
    const progress = Math.max(0, 1 - day / spanDays);
    const sessions =
      Math.floor(sessionsPerDay) + (rng() < sessionsPerDay % 1 ? 1 : 0);
    const window = (LAST_SESSION_MINUTE - FIRST_SESSION_MINUTE) / sessions;

    for (let s = 0; s < sessions && entries.length < entryCount; s++) {
      const start = FIRST_SESSION_MINUTE + Math.floor(s * window);
      const exercises = pick(rng, exerciseIds, int(rng, 3, 6));
      const unit = rng() < 0.2 ? 'lb' : 'kg';

      exercises.forEach((exerciseId, i) => {
        if (entries.length >= entryCount) return;
        const localMinute = start + i * MINUTES_BETWEEN_EXERCISES;
        const performedAt = new Date(
          dayMs + (localMinute - utcOffsetMinutes) * 60_000,
        );
        const workingKg =
          baseKg.get(exerciseId)! *
          (0.75 + 0.35 * progress) *
          (0.95 + rng() * 0.1);
        const sets = Array.from({ length: int(rng, 2, 5) }, (_, setIndex) => {
          const kg = workingKg * (1 - setIndex * 0.03);
          const weight =
            unit === 'kg' ? roundTo(kg, 2.5) : roundTo(kg * LB_PER_KG, 5);
          return { reps: int(rng, 3, 15), weight, unit } as DemoSet;
        });
        entries.push({
          exerciseId,
          performedAt,
          localDate,
          utcOffsetMinutes,
          sets,
        });
      });
    }
  }
  return entries;
}

/** Picks `count` distinct items (partial Fisher-Yates). */
function pick<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const copy = [...items];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
