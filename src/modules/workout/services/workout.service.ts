import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AppException,
  type ErrorDetail,
} from '../../../shared/errors/app.exception.js';
import { ErrorCode } from '../../../shared/errors/error-code.js';
import { toApiNumber } from '../domain/decimal.js';
import { decodeCursor, encodeCursor } from '../domain/history-cursor.js';
import { parseOffsetDateTime } from '../domain/time/offset-datetime.js';
import { normalizeExerciseName } from '../../exercise/domain/exercise-name.js';
import { ExerciseRepository } from '../../exercise/repositories/exercise.repository.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import { UnitConverter } from '../domain/units/unit-converter.js';
import type { ListWorkoutsQuery } from '../dto/requests/list-workouts.query.js';
import type { LogWorkoutsDto } from '../dto/requests/log-workouts.dto.js';
import { computeSetMetrics } from '../domain/strength-metrics.js';
import {
  type NewSetRow,
  type StoredEntryRow,
  WorkoutRepository,
} from '../repositories/workout.repository.js';
import {
  type EntryStatus,
  type HistoryPage,
  type HistorySet,
  type LoggedEntry,
  type LogWorkoutsResult,
  NO_WORKOUTS_MESSAGE,
} from '../dto/responses/workout.responses.js';

interface PreparedEntry {
  index: number;
  exerciseKey: string;
  exerciseName: string;
  performedAt: Date;
  localDate: string;
  utcOffsetMinutes: number;
  sets: Omit<NewSetRow, 'entryId'>[];
}

const naturalKey = (exerciseId: string, performedAt: Date) =>
  `${exerciseId}|${performedAt.getTime()}`;

