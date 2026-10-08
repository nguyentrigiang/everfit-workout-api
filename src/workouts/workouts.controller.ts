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
import type { Response } from 'express';
import { ListWorkoutsQuery } from './dto/list-workouts.query.js';
import { LogWorkoutsDto, UserParamsDto } from './dto/log-workouts.dto.js';
import {
  type HistoryPage,
  type LogWorkoutsResult,
  WorkoutsService,
} from './workouts.service.js';

@Controller('users/:userId/workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  /** Bulk log. 201 if anything was created, 200 if every entry already existed (retry). */
  @Post()
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
  list(
    @Param() { userId }: UserParamsDto,
    @Query() query: ListWorkoutsQuery,
  ): Promise<HistoryPage> {
    return this.workouts.listHistory(userId, query);
  }
}
