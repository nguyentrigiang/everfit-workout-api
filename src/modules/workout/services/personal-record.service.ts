import { HttpStatus, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { toApiNumber } from '../domain/decimal.js';
import {
  AppException,
  type ErrorDetail,
} from '../../../shared/errors/app.exception.js';
import { ErrorCode } from '../../../shared/errors/error-code.js';
import {
  ExerciseRepository,
  type ResolvedExercise,
} from '../../exercise/repositories/exercise.repository.js';
import { UnitConverter } from '../domain/units/unit-converter.js';
import type { PersonalRecordsQuery } from '../dto/requests/personal-records.query.js';
import {
  type RecordMetric,
  type RecordRow,
  PersonalRecordRepository,
} from '../repositories/personal-record.repository.js';
import {
  NO_RECORDS_MESSAGE,
  type PersonalRecord,
  type RecordDifference,
  type RecordSet,
  type RecordsResult,
} from '../dto/responses/personal-record.responses.js';

/** A stored kg value as the repository returns it (an exact decimal). */
type KgValue = RecordRow['weight_kg'];

/** Which field of the response each metric fills. */
const RECORD_KEY_BY_METRIC: Record<RecordMetric, keyof RecordSet> = {
  weight: 'heaviestWeight',
  volume: 'highestVolume',
  e1rm: 'bestEstimated1RM',
};

@Injectable()
export class PersonalRecordService {
  constructor(
    private readonly exercises: ExerciseRepository,
    private readonly records: PersonalRecordRepository,
    private readonly units: UnitConverter,
  ) {}

  async getPersonalRecords(
    userId: string,
    query: PersonalRecordsQuery,
  ): Promise<RecordsResult> {
    this.validateRanges(query);
    const exercise = await this.findExerciseOrThrow(query.exercise);
    const hasComparison = query.compareFrom !== undefined;

    // Both ranges are read in parallel; each is three indexed top-1 lookups.
    const [mainRows, comparisonRows] = await Promise.all([
      this.records.findRecords({
        userId,
        exerciseId: exercise.id,
        from: query.from,
        to: query.to,
      }),
      hasComparison
        ? this.records.findRecords({
            userId,
            exerciseId: exercise.id,
            from: query.compareFrom,
            to: query.compareTo,
          })
        : Promise.resolve([]),
    ]);

    const records = this.toRecordSet(mainRows, query.unit);
    const result: RecordsResult = {
      data: {
        exercise,
        unit: query.unit,
        range: { from: query.from ?? null, to: query.to ?? null },
        records,
      },
    };
    if (hasComparison) {
      const comparedRecords = this.toRecordSet(comparisonRows, query.unit);
      result.data.comparison = {
        range: {
          from: query.compareFrom ?? null,
          to: query.compareTo ?? null,
        },
        records: comparedRecords,
        difference: difference(records, comparedRecords),
      };
    }
    if (hasNoRecords(records)) {
      result.message = NO_RECORDS_MESSAGE;
    }
    return result;
  }

  private async findExerciseOrThrow(name: string): Promise<ResolvedExercise> {
    const exercise = await this.exercises.findByName(name);
    if (!exercise) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        `Exercise "${name}" not found`,
      );
    }
    return exercise;
  }

  /** One row per metric at most; a metric without a row stays null. */
  private toRecordSet(rows: RecordRow[], unit: string): RecordSet {
    const recordSet: RecordSet = {
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    };
    for (const row of rows) {
      recordSet[RECORD_KEY_BY_METRIC[row.metric]] = this.toPersonalRecord(
        row,
        unit,
      );
    }
    return recordSet;
  }

  private toPersonalRecord(row: RecordRow, unit: string): PersonalRecord {
    return {
      value: this.toRequestedUnit(kgValueOf(row), unit),
      reps: row.reps,
      weight: this.toRequestedUnit(row.weight_kg, unit),
      performedAt: row.performed_at.toISOString(),
      localDate: row.local_date,
      entryId: row.entry_id,
      setIndex: row.set_index,
    };
  }

  private toRequestedUnit(valueKg: KgValue, unit: string): number {
    return toApiNumber(this.units.fromKg(valueKg.toString(), unit));
  }

  private validateRanges(query: PersonalRecordsQuery): void {
    const details: ErrorDetail[] = [];
    if (query.from && query.to && query.from > query.to) {
      details.push({ field: 'from', message: 'from must not be after to' });
    }

    const hasCompareFrom = query.compareFrom !== undefined;
    const hasCompareTo = query.compareTo !== undefined;
    if (hasCompareFrom !== hasCompareTo) {
      details.push({
        field: hasCompareFrom ? 'compareTo' : 'compareFrom',
        message: 'compareFrom and compareTo must be provided together',
      });
    } else if (
      query.compareFrom &&
      query.compareTo &&
      query.compareFrom > query.compareTo
    ) {
      details.push({
        field: 'compareFrom',
        message: 'compareFrom must not be after compareTo',
      });
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

/** The stored kg value of the metric this row is the record for. */
function kgValueOf(row: RecordRow): KgValue {
  switch (row.metric) {
    case 'weight':
      return row.weight_kg;
    case 'volume':
      return row.volume_kg;
    case 'e1rm':
      return row.e1rm_kg;
  }
}

function hasNoRecords(records: RecordSet): boolean {
  return Object.values(records).every((record) => record === null);
}

/** current − compared per metric (exact decimal math), null when either side is missing. */
export function difference(
  current: RecordSet,
  compared: RecordSet,
): RecordDifference {
  const differenceOf = (key: keyof RecordSet): number | null => {
    const currentRecord = current[key];
    const comparedRecord = compared[key];
    if (!currentRecord || !comparedRecord) return null;
    return toApiNumber(
      new Decimal(currentRecord.value).minus(comparedRecord.value),
    );
  };
  return {
    heaviestWeight: differenceOf('heaviestWeight'),
    highestVolume: differenceOf('highestVolume'),
    bestEstimated1RM: differenceOf('bestEstimated1RM'),
  };
}
