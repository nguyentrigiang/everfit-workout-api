import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponse,
  ApiExampleResponse,
} from '../../../shared/swagger/api-responses.js';
import {
  HISTORY_CURSOR_ERROR_EXAMPLE,
  HISTORY_EMPTY_EXAMPLE,
  HISTORY_ERROR_EXAMPLE,
  HISTORY_EXAMPLE,
  LOG_CREATED_EXAMPLE,
  LOG_DUPLICATE_EXAMPLE,
  LOG_REQUEST_EXAMPLE,
  LOG_VALIDATION_ERROR_EXAMPLE,
} from './api-examples.js';
import { LogWorkoutsDto } from '../dto/requests/log-workouts.dto.js';
import { ApiUserIdParam } from './user-id.param.js';

/*
 * The Swagger CLI plugin (nest-cli.json) only sees decorators written directly on a
 * handler, not the ones applied here. So handler comments in the controller are `//`,
 * not JSDoc: introspectComments would turn JSDoc into the operation summary and override
 * the one set here. The plugin also adds its own bare response entries, which merge into
 * the explicit ones below. Vitest does not run the plugin, so after changing docs, diff
 * the built app's /docs-json against the previous output.
 */

/** Swagger docs for WorkoutController (class level). */
export const WorkoutControllerDocs = () =>
  applyDecorators(ApiTags('workouts'), ApiUserIdParam());

/** Swagger docs for POST /users/:userId/workouts. */
export const LogWorkoutsDocs = () =>
  applyDecorators(
    ApiOperation({
      // Stable id for generated clients, independent of class names.
      operationId: 'logWorkouts',
      summary: 'Log workouts (bulk)',
      description:
        'Logs one or more exercises in a single all-or-nothing transaction. Weights are stored in kg next to the original value. ' +
        'An entry with the same user, exercise and date as an existing one is not stored again: it is reported as `duplicate` with the existing id.',
    }),
    ApiBody({
      type: LogWorkoutsDto,
      examples: {
        deadlift: { summary: 'Mixed units', value: LOG_REQUEST_EXAMPLE },
      },
    }),
    ApiExampleResponse(201, 'At least one entry was created', {
      created: { summary: 'Created', value: LOG_CREATED_EXAMPLE },
    }),
    ApiExampleResponse(200, 'Every entry already existed (safe retry)', {
      duplicate: { summary: 'All duplicates', value: LOG_DUPLICATE_EXAMPLE },
    }),
    ApiErrorResponse(
      400,
      'Invalid request; nothing was stored',
      LOG_VALIDATION_ERROR_EXAMPLE,
    ),
    ApiErrorResponse(413, 'Request body larger than 1 MB', {
      ...LOG_VALIDATION_ERROR_EXAMPLE,
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      error: 'Payload Too Large',
      message: 'request entity too large',
      details: [],
    }),
  );

/** Swagger docs for GET /users/:userId/workouts. */
export const ListWorkoutHistoryDocs = () =>
  applyDecorators(
    ApiOperation({
      operationId: 'listWorkouts',
      summary: 'Workout history',
      description:
        'Entries newest first with their sets. Filters: partial exercise name, muscle group slug, ' +
        'local calendar date range. Keyset pagination: pass `pagination.nextCursor` as `cursor`.',
    }),
    ApiExampleResponse(
      200,
      'A page of entries (empty list with a message when nothing matches)',
      {
        page: { summary: 'Page in lb', value: HISTORY_EXAMPLE },
        empty: { summary: 'No data in range', value: HISTORY_EMPTY_EXAMPLE },
      },
    ),
    ApiErrorResponse(
      400,
      'Invalid filter or unit (VALIDATION_ERROR) or invalid cursor (BAD_REQUEST)',
      {
        filter: {
          summary: 'Unknown muscle group',
          value: HISTORY_ERROR_EXAMPLE,
        },
        cursor: {
          summary: 'Invalid cursor',
          value: HISTORY_CURSOR_ERROR_EXAMPLE,
        },
      },
      true,
    ),
  );
