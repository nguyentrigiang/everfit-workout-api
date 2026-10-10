import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AppException,
  type ErrorDetail,
} from '../../../shared/errors/app.exception.js';
import { ErrorCode } from '../../../shared/errors/error-code.js';
import { toApiNumber } from '../domain/decimal.js';
import { decodeCursor, encodeCursor } from './history-cursor.js';
import { parseOffsetDateTime } from '../domain/time/offset-datetime.js';
import { normalizeExerciseName } from '../../exercise/domain/exercise-name.js';
import {
  ExerciseRepository,
  type ResolvedExercise,
} from '../../exercise/repositories/exercise.repository.js';
import {
  type Transaction,
  TransactionRunner,
} from '../../../shared/database/transaction.js';
import { UnitConverter } from '../domain/units/unit-converter.js';
import type { ListWorkoutsQuery } from '../dto/requests/list-workouts.query.js';
import type { LogWorkoutsDto } from '../dto/requests/log-workouts.dto.js';
import { computeSetMetrics } from '../domain/strength-metrics.js';
import {
  type HistoryEntryRow,
  type HistorySetRow,
  type NewSetRow,
  type StoredEntryRow,
  WorkoutRepository,
} from '../repositories/workout.repository.js';
import {
  type HistoryEntry,
  type HistoryPage,
  type HistorySet,
  type LoggedEntry,
  type LogWorkoutsResult,
  NO_WORKOUTS_MESSAGE,
} from '../dto/responses/workout.responses.js';

/** A request entry after parsing and unit conversion, before touching the database. */
interface PreparedEntry {
  index: number;
  exerciseKey: string;
  exerciseName: string;
  performedAt: Date;
  localDate: string;
  utcOffsetMinutes: number;
  sets: Omit<NewSetRow, 'entryId'>[];
}

/** A prepared entry with its catalog exercise and natural key, ready to be saved. */
interface EntryToSave extends PreparedEntry {
  exercise: ResolvedExercise;
  naturalKey: string;
}

type StoredEntriesByKey = Map<string, StoredEntryRow>;

/** Same exercise at the same instant = same workout entry (the unique index in the DB). */
const naturalKey = (exerciseId: string, performedAt: Date) =>
  `${exerciseId}|${performedAt.getTime()}`;

