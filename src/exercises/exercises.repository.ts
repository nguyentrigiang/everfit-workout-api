import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { cleanDisplayName, normalizeExerciseName } from './exercise-name.js';

export interface ResolvedExercise {
  id: string;
  name: string;
}

@Injectable()
export class ExercisesRepository {
  /**
   * Returns the exercise for each name, creating missing ones (no muscle groups yet).
   * Keyed by normalized name. Insert-if-missing is race-safe via the unique index.
   */
  async resolveByNames(
    tx: Prisma.TransactionClient,
    names: string[],
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

    await tx.$executeRaw`
      INSERT INTO exercises (name, name_normalized)
      SELECT u.name, u.name_normalized
      FROM unnest(${displayNames}::text[], ${keys}::text[]) AS u(name, name_normalized)
      ORDER BY u.name_normalized
      ON CONFLICT (name_normalized) DO NOTHING`;

    const rows = await tx.$queryRaw<
      { id: string; name: string; name_normalized: string }[]
    >`
      SELECT id, name, name_normalized FROM exercises
      WHERE name_normalized = ANY(${keys}::text[])`;

    return new Map(
      rows.map((r) => [r.name_normalized, { id: r.id, name: r.name }]),
    );
  }
}
