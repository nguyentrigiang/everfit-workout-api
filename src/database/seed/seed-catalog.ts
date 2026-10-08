import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  cleanDisplayName,
  normalizeExerciseName,
} from '../../modules/exercise/domain/exercise-name.js';
import type { CatalogConfig } from './catalog-config.js';

export interface SeedResult {
  muscleGroups: number;
  exercises: number;
  exerciseMuscleGroups: number;
}

/**
 * Initializes the exercise catalog. Insert-only: rows that already exist (by slug,
 * normalized name, or pair) are left untouched, so re-running is a no-op and later
 * config edits never rewrite stored data. One transaction, one statement per table.
 */
export async function seedCatalog(
  prisma: PrismaClient,
  config: CatalogConfig,
): Promise<SeedResult> {
  const groupSlugs = config.muscleGroups.map((g) => g.slug);
  const groupNames = config.muscleGroups.map((g) => cleanDisplayName(g.name));
  const groupOrder = config.muscleGroups.map((_, i) => i);

  const exerciseNames = config.exercises.map((e) => cleanDisplayName(e.name));
  const exerciseKeys = config.exercises.map((e) =>
    normalizeExerciseName(e.name),
  );

  const pairKeys = config.exercises.flatMap((e) =>
    e.muscleGroups.map(() => normalizeExerciseName(e.name)),
  );
  const pairSlugs = config.exercises.flatMap((e) => e.muscleGroups);

  return prisma.$transaction(async (tx) => {
    const muscleGroups = await tx.$executeRaw`
      INSERT INTO muscle_groups (slug, name, sort_order)
      SELECT * FROM unnest(${groupSlugs}::text[], ${groupNames}::text[], ${groupOrder}::int[])
      ON CONFLICT (slug) DO NOTHING`;

    const exercises = await tx.$executeRaw`
      INSERT INTO exercises (name, name_normalized)
      SELECT * FROM unnest(${exerciseNames}::text[], ${exerciseKeys}::text[])
      ON CONFLICT (name_normalized) DO NOTHING`;

    // Resolve ids by natural keys so pairs also attach to rows that already existed.
    const exerciseMuscleGroups = await tx.$executeRaw`
      INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id)
      SELECT e.id, mg.id
      FROM unnest(${pairKeys}::text[], ${pairSlugs}::text[]) AS p(name_normalized, slug)
      JOIN exercises e ON e.name_normalized = p.name_normalized
      JOIN muscle_groups mg ON mg.slug = p.slug
      ON CONFLICT DO NOTHING`;

    return { muscleGroups, exercises, exerciseMuscleGroups };
  });
}
