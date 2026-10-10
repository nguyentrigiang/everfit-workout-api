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
import { ListWorkoutsQuery } from '../dto/requests/list-workouts.query.js';
import {
  LogWorkoutsDto,
  UserParamsDto,
} from '../dto/requests/log-workouts.dto.js';
import type {
  HistoryPage,
  LogWorkoutsResult,
} from '../dto/responses/workout.responses.js';
import { WorkoutService } from '../services/workout.service.js';
import {
  ListWorkoutHistoryDocs,
  LogWorkoutsDocs,
  WorkoutControllerDocs,
} from './workout.docs.js';

@WorkoutControllerDocs()
@Controller('users/:userId/workouts')
export class WorkoutController {
  constructor(private readonly workouts: WorkoutService) {}

  // Bulk log. 201 if anything was created, 200 if every entry already existed (retry).
  @Post()
  @LogWorkoutsDocs()
  async logWorkouts(
    @Param() { userId }: UserParamsDto,
    @Body() body: LogWorkoutsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: LogWorkoutsResult }> {
    const result = await this.workouts.logWorkouts(userId, body);
    res.status(result.summary.created > 0 ? HttpStatus.CREATED : HttpStatus.OK);
    return { data: result };
  }

  // History, newest first, with filters, unit conversion and cursor pagination.
  @Get()
  @ListWorkoutHistoryDocs()
  listWorkouts(
    @Param() { userId }: UserParamsDto,
    @Query() query: ListWorkoutsQuery,
  ): Promise<HistoryPage> {
    return this.workouts.listWorkouts(userId, query);
  }
}
