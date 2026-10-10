import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponse,
  ApiExampleResponse,
} from '../../../shared/swagger/api-responses.js';
import {
  RECORDS_EMPTY_EXAMPLE,
  RECORDS_EXAMPLE,
  RECORDS_NOT_FOUND_EXAMPLE,
  RECORDS_VALIDATION_ERROR_EXAMPLE,
} from './api-examples.js';
import { ApiUserIdParam } from './user-id.param.js';

/*
 * The Swagger CLI plugin (nest-cli.json) only sees decorators written directly on a
 * handler, not the ones applied here. So handler comments in the controller are `//`,
 * not JSDoc: introspectComments would turn JSDoc into the operation summary and override
 * the one set here. The plugin also adds its own bare response entries, which merge into
 * the explicit ones below. Vitest does not run the plugin, so after changing docs, diff
 * the built app's /docs-json against the previous output.
 */

/** Swagger docs for PersonalRecordController (class level). */
export const PersonalRecordControllerDocs = () =>
  applyDecorators(ApiTags('records'), ApiUserIdParam());

/** Swagger docs for GET /users/:userId/records. */
export const GetPersonalRecordsDocs = () =>
  applyDecorators(
    ApiOperation({
      operationId: 'getPersonalRecords',
      summary: 'Personal records for an exercise',
      description:
        'Heaviest set, highest set volume (reps × weight) and best estimated 1RM (Epley), each with the set and date. ' +
        'Without from/to: all history. Add compareFrom/compareTo (e.g. last month) to get per-metric differences. ' +
        'Ties go to the most recent set.',
    }),
    ApiExampleResponse(200, 'Records (null when the range has no sets)', {
      compare: { summary: 'This month vs last month', value: RECORDS_EXAMPLE },
      empty: { summary: 'No data in range', value: RECORDS_EMPTY_EXAMPLE },
    }),
    ApiErrorResponse(404, 'Unknown exercise', RECORDS_NOT_FOUND_EXAMPLE),
    ApiErrorResponse(
      400,
      'Invalid range, unit or missing exercise',
      RECORDS_VALIDATION_ERROR_EXAMPLE,
    ),
  );
