import { normalizeExerciseName } from '../../exercises/exercise-name.js';

export interface MuscleGroupConfig {
  slug: string;
  name: string;
}

export interface ExerciseConfig {
  name: string;
  muscleGroups: string[];
}

export interface CatalogConfig {
  muscleGroups: MuscleGroupConfig[];
  exercises: ExerciseConfig[];
}

const SLUG = /^[a-z][a-z0-9_]*$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the exercise catalog config before anything is written to the DB.
 * Collects every problem and throws once so a broken config is fixed in one pass.
 */
export function validateCatalogConfig(raw: unknown): CatalogConfig {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    throw new Error('Invalid catalog config: root must be an object');
  }
  const { muscleGroups, exercises } = raw;
  if (!Array.isArray(muscleGroups)) {
    errors.push('muscleGroups must be an array');
  }
  if (!Array.isArray(exercises)) {
    errors.push('exercises must be an array');
  }
  if (errors.length > 0) {
    throw new Error(`Invalid catalog config: ${errors.join('; ')}`);
  }

  const slugs = new Set<string>();
  (muscleGroups as unknown[]).forEach((group, i) => {
    const at = `muscleGroups[${i}]`;
    if (!isRecord(group)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (typeof group.slug !== 'string' || !SLUG.test(group.slug)) {
      errors.push(`${at}.slug must match ${SLUG.source}`);
    } else if (slugs.has(group.slug)) {
      errors.push(`${at}.slug "${group.slug}" is duplicated`);
    } else {
      slugs.add(group.slug);
    }
    if (!isNonEmptyString(group.name)) {
      errors.push(`${at}.name must be a non-empty string`);
    }
  });

  const names = new Map<string, number>();
  (exercises as unknown[]).forEach((exercise, i) => {
    const at = `exercises[${i}]`;
    if (!isRecord(exercise)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (!isNonEmptyString(exercise.name)) {
      errors.push(`${at}.name must be a non-empty string`);
    } else {
      const normalized = normalizeExerciseName(exercise.name);
      const firstIndex = names.get(normalized);
      if (firstIndex !== undefined) {
        errors.push(
          `${at}.name "${exercise.name}" duplicates exercises[${firstIndex}] after normalization`,
        );
      } else {
        names.set(normalized, i);
      }
    }
    if (
      !Array.isArray(exercise.muscleGroups) ||
      exercise.muscleGroups.length === 0
    ) {
      errors.push(`${at}.muscleGroups must be a non-empty array`);
      return;
    }
    const seen = new Set<unknown>();
    exercise.muscleGroups.forEach((slug: unknown) => {
      if (seen.has(slug)) {
        errors.push(
          `${at}.muscleGroups lists "${String(slug)}" more than once`,
        );
        return;
      }
      seen.add(slug);
      if (typeof slug !== 'string' || !slugs.has(slug)) {
        errors.push(
          `${at}.muscleGroups references unknown slug "${String(slug)}"`,
        );
      }
    });
  });

  if (errors.length > 0) {
    throw new Error(`Invalid catalog config: ${errors.join('; ')}`);
  }
  return raw as unknown as CatalogConfig;
}
