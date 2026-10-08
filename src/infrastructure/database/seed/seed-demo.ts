import type { PrismaClient } from '../../../generated/prisma/client.js';
import { normalizeExerciseName } from '../../../modules/exercise/domain/exercise-name.js';
import { PrismaTransactionRunner } from '../prisma/prisma-transaction-runner.js';
import { TransactionRunner } from '../../../shared/database/transaction.js';
import { PrismaWorkoutRepository } from '../../../modules/workout/repositories/prisma-workout.repository.js';
import { UnitConverter } from '../../../modules/workout/domain/units/unit-converter.js';
import { DEFAULT_UNIT_REGISTRY } from '../../../modules/workout/domain/units/unit-registry.js';
import { computeSetMetrics } from '../../../modules/workout/domain/strength-metrics.js';
import {
  type NewSetRow,
  WorkoutRepository,
} from '../../../modules/workout/repositories/workout.repository.js';
import {
  createRng,
  type DemoEntry,
  generateUserWorkouts,
  hashSeed,
} from './demo-workouts.js';

export interface DemoUser {
  userId: string;
  entryCount: number;
  spanDays: number;
  utcOffsetMinutes: number;
}

export interface DemoSeedOptions {
  users: DemoUser[];
  /** Catalog exercises to use; they must already exist (run the catalog seed first). */
  exerciseNames: string[];
  endDate: string;
  seed: string;
  batchSize?: number;
  log?: (message: string) => void;
}

export interface DemoSeedResult {
  /** Users that received new rows in this run. */
  seededUsers: string[];
  /** Users that already had at least their target number of entries. */
  skippedUsers: string[];
  /** Rows actually inserted (entries already present are not counted). */
  entries: number;
  sets: number;
}

/**
 * Inserts generated workout history through the same repository SQL as the API, in
 * batched transactions. Insert-only and resumable: the data is deterministic, so a re-run
 * after a failed batch regenerates the same natural keys, entries already stored are
 * skipped by ON CONFLICT (their sets are not rewritten) and only the missing ones are added.
 */
export async function seedDemoWorkouts(
  prisma: PrismaClient,
  options: DemoSeedOptions,
): Promise<DemoSeedResult> {
  const { batchSize = 2000, log = () => {} } = options;
  const exerciseIds = await resolveExerciseIds(prisma, options.exerciseNames);
  // Standalone script outside Nest DI: build the same instances the app injects
  // (WorkoutModule uses this registry and PrismaModule this transaction runner).
  const units = new UnitConverter(DEFAULT_UNIT_REGISTRY);
  const workouts = new PrismaWorkoutRepository(prisma);
  const transactions = new PrismaTransactionRunner(prisma).withTimeout(60_000);
  const result: DemoSeedResult = {
    seededUsers: [],
    skippedUsers: [],
    entries: 0,
    sets: 0,
  };

  for (const user of options.users) {
    // Fast path for complete users; a partially seeded user is resumed below.
    if ((await countEntries(prisma, user.userId)) >= user.entryCount) {
      result.skippedUsers.push(user.userId);
      log(`${user.userId}: already seeded, skipped`);
      continue;
    }
    const entries = generateUserWorkouts({
      ...user,
      exerciseIds,
      endDate: options.endDate,
      rng: createRng(hashSeed(`${options.seed}:${user.userId}`)),
    });

    let created = 0;
    let sets = 0;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = await insertBatch(
        transactions,
        workouts,
        units,
        user.userId,
        entries.slice(i, i + batchSize),
      );
      created += batch.entries;
      sets += batch.sets;
    }
    result.seededUsers.push(user.userId);
    result.entries += created;
    result.sets += sets;
    const existing = entries.length - created;
    log(
      `${user.userId}: ${created} entries, ${sets} sets inserted` +
        (existing > 0 ? ` (${existing} already present)` : ''),
    );
  }
  return result;
}

async function insertBatch(
  transactions: TransactionRunner,
  workouts: WorkoutRepository,
  units: UnitConverter,
  userId: string,
  batch: DemoEntry[],
): Promise<{ entries: number; sets: number }> {
  const key = (exerciseId: string, performedAt: Date) =>
    `${exerciseId}|${performedAt.getTime()}`;

  return transactions.run(async (tx) => {
    const created = await workouts.insertEntries(userId, batch, tx);
    const idByKey = new Map(
      created.map((r) => [key(r.exerciseId, r.performedAt), r.id]),
    );
    const sets: NewSetRow[] = batch.flatMap((entry) => {
      const entryId = idByKey.get(key(entry.exerciseId, entry.performedAt));
      if (!entryId) return [];
      return entry.sets.map((set, setIndex) => {
        const metrics = computeSetMetrics(
          units.toKg(set.weight, set.unit),
          set.reps,
        );
        return {
          entryId,
          setIndex,
          reps: set.reps,
          weight: String(set.weight),
          unit: set.unit,
          weightKg: metrics.weightKg.toFixed(),
          volumeKg: metrics.volumeKg.toFixed(),
          e1rmKg: metrics.e1rmKg.toFixed(),
        };
      });
    });
    await workouts.insertSets(sets, tx);
    return { entries: created.length, sets: sets.length };
  });
}

async function resolveExerciseIds(
  prisma: PrismaClient,
  names: string[],
): Promise<string[]> {
  const keys = names.map(normalizeExerciseName);
  const rows = await prisma.$queryRaw<
    { id: string; name_normalized: string }[]
  >`
    SELECT id, name_normalized FROM exercises WHERE name_normalized = ANY(${keys}::text[])`;
  const idByKey = new Map(rows.map((r) => [r.name_normalized, r.id]));
  const missing = keys.filter((k) => !idByKey.has(k));
  if (missing.length > 0) {
    throw new Error(
      `Exercises missing from the catalog (run the catalog seed first): ${missing.join(', ')}`,
    );
  }
  // Config order, not DB order, so the generated data does not depend on insert history.
  return keys.map((k) => idByKey.get(k)!);
}

async function countEntries(prisma: PrismaClient, userId: string) {
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM workout_entries WHERE user_id = ${userId}`;
  return count;
}
