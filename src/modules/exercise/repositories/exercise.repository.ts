import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '../../../infrastructure/database/prisma/prisma-repository.js';
import type { Transaction } from '../../../shared/database/transaction.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  cleanDisplayName,
  normalizeExerciseName,
} from '../domain/exercise-name.js';

export interface ResolvedExercise {
  id: string;
  name: string;
}

@Injectable()
export class ExerciseRepository extends PrismaRepository {
  /**
   * Returns the exercise for each name, creating missing ones (no muscle groups yet).
   * Keyed by normalized name. Insert-if-missing is race-safe via the unique index.
   */
  async resolveByNames(
    names: string[],
    tx: Transaction,
  ): Promise<Map<string, ResolvedExercise>> {
    const byKey = new Map<string, string>();
    for (const name of names) {
      const key = normalizeExerciseName(name);
      if (!byKey.has(key)) byKey.set(key, cleanDisplayName(name));
    }
    // Insert in a fixed (sorted) order so concurrent requests take unique-index locks
    // in the same order and cannot deadlock.
    const sorted = [...byKey].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const keys = sorted.map(([key]) => key);
    const displayNames = sorted.map(([, name]) => name);

    await this.db(tx).$executeRaw`
      INSERT INTO exercises (name, name_normalized)
      SELECT u.name, u.name_normalized
      FROM unnest(${displayNames}::text[], ${keys}::text[]) AS u(name, name_normalized)
      ORDER BY u.name_normalized
      ON CONFLICT (name_normalized) DO NOTHING`;

    const rows = await this.db(tx).$queryRaw<
      { id: string; name: string; name_normalized: string }[]
    >`
      SELECT id, name, name_normalized FROM exercises
      WHERE name_normalized = ANY(${keys}::text[])`;

    return new Map(
      rows.map((r) => [r.name_normalized, { id: r.id, name: r.name }]),
    );
  }

  /** All muscle group slugs in display order (used to validate filters). */
  async listMuscleGroupSlugs(tx?: Transaction): Promise<string[]> {
    const rows = await this.db(tx).muscleGroup.findMany({
      select: { slug: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => r.slug);
  }

  /**
   * Ids of the exercises matching history filters (both filters must match). Runs on
   * the small catalog so the history query gets a concrete id list, or can be skipped
   * entirely when nothing matches.
   */
  async findIdsForFilter(
    filter: { nameContains?: string; muscleGroup?: string },
    tx?: Transaction,
  ): Promise<string[]> {
    const conditions: Prisma.Sql[] = [];
    if (filter.nameContains !== undefined) {
      const pattern = `%${escapeLike(normalizeExerciseName(filter.nameContains))}%`;
      conditions.push(
        Prisma.sql`ex.name_normalized LIKE ${pattern} ESCAPE '\\'`,
      );
    }
    if (filter.muscleGroup !== undefined) {
      conditions.push(Prisma.sql`ex.id IN (
        SELECT emg.exercise_id FROM exercise_muscle_groups emg
        JOIN muscle_groups mg ON mg.id = emg.muscle_group_id
        WHERE mg.slug = ${filter.muscleGroup})`);
    }
    if (conditions.length === 0) {
      throw new Error('findIdsForFilter needs at least one filter');
    }
    const rows = await this.db(tx).$queryRaw<{ id: string }[]>`
      SELECT ex.id FROM exercises ex WHERE ${Prisma.join(conditions, ' AND ')}`;
    return rows.map((r) => r.id);
  }

  /** Exact lookup by normalized name (case and whitespace insensitive). */
  async findByName(
    name: string,
    tx?: Transaction,
  ): Promise<ResolvedExercise | null> {
    return this.db(tx).exercise.findUnique({
      where: { nameNormalized: normalizeExerciseName(name) },
      select: { id: true, name: true },
    });
  }
}

/** Escapes LIKE wildcards so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
