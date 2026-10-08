import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  IsNotInFuture,
  IsOffsetDateTime,
} from '../../common/time/offset-datetime.js';
import { SUPPORTED_UNITS } from '../../units/unit-registry.js';

export const MAX_ENTRIES_PER_REQUEST = 100;
export const MAX_SETS_PER_ENTRY = 50;
export const MAX_REPS = 1000;
export const MAX_WEIGHT = 2000;

export class UserParamsDto {
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, {
    message: 'userId must be 1-64 characters: letters, digits, _ or -',
  })
  userId: string;
}

export class WorkoutSetDto {
  @IsInt()
  @Min(1)
  @Max(MAX_REPS)
  reps: number;

  /** In the unit given by `unit`; up to 3 decimals (e.g. 2.5, 61.235). */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_WEIGHT)
  weight: number;

  // Accept any casing ("KG"); validated against the unit registry.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(SUPPORTED_UNITS, {
    message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}`,
  })
  unit: string;
}

export class WorkoutEntryDto {
  @IsDefined()
  @IsOffsetDateTime()
  @IsNotInFuture()
  date: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  exerciseName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SETS_PER_ENTRY)
  @ValidateNested({ each: true })
  @Type(() => WorkoutSetDto)
  sets: WorkoutSetDto[];
}

export class LogWorkoutsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ENTRIES_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => WorkoutEntryDto)
  entries: WorkoutEntryDto[];
}
