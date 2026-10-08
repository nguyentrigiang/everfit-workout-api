import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { IsCalendarDate } from '../../common/time/calendar-date.js';
import { SUPPORTED_UNITS, type WeightUnit } from '../../units/unit-registry.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListWorkoutsQuery {
  /** Case-insensitive partial match on the exercise name. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  exercise?: string;

  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'muscleGroup must be a muscle group slug, e.g. chest',
  })
  muscleGroup?: string;

  /** Inclusive, compared with the client's local calendar date. */
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(SUPPORTED_UNITS, {
    message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}`,
  })
  unit: WeightUnit = 'kg';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  /** Opaque value from `pagination.nextCursor`; an empty string is rejected, not ignored. */
  @IsOptional()
  @IsString()
  @Length(1, 512)
  cursor?: string;
}
