import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { IsCalendarDate } from '../../domain/time/calendar-date.js';
import {
  SUPPORTED_UNITS,
  type WeightUnit,
} from '../../domain/units/unit-registry.js';

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
  @ApiPropertyOptional({ format: 'date', example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-10-31' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ApiPropertyOptional({ enum: SUPPORTED_UNITS, default: 'kg' })
  @IsIn(SUPPORTED_UNITS, {
    message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}`,
  })
  unit: WeightUnit = 'kg';

  @ApiPropertyOptional({
    type: 'integer',
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
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