@Injectable()
export class WorkoutService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly exercises: ExerciseRepository,
    private readonly workouts: WorkoutRepository,
    private readonly units: UnitConverter,
  ) {}

  async logWorkouts(
    userId: string,
    dto: LogWorkoutsDto,
  ): Promise<LogWorkoutsResult> {
    const preparedEntries = dto.entries.map((entry, index) =>
      this.prepare(entry, index),
    );
    this.assertNoDuplicatesInRequest(preparedEntries);

    return this.transactions.run(async (tx) => {
      const entries = await this.attachExercises(preparedEntries, tx);
      const createdByKey = await this.insertNewEntries(userId, entries, tx);
      const existingByKey = await this.findAlreadyLoggedEntries(
        userId,
        entries,
        createdByKey,
        tx,
      );

      const loggedEntries = entries.map((entry) =>
        this.toLoggedEntry(entry, createdByKey, existingByKey),
      );
      await this.insertSetsOfCreatedEntries(entries, createdByKey, tx);

      return { entries: loggedEntries, summary: summarize(loggedEntries) };
    });
  }

  /** Finds or creates the exercise of every entry and computes its natural key. */
  private async attachExercises(
    preparedEntries: PreparedEntry[],
    tx: Transaction,
  ): Promise<EntryToSave[]> {
    const exercisesByKey = await this.exercises.resolveByNames(
      preparedEntries.map((entry) => entry.exerciseName),
      tx,
    );
    return preparedEntries.map((entry) => {
      const exercise = exercisesByKey.get(entry.exerciseKey);
      if (!exercise) {
        throw new Error(`Exercise "${entry.exerciseName}" was not resolved`);
      }
      return {
        ...entry,
        exercise,
        naturalKey: naturalKey(exercise.id, entry.performedAt),
      };
    });
  }

  /** Inserts the entries; ones already stored are skipped and not returned. */
  private async insertNewEntries(
    userId: string,
    entries: EntryToSave[],
    tx: Transaction,
  ): Promise<StoredEntriesByKey> {
    const createdRows = await this.workouts.insertEntries(
      userId,
      entries.map((entry) => ({
        exerciseId: entry.exercise.id,
        performedAt: entry.performedAt,
        localDate: entry.localDate,
        utcOffsetMinutes: entry.utcOffsetMinutes,
      })),
      tx,
    );
    return mapByNaturalKey(createdRows);
  }

  /**
   * Entries the insert skipped were logged before (e.g. a client retry). The insert
   * does not return them, so look them up to report their stored id and set count.
   */
  private async findAlreadyLoggedEntries(
    userId: string,
    entries: EntryToSave[],
    createdByKey: StoredEntriesByKey,
    tx: Transaction,
  ): Promise<StoredEntriesByKey> {
    const notCreated = entries.filter(
      (entry) => !createdByKey.has(entry.naturalKey),
    );
    const existingRows = await this.workouts.findByNaturalKeys(
      userId,
      notCreated.map((entry) => ({
        exerciseId: entry.exercise.id,
        performedAt: entry.performedAt,
      })),
      tx,
    );
    return mapByNaturalKey(existingRows);
  }

  private toLoggedEntry(
    entry: EntryToSave,
    createdByKey: StoredEntriesByKey,
    existingByKey: StoredEntriesByKey,
  ): LoggedEntry {
    const exercise = { id: entry.exercise.id, name: entry.exercise.name };

    const createdRow = createdByKey.get(entry.naturalKey);
    if (createdRow) {
      return {
        index: entry.index,
        id: createdRow.id,
        status: 'created',
        exercise,
        performedAt: createdRow.performedAt.toISOString(),
        localDate: createdRow.localDate,
        setCount: entry.sets.length,
      };
    }

    // ON CONFLICT only skips rows whose key already exists, so every entry is either
    // created or found. Fail loudly (and roll back) if that invariant is ever broken.
    const existingRow = existingByKey.get(entry.naturalKey);
    if (!existingRow) {
      throw new Error(
        `Workout entry ${entry.naturalKey} was neither inserted nor found as existing`,
      );
    }
    return {
      index: entry.index,
      id: existingRow.id,
      status: 'duplicate',
      exercise,
      performedAt: existingRow.performedAt.toISOString(),
      localDate: existingRow.localDate,
      // Duplicates report what is stored, not what this request sent.
      // findByNaturalKeys always returns the set count.
      setCount: existingRow.setCount!,
    };
  }

  /** Writes sets only for new entries: a duplicate keeps the sets it was stored with. */
  private async insertSetsOfCreatedEntries(
    entries: EntryToSave[],
    createdByKey: StoredEntriesByKey,
    tx: Transaction,
  ): Promise<void> {
    const sets: NewSetRow[] = entries.flatMap((entry) => {
      const createdRow = createdByKey.get(entry.naturalKey);
      if (!createdRow) return [];
      return entry.sets.map((set) => ({ ...set, entryId: createdRow.id }));
    });
    await this.workouts.insertSets(sets, tx);
  }

  async listWorkouts(
    userId: string,
    query: ListWorkoutsQuery,
  ): Promise<HistoryPage> {
    this.assertFromNotAfterTo(query.from, query.to);
    const after =
      query.cursor !== undefined ? decodeCursor(query.cursor) : undefined;
    if (query.muscleGroup) {
      await this.assertKnownMuscleGroup(query.muscleGroup);
    }

    const exerciseIds = await this.findExerciseIdsForFilters(query);
    // Nothing in the catalog matches: no need to walk the user's history at all.
    if (exerciseIds?.length === 0) {
      return emptyHistoryPage(query.limit);
    }

    // The repository returns one extra row so we can tell whether a next page exists.
    const rows = await this.workouts.findHistoryPage({
      userId,
      exerciseIds,
      from: query.from,
      to: query.to,
      after,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const setsByEntryId = await this.loadSetsByEntryId(pageRows, query.unit);

    const page: HistoryPage = {
      data: pageRows.map((row) =>
        toHistoryEntry(row, setsByEntryId.get(row.id) ?? []),
      ),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore ? cursorAfter(pageRows) : null,
      },
    };
    if (pageRows.length === 0) {
      page.message = NO_WORKOUTS_MESSAGE;
    }
    return page;
  }

  private assertFromNotAfterTo(from?: string, to?: string): void {
    if (from && to && from > to) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        [{ field: 'from', message: 'from must not be after to' }],
      );
    }
  }

  private async assertKnownMuscleGroup(slug: string): Promise<void> {
    const knownSlugs = await this.exercises.listMuscleGroupSlugs();
    if (!knownSlugs.includes(slug)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        [
          {
            field: 'muscleGroup',
            message: `muscleGroup must be one of: ${knownSlugs.join(', ')}`,
          },
        ],
      );
    }
  }

  /**
   * Resolves the exercise and muscle group filters to exercise ids on the small
   * catalog. Undefined means "no exercise filter"; an empty list means "nothing matches".
   */
  private async findExerciseIdsForFilters(
    query: ListWorkoutsQuery,
  ): Promise<string[] | undefined> {
    if (query.exercise === undefined && query.muscleGroup === undefined) {
      return undefined;
    }
    return this.exercises.findIdsForFilter({
      nameContains: query.exercise,
      muscleGroup: query.muscleGroup,
    });
  }

  /** Sets of the page's entries, converted to the requested unit and grouped by entry. */
  private async loadSetsByEntryId(
    pageRows: HistoryEntryRow[],
    unit: string,
  ): Promise<Map<string, HistorySet[]>> {
    const setRows = await this.workouts.findSetsForEntries(
      pageRows.map((row) => row.id),
    );
    const setsByEntryId = new Map<string, HistorySet[]>();
    for (const setRow of setRows) {
      const entrySets = setsByEntryId.get(setRow.entry_id) ?? [];
      entrySets.push(this.toHistorySet(setRow, unit));
      setsByEntryId.set(setRow.entry_id, entrySets);
    }
    return setsByEntryId;
  }

  private toHistorySet(setRow: HistorySetRow, unit: string): HistorySet {
    return {
      setIndex: setRow.set_index,
      reps: setRow.reps,
      weight: toApiNumber(this.units.fromKg(setRow.weight_kg, unit)),
      unit,
      volume: toApiNumber(this.units.fromKg(setRow.volume_kg, unit)),
      e1rm: toApiNumber(this.units.fromKg(setRow.e1rm_kg, unit)),
    };
  }

  /** Pure preparation: parse time, normalize name, convert to kg, compute metrics. */
  private prepare(
    entry: LogWorkoutsDto['entries'][number],
    index: number,
  ): PreparedEntry {
    // The DTO already validated the format, so parsing cannot fail here.
    const parsedDate = parseOffsetDateTime(entry.date)!;
    return {
      index,
      exerciseKey: normalizeExerciseName(entry.exerciseName),
      exerciseName: entry.exerciseName,
      performedAt: parsedDate.instant,
      localDate: parsedDate.localDate,
      utcOffsetMinutes: parsedDate.utcOffsetMinutes,
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
    // Exercises are not resolved yet, so the key uses the normalized name, not the id.
    const firstIndexByKey = new Map<string, number>();
    const details: ErrorDetail[] = [];
    for (const entry of entries) {
      const key = `${entry.exerciseKey}|${entry.performedAt.getTime()}`;
      const firstIndex = firstIndexByKey.get(key);
      if (firstIndex === undefined) {
        firstIndexByKey.set(key, entry.index);
      } else {
        details.push({
          field: `entries[${entry.index}]`,
          message: `duplicates entries[${firstIndex}] (same exercise and date)`,
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

function mapByNaturalKey(rows: StoredEntryRow[]): StoredEntriesByKey {
  return new Map(
    rows.map((row) => [naturalKey(row.exerciseId, row.performedAt), row]),
  );
}

function summarize(entries: LoggedEntry[]): LogWorkoutsResult['summary'] {
  return {
    created: entries.filter((entry) => entry.status === 'created').length,
    duplicates: entries.filter((entry) => entry.status === 'duplicate').length,
  };
}

function toHistoryEntry(
  row: HistoryEntryRow,
  sets: HistorySet[],
): HistoryEntry {
  return {
    id: row.id,
    exercise: {
      id: row.exercise_id,
      name: row.exercise_name,
      muscleGroups: row.muscle_groups,
    },
    performedAt: row.performed_at.toISOString(),
    localDate: row.local_date,
    sets,
  };
}

function emptyHistoryPage(limit: number): HistoryPage {
  return {
    data: [],
    pagination: { limit, hasMore: false, nextCursor: null },
    message: NO_WORKOUTS_MESSAGE,
  };
}

/** Cursor pointing after the last row of a non-empty page. */
function cursorAfter(pageRows: HistoryEntryRow[]): string {
  const lastRow = pageRows[pageRows.length - 1];
  return encodeCursor({ performedAt: lastRow.performed_at, id: lastRow.id });
}
