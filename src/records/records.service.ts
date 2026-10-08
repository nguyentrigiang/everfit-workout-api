import { HttpStatus, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { toApiNumber } from '../common/decimal.js';
import {
  AppException,
  type ErrorDetail,
} from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { ExercisesRepository } from '../exercises/exercises.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnitConverter } from '../units/unit-converter.js';
import type { RecordsQuery } from './dto/records.query.js';
import {
  type RecordMetric,
  type RecordRow,
  RecordsRepository,
} from './records.repository.js';

export interface PersonalRecord {
  value: number;
  reps: number;
  weight: number;
  performedAt: string;
  localDate: string;
  entryId: string;
  setIndex: number;
}

export interface RecordSet {
  heaviestWeight: PersonalRecord | null;
  highestVolume: PersonalRecord | null;
  bestEstimated1RM: PersonalRecord | null;
}

export type RecordDifference = Record<keyof RecordSet, number | null>;

interface DateRange {
  from: string | null;
  to: string | null;
}

export interface RecordsResult {
  data: {
    exercise: { id: string; name: string };
    unit: string;
    range: DateRange;
    records: RecordSet;
    comparison?: {
      range: DateRange;
      records: RecordSet;
      difference: RecordDifference;
    };
  };
  message?: string;
}

export const NO_RECORDS_MESSAGE =
  'No workouts found for this exercise in the given range';

const KEY_BY_METRIC: Record<RecordMetric, keyof RecordSet> = {
  weight: 'heaviestWeight',
  volume: 'highestVolume',
  e1rm: 'bestEstimated1RM',
};

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesRepository,
    private readonly records: RecordsRepository,
    private readonly units: UnitConverter,
  ) {}

  async getRecords(
    userId: string,
    query: RecordsQuery,
  ): Promise<RecordsResult> {
    this.validateRanges(query);

    const exercise = await this.exercises.findByName(
      this.prisma,
      query.exercise,
    );
    if (!exercise) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        `Exercise "${query.exercise}" not found`,
      );
    }

    const compare = query.compareFrom !== undefined;
    const [mainRows, compareRows] = await Promise.all([
      this.records.findRecords(this.prisma, {
        userId,
        exerciseId: exercise.id,
        from: query.from,
        to: query.to,
      }),
      compare
        ? this.records.findRecords(this.prisma, {
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

  private validateRanges(query: RecordsQuery): void {
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
