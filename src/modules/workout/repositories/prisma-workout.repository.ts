import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../../infrastructure/database/prisma/prisma-repository.js';
import type { Transaction } from '../../../shared/database/transaction.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  type HistoryEntryRow,
  type HistoryPageParams,
  type HistorySetRow,
  type NewEntryRow,
  type NewSetRow,
  type StoredEntryRow,
  WorkoutRepository,
} from './workout.repository.js';

interface SetRecord {
  entry_id: string;
  set_index: number;
  reps: number;
  weight_kg: Prisma.Decimal;
  volume_kg: Prisma.Decimal;
  e1rm_kg: Prisma.Decimal;
}

interface EntryRecord {
  id: string;
  exercise_id: string;
  performed_at: Date;
  local_date: string;
  set_count?: number;
}

const toStored = (r: EntryRecord): StoredEntryRow => ({
  id: r.id,
  exerciseId: r.exercise_id,
  performedAt: r.performed_at,
  localDate: r.local_date,
  ...(r.set_count !== undefined && { setCount: r.set_count }),
});

/**
 * WorkoutRepository on PostgreSQL with Prisma raw SQL: one statement per table, bind
 * parameters only. Inherits client and transaction handling from PrismaRepository.
 */
@Injectable()
export class PrismaWorkoutRepository
  extends PrismaRepository
  implements WorkoutRepository
{
  /**
   * Inserts entries; rows that hit the natural key (user, exercise, performed_at)
   * are skipped by the unique index and are not returned (idempotent, race-safe).
   */
  async insertEntries(
    userId: string,
    rows: NewEntryRow[],
    tx: Transaction,
  ): Promise<StoredEntryRow[]> {
    const created = await this.db(tx).$queryRaw<EntryRecord[]>`
      INSERT INTO workout_entries (user_id, exercise_id, performed_at, local_date, utc_offset_minutes)
      SELECT ${userId}, u.exercise_id, u.performed_at, u.local_date, u.utc_offset_minutes
      FROM unnest(
        ${rows.map((r) => r.exerciseId)}::uuid[],
        ${rows.map((r) => r.performedAt.toISOString())}::timestamptz[],
        ${rows.map((r) => r.localDate)}::date[],
        ${rows.map((r) => r.utcOffsetMinutes)}::int[]
      ) AS u(exercise_id, performed_at, local_date, utc_offset_minutes)
      -- Fixed insert order: concurrent requests with the same keys in a different
      -- order would otherwise lock the unique index crosswise and deadlock.
      ORDER BY u.exercise_id, u.performed_at
      ON CONFLICT (user_id, exercise_id, performed_at) DO NOTHING
      RETURNING id, exercise_id, performed_at, local_date::text AS local_date`;
    return created.map(toStored);
  }

  /** Looks up existing entries (with their stored set count) by natural key, to report duplicates. */
  async findByNaturalKeys(
    userId: string,
    keys: { exerciseId: string; performedAt: Date }[],
    tx?: Transaction,
  ): Promise<StoredEntryRow[]> {
    if (keys.length === 0) return [];
    const rows = await this.db(tx).$queryRaw<EntryRecord[]>`
      SELECT e.id, e.exercise_id, e.performed_at, e.local_date::text AS local_date,
             (SELECT count(*) FROM workout_sets s WHERE s.entry_id = e.id)::int AS set_count
      FROM workout_entries e
      JOIN unnest(
        ${keys.map((k) => k.exerciseId)}::uuid[],
        ${keys.map((k) => k.performedAt.toISOString())}::timestamptz[]
      ) AS k(exercise_id, performed_at)
        ON e.exercise_id = k.exercise_id AND e.performed_at = k.performed_at
      WHERE e.user_id = ${userId}`;
    return rows.map(toStored);
  }

  /**
   * Inserts sets. user_id, exercise_id, performed_at and local_date are copied from the
   * parent entry row in SQL, so the denormalized columns cannot disagree with it.
   */
  async insertSets(sets: NewSetRow[], tx: Transaction): Promise<void> {
    if (sets.length === 0) return;
    await this.db(tx).$executeRaw`
      INSERT INTO workout_sets (entry_id, set_index, reps, weight, unit, weight_kg, volume_kg, e1rm_kg,
                                user_id, exercise_id, performed_at, local_date)
      SELECT s.entry_id, s.set_index, s.reps, s.weight, s.unit, s.weight_kg, s.volume_kg, s.e1rm_kg,
             e.user_id, e.exercise_id, e.performed_at, e.local_date
      FROM unnest(
        ${sets.map((s) => s.entryId)}::uuid[],
        ${sets.map((s) => s.setIndex)}::int[],
        ${sets.map((s) => s.reps)}::int[],
        ${sets.map((s) => s.weight)}::numeric[],
        ${sets.map((s) => s.unit)}::text[],
        ${sets.map((s) => s.weightKg)}::numeric[],
        ${sets.map((s) => s.volumeKg)}::numeric[],
        ${sets.map((s) => s.e1rmKg)}::numeric[]
      ) AS s(entry_id, set_index, reps, weight, unit, weight_kg, volume_kg, e1rm_kg)
      JOIN workout_entries e ON e.id = s.entry_id`;
  }

  /**
   * One page of history, newest first, keyset-paginated on (performed_at, id).
   * Filters are composed with Prisma.sql fragments (bind parameters, no string concat).
   * Fetches limit + 1 rows so the caller can tell whether another page exists.
   */
  async findHistoryPage(
    params: HistoryPageParams,
    tx?: Transaction,
  ): Promise<HistoryEntryRow[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`e.user_id = ${params.userId}`];

    if (params.exerciseIds) {
      // Resolved from the catalog beforehand (see ExerciseRepository.findIdsForFilter).
      conditions.push(
        Prisma.sql`e.exercise_id = ANY(${params.exerciseIds}::uuid[])`,
      );
    }
    if (params.from) {
      // local_date gives the exact calendar match; the widened performed_at bound
      // (max offset 14h) lets the (user_id, performed_at) index narrow the scan.
      conditions.push(Prisma.sql`e.local_date >= ${params.from}::date`);
      conditions.push(
        Prisma.sql`e.performed_at >= ${shiftHours(params.from, -MAX_OFFSET_HOURS)}::timestamptz`,
      );
    }
    if (params.to) {
      conditions.push(Prisma.sql`e.local_date <= ${params.to}::date`);
      conditions.push(
        Prisma.sql`e.performed_at < ${shiftHours(params.to, 24 + MAX_OFFSET_HOURS)}::timestamptz`,
      );
    }
    if (params.after) {
      conditions.push(
        Prisma.sql`(e.performed_at, e.id) < (${params.after.performedAt.toISOString()}::timestamptz, ${params.after.id}::uuid)`,
      );
    }

    return this.db(tx).$queryRaw<HistoryEntryRow[]>`
      SELECT e.id, e.performed_at, e.local_date::text AS local_date,
             ex.id AS exercise_id, ex.name AS exercise_name,
             COALESCE((
               SELECT array_agg(mg.slug ORDER BY mg.sort_order)
               FROM exercise_muscle_groups emg
               JOIN muscle_groups mg ON mg.id = emg.muscle_group_id
               WHERE emg.exercise_id = ex.id
             ), '{}') AS muscle_groups
      FROM workout_entries e
      JOIN exercises ex ON ex.id = e.exercise_id
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY e.performed_at DESC, e.id DESC
      LIMIT ${params.limit + 1}`;
  }

  /** Sets for a page of entries in one query (no N+1). */
  async findSetsForEntries(
    entryIds: string[],
    tx?: Transaction,
  ): Promise<HistorySetRow[]> {
    if (entryIds.length === 0) return [];
    const rows = await this.db(tx).$queryRaw<SetRecord[]>`
      SELECT entry_id, set_index, reps, weight_kg, volume_kg, e1rm_kg
      FROM workout_sets
      WHERE entry_id = ANY(${entryIds}::uuid[])
      ORDER BY entry_id, set_index`;
    // Decimal columns leave the repository as exact strings (driver-independent contract).
    return rows.map((r) => ({
      ...r,
      weight_kg: r.weight_kg.toString(),
      volume_kg: r.volume_kg.toString(),
      e1rm_kg: r.e1rm_kg.toString(),
    }));
  }
}

const MAX_OFFSET_HOURS = 14;

/** ISO instant for `date` 00:00 UTC shifted by `hours`. */
function shiftHours(date: string, hours: number): string {
  return new Date(
    Date.parse(`${date}T00:00:00Z`) + hours * 3_600_000,
  ).toISOString();
}
