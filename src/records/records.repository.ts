import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

export type RecordMetric = 'weight' | 'volume' | 'e1rm';

export interface RecordRow {
  metric: RecordMetric;
  entry_id: string;
  set_index: number;
  reps: number;
  weight_kg: Prisma.Decimal;
  volume_kg: Prisma.Decimal;
  e1rm_kg: Prisma.Decimal;
  performed_at: Date;
  local_date: string;
}

export interface RecordsParams {
  userId: string;
  exerciseId: string;
  from?: string;
  to?: string;
}

@Injectable()
export class RecordsRepository {
  /**
   * The best set per metric in one statement: three top-1 lookups joined with UNION ALL.
   * Without a range each uses the (user_id, exercise_id, <metric> DESC) index; with a
   * range, (user_id, exercise_id, local_date) narrows the rows first. Ties go to the
   * most recent set.
   */
  async findRecords(
    tx: Prisma.TransactionClient,
    params: RecordsParams,
  ): Promise<RecordRow[]> {
    const where = Prisma.join(
      [
        Prisma.sql`s.user_id = ${params.userId}`,
        Prisma.sql`s.exercise_id = ${params.exerciseId}::uuid`,
        ...(params.from
          ? [Prisma.sql`s.local_date >= ${params.from}::date`]
          : []),
        ...(params.to ? [Prisma.sql`s.local_date <= ${params.to}::date`] : []),
      ],
      ' AND ',
    );
    const columns = Prisma.sql`s.entry_id, s.set_index, s.reps, s.weight_kg, s.volume_kg,
      s.e1rm_kg, s.performed_at, s.local_date::text AS local_date`;

    return tx.$queryRaw<RecordRow[]>`
      (SELECT 'weight' AS metric, ${columns} FROM workout_sets s WHERE ${where}
        ORDER BY s.weight_kg DESC, s.performed_at DESC, s.id DESC LIMIT 1)
      UNION ALL
      (SELECT 'volume' AS metric, ${columns} FROM workout_sets s WHERE ${where}
        ORDER BY s.volume_kg DESC, s.performed_at DESC, s.id DESC LIMIT 1)
      UNION ALL
      (SELECT 'e1rm' AS metric, ${columns} FROM workout_sets s WHERE ${where}
        ORDER BY s.e1rm_kg DESC, s.performed_at DESC, s.id DESC LIMIT 1)`;
  }
}
