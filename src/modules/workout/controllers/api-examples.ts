// Response examples for Swagger, taken from real responses of the running API.
import { encodeCursor } from '../services/history-cursor.js';

const entryId = '7b7e7eb5-5b90-4475-980d-1e59309d8207';
const exercise = {
  id: 'e3e83b8f-abc9-4fd9-8030-76602d298a63',
  name: 'Deadlift',
};

const error = (
  statusCode: number,
  code: string,
  error: string,
  message: string,
  details: { field?: string; message: string }[],
  path: string,
) => ({
  statusCode,
  code,
  error,
  message,
  details,
  path,
  timestamp: '2026-10-08T07:00:00.000Z',
  requestId: '1af98283-e5f5-407e-a0ab-255dfa7c1ba3',
});

export const LOG_REQUEST_EXAMPLE = {
  entries: [
    {
      date: '2026-10-05T18:00:00+07:00',
      exerciseName: 'Deadlift',
      sets: [
        { reps: 5, weight: 315, unit: 'lb' },
        { reps: 3, weight: 160, unit: 'kg' },
      ],
    },
  ],
};

const loggedEntry = (status: 'created' | 'duplicate') => ({
  index: 0,
  id: entryId,
  status,
  exercise,
  performedAt: '2026-10-05T11:00:00.000Z',
  localDate: '2026-10-05',
  setCount: 2,
});

export const LOG_CREATED_EXAMPLE = {
  data: {
    entries: [loggedEntry('created')],
    summary: { created: 1, duplicates: 0 },
  },
};

export const LOG_DUPLICATE_EXAMPLE = {
  data: {
    entries: [loggedEntry('duplicate')],
    summary: { created: 0, duplicates: 1 },
  },
};

export const LOG_VALIDATION_ERROR_EXAMPLE = error(
  400,
  'VALIDATION_ERROR',
  'Bad Request',
  'Validation failed',
  [
    {
      field: 'entries[0].sets[0].unit',
      message: 'unit must be one of: kg, lb',
    },
    {
      field: 'entries[0].date',
      message:
        'date must be an ISO 8601 datetime with a UTC offset, e.g. 2026-10-07T07:30:00+07:00',
    },
  ],
  '/api/v1/users/demo-coach-1/workouts',
);

export const HISTORY_EXAMPLE = {
  data: [
    {
      id: entryId,
      exercise: {
        ...exercise,
        muscleGroups: ['back', 'hamstrings', 'glutes', 'traps'],
      },
      performedAt: '2026-10-05T11:00:00.000Z',
      localDate: '2026-10-05',
      sets: [
        {
          setIndex: 0,
          reps: 5,
          weight: 315,
          unit: 'lb',
          volume: 1575,
          e1rm: 367.5,
        },
        {
          setIndex: 1,
          reps: 3,
          weight: 352.74,
          unit: 'lb',
          volume: 1058.22,
          e1rm: 388.01,
        },
      ],
    },
  ],
  pagination: {
    limit: 1,
    hasMore: true,
    nextCursor: encodeCursor({
      performedAt: new Date('2026-10-05T11:00:00.000Z'),
      id: entryId,
    }),
  },
};

export const HISTORY_EMPTY_EXAMPLE = {
  data: [],
  pagination: { limit: 20, hasMore: false, nextCursor: null },
  message: 'No workouts found for the given filters',
};

export const HISTORY_ERROR_EXAMPLE = error(
  400,
  'VALIDATION_ERROR',
  'Bad Request',
  'Validation failed',
  [
    {
      field: 'muscleGroup',
      message:
        'muscleGroup must be one of: chest, back, shoulders, biceps, triceps, forearms, core, quads, hamstrings, glutes, calves, traps',
    },
  ],
  '/api/v1/users/demo-coach-1/workouts?muscleGroup=wings',
);

const septemberEntryId = '3c1d2a4e-8f6b-4c1e-9a7d-2b5e6f7a8c9d';

const pr = (
  value: number,
  reps: number,
  weight: number,
  setIndex: number,
  at: { performedAt: string; localDate: string; entryId: string } = {
    performedAt: '2026-10-05T11:00:00.000Z',
    localDate: '2026-10-05',
    entryId,
  },
) => ({ value, reps, weight, ...at, setIndex });

const september = {
  performedAt: '2026-09-14T11:00:00.000Z',
  localDate: '2026-09-14',
  entryId: septemberEntryId,
};

export const RECORDS_EXAMPLE = {
  data: {
    exercise,
    unit: 'kg',
    range: { from: '2026-10-01', to: '2026-10-31' },
    records: {
      heaviestWeight: pr(160, 3, 160, 1),
      highestVolume: pr(714.41, 5, 142.88, 0),
      bestEstimated1RM: pr(176, 3, 160, 1),
    },
    comparison: {
      range: { from: '2026-09-01', to: '2026-09-30' },
      records: {
        heaviestWeight: pr(150, 3, 150, 0, september),
        highestVolume: pr(700, 5, 140, 0, september),
        bestEstimated1RM: pr(165, 3, 150, 0, september),
      },
      difference: {
        heaviestWeight: 10,
        highestVolume: 14.41,
        bestEstimated1RM: 11,
      },
    },
  },
};

export const RECORDS_EMPTY_EXAMPLE = {
  data: {
    exercise,
    unit: 'kg',
    range: { from: '2025-01-01', to: '2025-01-31' },
    records: {
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    },
  },
  message: 'No workouts found for this exercise in the given range',
};

export const RECORDS_NOT_FOUND_EXAMPLE = error(
  404,
  'NOT_FOUND',
  'Not Found',
  'Exercise "zercher" not found',
  [],
  '/api/v1/users/demo-coach-1/records?exercise=zercher',
);

export const HISTORY_CURSOR_ERROR_EXAMPLE = error(
  400,
  'BAD_REQUEST',
  'Bad Request',
  'Invalid cursor',
  [{ field: 'cursor', message: 'cursor is malformed or expired' }],
  '/api/v1/users/demo-coach-1/workouts?cursor=nope',
);

export const RECORDS_VALIDATION_ERROR_EXAMPLE = error(
  400,
  'VALIDATION_ERROR',
  'Bad Request',
  'Validation failed',
  [
    {
      field: 'compareTo',
      message: 'compareFrom and compareTo must be provided together',
    },
  ],
  '/api/v1/users/demo-coach-1/records?exercise=deadlift&compareFrom=2026-09-01',
);
