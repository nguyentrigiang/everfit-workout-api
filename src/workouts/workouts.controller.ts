import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponse, ApiExampleResponse } from '../docs/api-responses.js';
import {
  HISTORY_CURSOR_ERROR_EXAMPLE,
  HISTORY_EMPTY_EXAMPLE,
  HISTORY_ERROR_EXAMPLE,
  HISTORY_EXAMPLE,
  LOG_CREATED_EXAMPLE,
  LOG_DUPLICATE_EXAMPLE,
  LOG_REQUEST_EXAMPLE,
  LOG_VALIDATION_ERROR_EXAMPLE,
} from '../docs/examples.js';
import { ListWorkoutsQuery } from './dto/list-workouts.query.js';
import { LogWorkoutsDto, UserParamsDto } from './dto/log-workouts.dto.js';
import {
  type HistoryPage,
  type LogWorkoutsResult,
  WorkoutsService,
} from './workouts.service.js';

@ApiTags('workouts')
@ApiParam({
  name: 'userId',
  example: 'demo-coach-1',
  description: '1-64 chars: letters, digits, _ or -',
})
@Controller('users/:userId/workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  /** Bulk log. 201 if anything was created, 200 if every entry already existed (retry). */
  @Post()
  @ApiOperation({
    summary: 'Log workouts (bulk)',
    description:
      'Logs one or more exercises in a single all-or-nothing transaction. Weights are stored in kg next to the original value. ' +
      'An entry with the same user, exercise and date as an existing one is not stored again: it is reported as `duplicate` with the existing id.',
  })
  @ApiBody({
    type: LogWorkoutsDto,
    examples: {
      deadlift: { summary: 'Mixed units', value: LOG_REQUEST_EXAMPLE },
    },
  })
  @ApiExampleResponse(201, 'At least one entry was created', {
    created: { summary: 'Created', value: LOG_CREATED_EXAMPLE },
  })
  @ApiExampleResponse(200, 'Every entry already existed (safe retry)', {
    duplicate: { summary: 'All duplicates', value: LOG_DUPLICATE_EXAMPLE },
  })
  @ApiErrorResponse(
    400,
    'Invalid request; nothing was stored',
    LOG_VALIDATION_ERROR_EXAMPLE,
  )
  @ApiErrorResponse(413, 'Request body larger than 1 MB', {
    ...LOG_VALIDATION_ERROR_EXAMPLE,
    statusCode: 413,
    code: 'PAYLOAD_TOO_LARGE',
    error: 'Payload Too Large',
    message: 'request entity too large',
    details: [],
  })
  async log(
    @Param() { userId }: UserParamsDto,
    @Body() body: LogWorkoutsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: LogWorkoutsResult }> {
    const result = await this.workouts.logWorkouts(userId, body);
    res.status(result.summary.created > 0 ? HttpStatus.CREATED : HttpStatus.OK);
    return { data: result };
  }

  /** History, newest first, with filters, unit conversion and cursor pagination. */
  @Get()
  @ApiOperation({
    summary: 'Workout history',
    description:
      'Entries newest first with their sets. Filters: partial exercise name, muscle group slug, ' +
      'local calendar date range. Keyset pagination: pass `pagination.nextCursor` as `cursor`.',
  })
  @ApiExampleResponse(
    200,
    'A page of entries (empty list with a message when nothing matches)',
    {
      page: { summary: 'Page in lb', value: HISTORY_EXAMPLE },
      empty: { summary: 'No data in range', value: HISTORY_EMPTY_EXAMPLE },
    },
  )
  @ApiErrorResponse(
    400,
    'Invalid filter or unit (VALIDATION_ERROR) or invalid cursor (BAD_REQUEST)',
    {
      filter: { summary: 'Unknown muscle group', value: HISTORY_ERROR_EXAMPLE },
      cursor: {
        summary: 'Invalid cursor',
        value: HISTORY_CURSOR_ERROR_EXAMPLE,
      },
    },
    true,
  )
  list(
    @Param() { userId }: UserParamsDto,
    @Query() query: ListWorkoutsQuery,
  ): Promise<HistoryPage> {
    return this.workouts.listHistory(userId, query);
  }
}
