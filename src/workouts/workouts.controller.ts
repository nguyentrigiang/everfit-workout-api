import { Body, Controller, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LogWorkoutsDto, UserParamsDto } from './dto/log-workouts.dto.js';
import { type LogWorkoutsResult, WorkoutsService } from './workouts.service.js';

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
}
