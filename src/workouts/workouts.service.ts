import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AppException,
  type ErrorDetail,
} from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { parseOffsetDateTime } from '../common/time/offset-datetime.js';
import { normalizeExerciseName } from '../exercises/exercise-name.js';
import { ExercisesRepository } from '../exercises/exercises.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnitConverter } from '../units/unit-converter.js';
import type { LogWorkoutsDto } from './dto/log-workouts.dto.js';
import { computeSetMetrics } from './strength-metrics.js';
import {
  type NewSetRow,
  type StoredEntryRow,
  WorkoutsRepository,
} from './workouts.repository.js';

export type EntryStatus = 'created' | 'duplicate';

export interface LoggedEntry {
  index: number;
  id: string;
  status: EntryStatus;
  exercise: { id: string; name: string };
  performedAt: string;
  localDate: string;
  setCount: number;
}

export interface LogWorkoutsResult {
  entries: LoggedEntry[];
  summary: { created: number; duplicates: number };
}

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
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesRepository,
    private readonly workouts: WorkoutsRepository,
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
        const stored = createdRow ?? existingByKey.get(key)!;
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

      const createdCount = entries.filter((e) => e.status === 'created').length;
      return {
        entries,
        summary: {
          created: createdCount,
          duplicates: entries.length - createdCount,
        },
      };
    });
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
