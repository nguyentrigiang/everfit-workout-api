import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserParamsDto } from '../dto/requests/log-workouts.dto.js';
import { PersonalRecordsQuery } from '../dto/requests/personal-records.query.js';
import type { RecordsResult } from '../dto/responses/personal-record.responses.js';
import { PersonalRecordService } from '../services/personal-record.service.js';
import {
  GetPersonalRecordsDocs,
  PersonalRecordControllerDocs,
} from './personal-record.docs.js';

@PersonalRecordControllerDocs()
@Controller('users/:userId/records')
export class PersonalRecordController {
  constructor(private readonly records: PersonalRecordService) {}

  // Personal records for one exercise, optionally compared with a second date range.
  @Get()
  @GetPersonalRecordsDocs()
  getPersonalRecords(
    @Param() { userId }: UserParamsDto,
    @Query() query: PersonalRecordsQuery,
  ): Promise<RecordsResult> {
    return this.records.getPersonalRecords(userId, query);
  }
}
