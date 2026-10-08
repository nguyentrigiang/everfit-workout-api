import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module.js';
import { RecordsController } from './records.controller.js';
import { RecordsRepository } from './records.repository.js';
import { RecordsService } from './records.service.js';

@Module({
  imports: [ExercisesModule],
  controllers: [RecordsController],
  providers: [RecordsService, RecordsRepository],
})
export class RecordsModule {}
