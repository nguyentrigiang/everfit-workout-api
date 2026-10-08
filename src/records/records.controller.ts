import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse, ApiExampleResponse } from '../docs/api-responses.js';
import {
  RECORDS_EMPTY_EXAMPLE,
  RECORDS_EXAMPLE,
  RECORDS_NOT_FOUND_EXAMPLE,
  RECORDS_VALIDATION_ERROR_EXAMPLE,
} from '../docs/examples.js';
import { UserParamsDto } from '../workouts/dto/log-workouts.dto.js';
import { RecordsQuery } from './dto/records.query.js';
import { type RecordsResult, RecordsService } from './records.service.js';

@ApiTags('records')
@ApiParam({
  name: 'userId',
  example: 'demo-coach-1',
  description: '1-64 chars: letters, digits, _ or -',
})
@Controller('users/:userId/records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  /** Personal records for one exercise, optionally compared with a second date range. */
  @Get()
  @ApiOperation({
    summary: 'Personal records for an exercise',
    description:
      'Heaviest set, highest set volume (reps × weight) and best estimated 1RM (Epley), each with the set and date. ' +
      'Without from/to: all history. Add compareFrom/compareTo (e.g. last month) to get per-metric differences. ' +
      'Ties go to the most recent set.',
  })
  @ApiExampleResponse(200, 'Records (null when the range has no sets)', {
    compare: { summary: 'This month vs last month', value: RECORDS_EXAMPLE },
    empty: { summary: 'No data in range', value: RECORDS_EMPTY_EXAMPLE },
  })
  @ApiErrorResponse(404, 'Unknown exercise', RECORDS_NOT_FOUND_EXAMPLE)
  @ApiErrorResponse(
    400,
    'Invalid range, unit or missing exercise',
    RECORDS_VALIDATION_ERROR_EXAMPLE,
  )
  get(
    @Param() { userId }: UserParamsDto,
    @Query() query: RecordsQuery,
  ): Promise<RecordsResult> {
    return this.records.getRecords(userId, query);
  }
}