@Injectable()
export class WorkoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExerciseRepository,
    private readonly workouts: WorkoutRepository,
    private readonly units: UnitConverter,
  ) {}

  async logWorkouts(
    userId: string,
    dto: LogWorkoutsDto,
  ): Promise<LogWorkoutsResult> {
    const prepared = dto.entries.map((entry, index) =>
      this.prepare(entry, index),
    );
    this.assertNoDuplicatesInRequest(prepared);

    return this.prisma.$transaction(async (tx) => {
      const exercises = await this.exercises.resolveByNames(
        tx,
        prepared.map((e) => e.exerciseName),
      );
      const exerciseOf = (e: PreparedEntry) => exercises.get(e.exerciseKey)!;

      const rows = prepared.map((e) => ({
        exerciseId: exerciseOf(e).id,
        performedAt: e.performedAt,
        localDate: e.localDate,
        utcOffsetMinutes: e.utcOffsetMinutes,
      }));
      const created = await this.workouts.insertEntries(tx, userId, rows);
      const createdByKey = byNaturalKey(created);

      // Entries skipped by the unique index already exist: report their ids as duplicates.
      const missing = rows.filter(
        (r) => !createdByKey.has(naturalKey(r.exerciseId, r.performedAt)),
      );
      const existingByKey = byNaturalKey(
        await this.workouts.findByNaturalKeys(tx, userId, missing),
      );

      const sets: NewSetRow[] = [];
      const entries = prepared.map((e): LoggedEntry => {
        const exercise = exerciseOf(e);
        const key = naturalKey(exercise.id, e.performedAt);
        const createdRow = createdByKey.get(key);
        const stored = createdRow ?? existingByKey.get(key);
        // ON CONFLICT only skips rows whose key already exists, so every entry is either
        // created or found. Fail loudly (and roll back) if that invariant is ever broken.
        if (!stored) {
          throw new Error(
            `Workout entry ${key} was neither inserted nor found as existing`,
          );
        }
        if (createdRow) {
          sets.push(...e.sets.map((s) => ({ ...s, entryId: createdRow.id })));
        }
        return {
          index: e.index,
          id: stored.id,
          status: createdRow ? 'created' : 'duplicate',
          exercise: { id: exercise.id, name: exercise.name },
          performedAt: stored.performedAt.toISOString(),
          localDate: stored.localDate,
          // Duplicates report what is stored, not what this request sent.
          setCount: createdRow ? e.sets.length : stored.setCount!,
        };
      });
      await this.workouts.insertSets(tx, sets);

      const countOf = (status: EntryStatus) =>
        entries.filter((e) => e.status === status).length;
      return {
        entries,
        summary: {
          created: countOf('created'),
          duplicates: countOf('duplicate'),
        },
      };
    });
  }

  async listHistory(
    userId: string,
    query: ListWorkoutsQuery,
  ): Promise<HistoryPage> {
    if (query.from && query.to && query.from > query.to) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        [{ field: 'from', message: 'from must not be after to' }],
      );
    }
    const after =
      query.cursor !== undefined ? decodeCursor(query.cursor) : undefined;
    const tx = this.prisma;
    if (query.muscleGroup) {
      await this.assertKnownMuscleGroup(query.muscleGroup);
    }

    // Resolve filters on the small catalog first: when nothing matches there is no
    // need to walk the user's history at all.
    let exerciseIds: string[] | undefined;
    if (query.exercise !== undefined || query.muscleGroup !== undefined) {
      exerciseIds = await this.exercises.findIdsForFilter(tx, {
        nameContains: query.exercise,
        muscleGroup: query.muscleGroup,
      });
      if (exerciseIds.length === 0) {
        return {
          data: [],
          pagination: { limit: query.limit, hasMore: false, nextCursor: null },
          message: NO_WORKOUTS_MESSAGE,
        };
      }
    }

    const rows = await this.workouts.findHistoryPage({
      tx,
      userId,
      exerciseIds,
      from: query.from,
      to: query.to,
      after,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const sets = await this.workouts.findSetsForEntries(
      tx,
      page.map((r) => r.id),
    );
    const setsByEntry = new Map<string, HistorySet[]>();
    for (const s of sets) {
      const list = setsByEntry.get(s.entry_id) ?? [];
      list.push({
        setIndex: s.set_index,
        reps: s.reps,
        weight: toApiNumber(
          this.units.fromKg(s.weight_kg.toString(), query.unit),
        ),
        unit: query.unit,
        volume: toApiNumber(
          this.units.fromKg(s.volume_kg.toString(), query.unit),
        ),
        e1rm: toApiNumber(this.units.fromKg(s.e1rm_kg.toString(), query.unit)),
      });
      setsByEntry.set(s.entry_id, list);
    }

    const last = page.at(-1);
    return {
      data: page.map((r) => ({
        id: r.id,
        exercise: {
          id: r.exercise_id,
          name: r.exercise_name,
          muscleGroups: r.muscle_groups,
        },
        performedAt: r.performed_at.toISOString(),
        localDate: r.local_date,
        sets: setsByEntry.get(r.id) ?? [],
      })),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ performedAt: last.performed_at, id: last.id })
            : null,
      },
      ...(page.length === 0 && { message: NO_WORKOUTS_MESSAGE }),
    };
  }

  private async assertKnownMuscleGroup(slug: string): Promise<void> {
    const slugs = await this.exercises.listMuscleGroupSlugs(this.prisma);
    if (!slugs.includes(slug)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        [
          {
            field: 'muscleGroup',
            message: `muscleGroup must be one of: ${slugs.join(', ')}`,
          },
        ],
      );
    }
  }

  /** Pure preparation: parse time, normalize name, convert to kg, compute metrics. */
  private prepare(
    entry: LogWorkoutsDto['entries'][number],
    index: number,
  ): PreparedEntry {
    // The DTO already validated the format, so parsing cannot fail here.
    const time = parseOffsetDateTime(entry.date)!;
    return {
      index,
      exerciseKey: normalizeExerciseName(entry.exerciseName),
      exerciseName: entry.exerciseName,
      performedAt: time.instant,
      localDate: time.localDate,
      utcOffsetMinutes: time.utcOffsetMinutes,
      sets: entry.sets.map((set, setIndex) => {
        const metrics = computeSetMetrics(
          this.units.toKg(set.weight, set.unit),
          set.reps,
        );
        return {
          setIndex,
          reps: set.reps,
          weight: String(set.weight),
          unit: set.unit,
          weightKg: metrics.weightKg.toFixed(),
          volumeKg: metrics.volumeKg.toFixed(),
          e1rmKg: metrics.e1rmKg.toFixed(),
        };
      }),
    };
  }

  /** Same exercise at the same instant twice in one request is ambiguous: reject it. */
  private assertNoDuplicatesInRequest(entries: PreparedEntry[]): void {
    const firstIndex = new Map<string, number>();
    const details: ErrorDetail[] = [];
    for (const e of entries) {
      const key = `${e.exerciseKey}|${e.performedAt.getTime()}`;
      const first = firstIndex.get(key);
      if (first === undefined) {
        firstIndex.set(key, e.index);
      } else {
        details.push({
          field: `entries[${e.index}]`,
          message: `duplicates entries[${first}] (same exercise and date)`,
        });
      }
    }
    if (details.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        details,
      );
    }
  }
}

function byNaturalKey(rows: StoredEntryRow[]): Map<string, StoredEntryRow> {
  return new Map(rows.map((r) => [naturalKey(r.exerciseId, r.performedAt), r]));
}
