import type { Transaction } from '../../../shared/database/transaction.js';

/**
 * Persistence contract for workout entries and sets. Services depend on this class
 * only; PrismaWorkoutRepository is the production implementation. Any implementation
 * must keep the behavior documented on each method.
 */
export abstract class WorkoutRepository {
  /**
   * Inserts entries for one user. Rows whose natural key (user, exercise, performed_at)
   * already exists are skipped, never updated, and are not returned: the result holds
   * only the rows created by this call. Safe under concurrent identical requests.
   */
  abstract insertEntries(
    userId: string,
    rows: NewEntryRow[],
    tx: Transaction,
  ): Promise<StoredEntryRow[]>;

  /**
   * Existing entries matching the given natural keys (keys must be unique), each with
   * its stored set count.
   */
  abstract findByNaturalKeys(
    userId: string,
    keys: { exerciseId: string; performedAt: Date }[],
    tx?: Transaction,
  ): Promise<StoredEntryRow[]>;

  /**
   * Inserts sets for entries created in the same transaction. The user, exercise, time
   * and local date stored on each set always equal those of its entry. Precondition:
   * every `entryId` refers to an existing entry (callers pass ids just returned by
   * insertEntries).
   */
  abstract insertSets(sets: NewSetRow[], tx: Transaction): Promise<void>;

  /**
   * One page of history ordered by (performed_at DESC, id DESC), starting after the
   * cursor. Returns up to `limit + 1` rows so the caller can tell whether more exist.
   */
  abstract findHistoryPage(
    params: HistoryPageParams,
    tx?: Transaction,
  ): Promise<HistoryEntryRow[]>;

  /** Sets of the given entries, ordered by entry then set index. */
  abstract findSetsForEntries(
    entryIds: string[],
    tx?: Transaction,
  ): Promise<HistorySetRow[]>;
}

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

/** Decimal values are exact decimal strings in plain notation (no exponent, no float rounding). */
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

export interface HistoryPageParams {
  userId: string;
  /** Restricts to these exercises (an empty list matches nothing). */
  exerciseIds?: string[];
  /** Inclusive local calendar dates, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** Keyset cursor: return rows strictly after this position. */
  after?: { performedAt: Date; id: string };
  limit: number;
}

export interface HistoryEntryRow {
  id: string;
  performed_at: Date;
  /** YYYY-MM-DD in the client's local calendar. */
  local_date: string;
  exercise_id: string;
  exercise_name: string;
  /** Muscle group slugs in catalog display order; empty when none are mapped. */
  muscle_groups: string[];
}

/** Kg metrics are exact decimal strings in plain notation, independent of the database driver's types. */
export interface HistorySetRow {
  entry_id: string;
  set_index: number;
  reps: number;
  weight_kg: string;
  volume_kg: string;
  e1rm_kg: string;
}
