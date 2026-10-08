import { Module } from '@nestjs/common';
import { ExerciseModule } from '../exercise/exercise.module.js';
import { PersonalRecordController } from './controllers/personal-record.controller.js';
import { WorkoutController } from './controllers/workout.controller.js';
import { UnitConverter } from './domain/units/unit-converter.js';
import { DEFAULT_UNIT_REGISTRY } from './domain/units/unit-registry.js';
import { PersonalRecordRepository } from './repositories/personal-record.repository.js';
import { WorkoutRepository } from './repositories/workout.repository.js';
import { PersonalRecordService } from './services/personal-record.service.js';
import { WorkoutService } from './services/workout.service.js';

/**
 * Workout tracking: logging, history and personal records. Depends on ExerciseModule
 * for the exercise catalog; nothing depends back on it.
 */
@Module({
  imports: [ExerciseModule],
  controllers: [WorkoutController, PersonalRecordController],
  providers: [
    WorkoutService,
    WorkoutRepository,
    PersonalRecordService,
    PersonalRecordRepository,
    // Built from the same registry that request validation uses (single source).
    {
      provide: UnitConverter,
      useValue: new UnitConverter(DEFAULT_UNIT_REGISTRY),
    },
  ],
})
export class WorkoutModule {}
