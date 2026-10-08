import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserParamsDto } from '../workouts/dto/log-workouts.dto.js';
import { RecordsQuery } from './dto/records.query.js';
import { type RecordsResult, RecordsService } from './records.service.js';

@Controller('users/:userId/records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  /** Personal records for one exercise, optionally compared with a second date range. */
  @Get()
  get(
    @Param() { userId }: UserParamsDto,
    @Query() query: RecordsQuery,
  ): Promise<RecordsResult> {
    return this.records.getRecords(userId, query);
  }
}
