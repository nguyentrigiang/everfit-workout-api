import { HttpStatus, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { toApiNumber } from '../domain/decimal.js';
import {
  AppException,
  type ErrorDetail,
} from '../../../shared/errors/app.exception.js';
import { ErrorCode } from '../../../shared/errors/error-code.js';
import { ExerciseRepository } from '../../exercise/repositories/exercise.repository.js';
import { UnitConverter } from '../domain/units/unit-converter.js';
import type { PersonalRecordsQuery } from '../dto/requests/personal-records.query.js';
import {
  type RecordMetric,
  type RecordRow,
  PersonalRecordRepository,
} from '../repositories/personal-record.repository.js';
import {
  NO_RECORDS_MESSAGE,
  type RecordDifference,
  type RecordSet,
  type RecordsResult,
} from '../dto/responses/personal-record.responses.js';

const KEY_BY_METRIC: Record<RecordMetric, keyof RecordSet> = {
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

  async getRecords(
    userId: string,
    query: PersonalRecordsQuery,
  ): Promise<RecordsResult> {
    this.validateRanges(query);

    const exercise = await this.exercises.findByName(query.exercise);
    if (!exercise) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        `Exercise "${query.exercise}" not found`,
      );
    }

    const compare = query.compareFrom !== undefined;
    const [mainRows, compareRows] = await Promise.all([
      this.records.findRecords({
        userId,
        exerciseId: exercise.id,
        from: query.from,
        to: query.to,
      }),
      compare
        ? this.records.findRecords({
            userId,
            exerciseId: exercise.id,
            from: query.compareFrom,
            to: query.compareTo,
          })
        : Promise.resolve([]),
    ]);

    const records = this.toRecordSet(mainRows, query.unit);
    const compared = compare ? this.toRecordSet(compareRows, query.unit) : null;
    const empty = Object.values(records).every((r) => r === null);

    return {
      data: {
        exercise,
        unit: query.unit,
        range: { from: query.from ?? null, to: query.to ?? null },
        records,
        ...(compared && {
          comparison: {
            range: {
              from: query.compareFrom ?? null,
              to: query.compareTo ?? null,
            },
            records: compared,
            difference: difference(records, compared),
          },
        }),
      },
      ...(empty && { message: NO_RECORDS_MESSAGE }),
    };
  }

  private toRecordSet(rows: RecordRow[], unit: string): RecordSet {
    const set: RecordSet = {
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    };
    for (const row of rows) {
      const valueKg = {
        weight: row.weight_kg,
        volume: row.volume_kg,
        e1rm: row.e1rm_kg,
      }[row.metric];
      set[KEY_BY_METRIC[row.metric]] = {
        value: this.inUnit(valueKg, unit),
        reps: row.reps,
        weight: this.inUnit(row.weight_kg, unit),
        performedAt: row.performed_at.toISOString(),
        localDate: row.local_date,
        entryId: row.entry_id,
        setIndex: row.set_index,
      };
    }
    return set;
  }

  private inUnit(kg: { toString(): string }, unit: string): number {
    return toApiNumber(this.units.fromKg(kg.toString(), unit));
  }

  private validateRanges(query: PersonalRecordsQuery): void {
    const details: ErrorDetail[] = [];
    if (query.from && query.to && query.from > query.to) {
      details.push({ field: 'from', message: 'from must not be after to' });
    }
    if ((query.compareFrom === undefined) !== (query.compareTo === undefined)) {
      details.push({
        field: query.compareFrom === undefined ? 'compareFrom' : 'compareTo',
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

/** current − compared per metric (exact decimal math), null when either side is missing. */
export function difference(
  current: RecordSet,
  compared: RecordSet,
): RecordDifference {
  const diff = (key: keyof RecordSet) => {
    const a = current[key];
    const b = compared[key];
    return a && b ? toApiNumber(new Decimal(a.value).minus(b.value)) : null;
  };
  return {
    heaviestWeight: diff('heaviestWeight'),
    highestVolume: diff('highestVolume'),
    bestEstimated1RM: diff('bestEstimated1RM'),
  };
}
