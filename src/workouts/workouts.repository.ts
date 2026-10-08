import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export interface NewEntryRow {
  exerciseId: string;
  performedAt: Date;
  localDate: string;
  utcOffsetMinutes: number;
}

export interface StoredEntryRow {
  id: string;
  exerciseId: string;
  performedAt: Date;
  localDate: string;
  /** Only set for existing rows looked up by natural key. */
  setCount?: number;
}

export interface NewSetRow {
  entryId: string;
  setIndex: number;
  reps: number;
  weight: string;
  unit: string;
  weightKg: string;
  volumeKg: string;
  e1rmKg: string;
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

/** Raw SQL for bulk workout writes. One statement per table, bind parameters only. */
@Injectable()
export class WorkoutsRepository {
  /**
   * Inserts entries; rows that hit the natural key (user, exercise, performed_at)
   * are skipped by the unique index and are not returned (idempotent, race-safe).
   */
  async insertEntries(
    tx: Prisma.TransactionClient,
    userId: string,
    rows: NewEntryRow[],
  ): Promise<StoredEntryRow[]> {
    const created = await tx.$queryRaw<EntryRecord[]>`
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
    tx: Prisma.TransactionClient,
    userId: string,
    keys: { exerciseId: string; performedAt: Date }[],
  ): Promise<StoredEntryRow[]> {
    if (keys.length === 0) return [];
    const rows = await tx.$queryRaw<EntryRecord[]>`
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
  async insertSets(
    tx: Prisma.TransactionClient,
    sets: NewSetRow[],
  ): Promise<void> {
    if (sets.length === 0) return;
    await tx.$executeRaw`
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
}
