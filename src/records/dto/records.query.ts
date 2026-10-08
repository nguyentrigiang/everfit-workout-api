import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsCalendarDate } from '../../common/time/calendar-date.js';
import { SUPPORTED_UNITS, type WeightUnit } from '../../units/unit-registry.js';

export class RecordsQuery {
  /** Exercise name; matched exactly on the normalized form. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  exercise: string;

  /** Main range (calendar dates on local_date, inclusive). Omit for all history. */
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;

  /** Optional second range to compare against; both bounds required together. */
  @IsOptional()
  @IsCalendarDate()
  compareFrom?: string;

  @IsOptional()
  @IsCalendarDate()
  compareTo?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(SUPPORTED_UNITS, {
    message: `unit must be one of: ${SUPPORTED_UNITS.join(', ')}`,
  })
  unit: WeightUnit = 'kg';
}
