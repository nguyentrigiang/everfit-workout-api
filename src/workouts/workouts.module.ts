import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module.js';
import { WorkoutsController } from './workouts.controller.js';
import { WorkoutsRepository } from './workouts.repository.js';
import { WorkoutsService } from './workouts.service.js';

@Module({
  imports: [ExercisesModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutsRepository],
})
export class WorkoutsModule {}
