import type { ExercisesRepository } from '../exercises/exercises.repository.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UnitConverter } from '../units/unit-converter.js';
import { DEFAULT_UNIT_REGISTRY } from '../units/unit-registry.js';
import type { LogWorkoutsDto } from './dto/log-workouts.dto.js';
import type {
  StoredEntryRow,
  WorkoutsRepository,
} from './workouts.repository.js';
import { ListWorkoutsQuery } from './dto/list-workouts.query.js';
import { NO_WORKOUTS_MESSAGE, WorkoutsService } from './workouts.service.js';

const SQUAT = { id: 'ex-squat', name: 'Squat' };
const BENCH = { id: 'ex-bench', name: 'Bench Press' };

const dto: LogWorkoutsDto = {
  entries: [
    {
      date: '2026-10-01T08:00:00+07:00',
      exerciseName: 'Squat',
      sets: [{ reps: 5, weight: 100, unit: 'kg' }],
    },
    {
      date: '2026-10-01T08:30:00+07:00',
      exerciseName: 'Bench Press',
      sets: [{ reps: 5, weight: 80, unit: 'kg' }],
    },
  ],
};

const row = (
  exerciseId: string,
  date: string,
  extra: Partial<StoredEntryRow> = {},
): StoredEntryRow => ({
  id: `entry-${exerciseId}`,
  exerciseId,
  performedAt: new Date(date),
  localDate: '2026-10-01',
  ...extra,
});

function setup(inserted: StoredEntryRow[], existing: StoredEntryRow[]) {
  const workouts = {
    insertEntries: vi.fn().mockResolvedValue(inserted),
    findByNaturalKeys: vi.fn().mockResolvedValue(existing),
    insertSets: vi.fn().mockResolvedValue(undefined),
    findHistoryPage: vi.fn().mockResolvedValue([]),
    findSetsForEntries: vi.fn().mockResolvedValue([]),
  };
  const exercises = {
    resolveByNames: vi.fn().mockResolvedValue(
      new Map([
        ['squat', SQUAT],
        ['bench press', BENCH],
      ]),
    ),
    findIdsForFilter: vi.fn().mockResolvedValue([]),
    listMuscleGroupSlugs: vi.fn().mockResolvedValue(['chest', 'core']),
  };
  const prisma = {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  };
  const service = new WorkoutsService(
    prisma as unknown as PrismaService,
    exercises as unknown as ExercisesRepository,
    workouts as unknown as WorkoutsRepository,
    new UnitConverter(DEFAULT_UNIT_REGISTRY),
  );
  return { service, workouts, exercises };
}

describe('WorkoutsService.logWorkouts', () => {
  it('counts created and duplicate entries from their status', async () => {
    const { service, workouts } = setup(
      [row(SQUAT.id, '2026-10-01T01:00:00Z')],
      [row(BENCH.id, '2026-10-01T01:30:00Z', { setCount: 3 })],
    );

    const result = await service.logWorkouts('user-1', dto);

    expect(result.summary).toEqual({ created: 1, duplicates: 1 });
    expect(result.entries.map((e) => [e.index, e.status, e.setCount])).toEqual([
      [0, 'created', 1],
      [1, 'duplicate', 3],
    ]);
    // Sets are written only for the created entry.
    expect(workouts.insertSets).toHaveBeenCalledWith({}, [
      expect.objectContaining({ entryId: `entry-${SQUAT.id}` }),
    ]);
  });

  it('fails without a summary or sets when an entry is neither inserted nor found', async () => {
    const { service, workouts } = setup(
      [row(SQUAT.id, '2026-10-01T01:00:00Z')],
      [],
    );

    await expect(service.logWorkouts('user-1', dto)).rejects.toThrow(
      'neither inserted nor found',
    );
    expect(workouts.insertSets).not.toHaveBeenCalled();
  });
});

describe('WorkoutsService.listHistory', () => {
  const query = (extra: Partial<ListWorkoutsQuery>) =>
    Object.assign(new ListWorkoutsQuery(), { limit: 20, unit: 'kg' }, extra);

  it('returns an empty page without reading history when no exercise matches the filter', async () => {
    const { service, workouts, exercises } = setup([], []);

    const page = await service.listHistory(
      'user-1',
      query({ exercise: 'zzzz', muscleGroup: 'core' }),
    );

    expect(exercises.findIdsForFilter).toHaveBeenCalledWith(expect.anything(), {
      nameContains: 'zzzz',
      muscleGroup: 'core',
    });
    expect(workouts.findHistoryPage).not.toHaveBeenCalled();
    expect(page).toEqual({
      data: [],
      pagination: { limit: 20, hasMore: false, nextCursor: null },
      message: NO_WORKOUTS_MESSAGE,
    });
  });

  it('reads history only for the exercises that match the filter', async () => {
    const { service, workouts, exercises } = setup([], []);
    exercises.findIdsForFilter.mockResolvedValue([SQUAT.id]);

    await service.listHistory('user-1', query({ exercise: 'squat' }));

    expect(workouts.findHistoryPage).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseIds: [SQUAT.id] }),
    );
  });

  it('does not resolve exercise ids when no exercise filter is given', async () => {
    const { service, workouts, exercises } = setup([], []);

    await service.listHistory('user-1', query({}));

    expect(exercises.findIdsForFilter).not.toHaveBeenCalled();
    expect(workouts.findHistoryPage).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseIds: undefined }),
    );
  });
});
