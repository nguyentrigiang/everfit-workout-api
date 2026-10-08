import { Module } from '@nestjs/common';
import { ExerciseRepository } from './repositories/exercise.repository.js';

@Module({
  providers: [ExerciseRepository],
  exports: [ExerciseRepository],
})
export class ExerciseModule {}
