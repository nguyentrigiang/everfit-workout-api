import { Type, plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsString,
  Min,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { ErrorCode } from '../../shared/errors/error-code.js';
import {
  flattenValidationErrors,
  validationExceptionFactory,
} from './validation-exception.factory.js';

// Minimal nested payload shaped like a bulk workout request.
class SetDto {
  @IsInt()
  @Min(1)
  reps: number;

  @Min(0)
  weight: number;
}

class EntryDto {
  @ValidateNested({ each: true })
  @Type(() => SetDto)
  sets: SetDto[];
}

class BodyDto {
  @IsString()
  userId: string;

  @ValidateNested({ each: true })
  @Type(() => EntryDto)
  entries: EntryDto[];
}

function errorsFor(payload: object) {
  return validateSync(plainToInstance(BodyDto, payload));
}

const validSet = { reps: 5, weight: 100 };

describe('flattenValidationErrors', () => {
  it('uses the property name for top-level fields', () => {
    const details = flattenValidationErrors(
      errorsFor({ userId: 42, entries: [] }),
    );

    expect(details).toEqual([
      { field: 'userId', message: 'userId must be a string' },
    ]);
  });

  it('builds a full path with array indexes for nested fields', () => {
    const details = flattenValidationErrors(
      errorsFor({
        userId: 'u1',
        entries: [{ sets: [validSet, validSet, { reps: 5, weight: -10 }] }],
      }),
    );

    expect(details).toEqual([
      {
        field: 'entries[0].sets[2].weight',
        message: 'weight must not be less than 0',
      },
    ]);
  });

  it('returns one detail per failed constraint on the same field', () => {
    const details = flattenValidationErrors(
      errorsFor({
        userId: 'u1',
        entries: [{ sets: [{ reps: 0.5, weight: 1 }] }],
      }),
    );

    expect(details.map((d) => d.field)).toEqual([
      'entries[0].sets[0].reps',
      'entries[0].sets[0].reps',
    ]);
  });
});

describe('validationExceptionFactory', () => {
  it('returns a 400 VALIDATION_ERROR carrying the details', () => {
    const exception = validationExceptionFactory(
      errorsFor({ userId: 42, entries: [] }),
    );

    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(exception.details).toHaveLength(1);
  });
});
