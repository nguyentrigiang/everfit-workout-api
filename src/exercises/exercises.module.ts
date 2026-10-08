import { Module } from '@nestjs/common';
import { ExercisesRepository } from './exercises.repository.js';

@Module({
  providers: [ExercisesRepository],
  exports: [ExercisesRepository],
})
export class ExercisesModule {}
