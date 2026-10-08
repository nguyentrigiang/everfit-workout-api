import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsCalendarDate } from '../validators/date.validators.js';
import {
  SUPPORTED_UNITS,
  type WeightUnit,
} from '../../domain/units/unit-registry.js';

export class PersonalRecordsQuery {
  /** Exercise name; matched exactly on the normalized form. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  exercise: string;

  /** Main range (calendar dates on local_date, inclusive). Omit for all history. */
  @ApiPropertyOptional({ format: 'date', example: '2026-10-01' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-10-31' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  /** Optional second range to compare against; both bounds required together. */
  @ApiPropertyOptional({ format: 'date', example: '2026-09-01' })
  @IsOptional()
  @IsCalendarDate()
  compareFrom?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-09-30' })
  @IsOptional()
  @IsCalendarDate()
  compareTo?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ApiPropertyOptional({ enum: SUPPORTED_UNITS, default: 'kg' })
  @IsIn(SUPPORTED_UNITS, {
    message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}`,
  })
  unit: WeightUnit = 'kg';
}
