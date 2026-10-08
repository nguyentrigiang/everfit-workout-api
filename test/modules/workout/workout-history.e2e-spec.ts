import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../../utils/create-test-app.js';

interface EntryInput {
  date: string;
  exerciseName: string;
  sets?: { reps: number; weight: number; unit: string }[];
}

describe('GET /api/v1/users/:userId/workouts (e2e)', () => {
  let app: INestApplication<App>;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    userId = `u-${randomUUID()}`;
  });

  const log = async (entries: EntryInput[], user = userId) => {
    await request(app.getHttpServer())
      .post(`/api/v1/users/${user}/workouts`)
      .send({
        entries: entries.map((e) => ({
          sets: [{ reps: 5, weight: 100, unit: 'kg' }],
          ...e,
        })),
      })
      .expect(201);
  };

  const list = (query: Record<string, string | number> = {}, user = userId) =>
    request(app.getHttpServer())
      .get(`/api/v1/users/${user}/workouts`)
      .query(query);

  const names = (body: { data: { exercise: { name: string } }[] }) =>
    body.data.map((e) => e.exercise.name);

  it('lists entries newest first with their sets in order (F2.1)', async () => {
    await log([
      { date: '2026-10-01T07:00:00+07:00', exerciseName: 'Squat' },
      {
        date: '2026-10-03T07:00:00+07:00',
        exerciseName: 'Bench Press',
        sets: [
          { reps: 5, weight: 100, unit: 'kg' },
          { reps: 3, weight: 110, unit: 'kg' },
        ],
      },
    ]);

    const res = await list().expect(200);

    expect(names(res.body)).toEqual(['Bench Press', 'Squat']);
    expect(res.body.data[0]).toMatchObject({
      performedAt: '2026-10-03T00:00:00.000Z',
      localDate: '2026-10-03',
      exercise: { muscleGroups: ['chest', 'shoulders', 'triceps'] },
    });
    expect(
      res.body.data[0].sets.map((s: { setIndex: number }) => s.setIndex),
    ).toEqual([0, 1]);
    expect(res.body.message).toBeUndefined();
  });

  it('filters by partial, case-insensitive exercise name (F2.2)', async () => {
    await log([
      { date: '2026-10-01T07:00:00+07:00', exerciseName: 'Bench Press' },
      {
        date: '2026-10-02T07:00:00+07:00',
        exerciseName: 'Incline Bench Press',
      },
      { date: '2026-10-03T07:00:00+07:00', exerciseName: 'Squat' },
    ]);

    const res = await list({ exercise: 'BENCH' }).expect(200);

    expect(names(res.body)).toEqual(['Incline Bench Press', 'Bench Press']);
  });

  it('treats LIKE wildcards in the search literally', async () => {
    await log([{ date: '2026-10-01T07:00:00+07:00', exerciseName: 'Squat' }]);

    const res = await list({ exercise: '%' }).expect(200);

    expect(res.body.data).toEqual([]);
  });

  it('filters by inclusive local calendar dates (F2.3)', async () => {
    await log([
      // 6am Oct 1 in UTC+7 is Sep 30 in UTC: it belongs to October locally.
      { date: '2026-10-01T06:00:00+07:00', exerciseName: 'Squat' },
      { date: '2026-09-30T20:00:00+07:00', exerciseName: 'Deadlift' },
      { date: '2026-10-05T23:30:00+07:00', exerciseName: 'Bench Press' },
      { date: '2026-10-06T00:30:00+07:00', exerciseName: 'Pull Up' },
    ]);

    const res = await list({ from: '2026-10-01', to: '2026-10-05' }).expect(
      200,
    );

    expect(names(res.body)).toEqual(['Bench Press', 'Squat']);
  });

  it('filters by muscle group (F2.4)', async () => {
    await log([
      { date: '2026-10-01T07:00:00+07:00', exerciseName: 'Bench Press' },
      { date: '2026-10-02T07:00:00+07:00', exerciseName: 'Squat' },
    ]);

    const res = await list({ muscleGroup: 'chest' }).expect(200);

    expect(names(res.body)).toEqual(['Bench Press']);
  });

  it('rejects an unknown muscle group and lists valid slugs', async () => {
    const res = await list({ muscleGroup: 'wings' }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details[0]).toMatchObject({ field: 'muscleGroup' });
    expect(res.body.details[0].message).toContain('chest');
  });

  it('converts weights to the requested unit and defaults to kg (F2.5)', async () => {
    await log([
      {
        date: '2026-10-01T07:00:00+07:00',
        exerciseName: 'Bench Press',
        sets: [
          { reps: 5, weight: 100, unit: 'kg' },
          { reps: 5, weight: 225, unit: 'lb' },
        ],
      },
    ]);

    const inLb = await list({ unit: 'lb' }).expect(200);
    const inKg = await list().expect(200);

    expect(inLb.body.data[0].sets[0]).toMatchObject({
      weight: 220.46,
      unit: 'lb',
      volume: 1102.31,
    });
    expect(inKg.body.data[0].sets[1]).toMatchObject({
      weight: 102.06,
      unit: 'kg',
    });
  });

  it('paginates with a cursor without duplicates or gaps (F2.6)', async () => {
    // 25 entries; pairs share the same timestamp to exercise the id tie-break.
    const exercises = ['Squat', 'Deadlift'];
    const entries = Array.from({ length: 25 }, (_, i) => ({
      date: `2026-09-${String(Math.floor(i / 2) + 1).padStart(2, '0')}T07:00:00+07:00`,
      exerciseName: exercises[i % 2],
    }));
    await log(entries);

    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string | number> = cursor
        ? { limit: 10, cursor }
        : { limit: 10 };
      const res: request.Response = await list(query).expect(200);
      seen.push(...res.body.data.map((e: { id: string }) => e.id));
      pageSizes.push(res.body.data.length);
      cursor = res.body.pagination.nextCursor;
      expect(res.body.pagination.hasMore).toBe(cursor !== null);
    } while (cursor);

    expect(pageSizes).toEqual([10, 10, 5]);
    expect(new Set(seen).size).toBe(25);
  });

  it('returns an empty list with a message when nothing matches (E3)', async () => {
    await log([{ date: '2026-10-01T07:00:00+07:00', exerciseName: 'Squat' }]);

    const res = await list({ from: '2025-01-01', to: '2025-01-31' }).expect(
      200,
    );

    expect(res.body).toEqual({
      data: [],
      pagination: { limit: 20, hasMore: false, nextCursor: null },
      message: 'No workouts found for the given filters',
    });
  });

  it('returns the same empty page when the exercise filter matches no exercise', async () => {
    await log([{ date: '2026-10-01T07:00:00+07:00', exerciseName: 'Squat' }]);

    const res = await list({ exercise: 'zzzz' }).expect(200);

    expect(res.body).toEqual({
      data: [],
      pagination: { limit: 20, hasMore: false, nextCursor: null },
      message: 'No workouts found for the given filters',
    });
  });

  it('applies exercise name and muscle group filters together', async () => {
    await log([
      { date: '2026-10-01T07:00:00+07:00', exerciseName: 'Bench Press' },
      { date: '2026-10-02T07:00:00+07:00', exerciseName: 'Overhead Press' },
      { date: '2026-10-03T07:00:00+07:00', exerciseName: 'Leg Press' },
    ]);

    const res = await list({ exercise: 'press', muscleGroup: 'chest' }).expect(
      200,
    );

    expect(names(res.body)).toEqual(['Bench Press']);
  });

  it('does not include other users’ workouts', async () => {
    await log(
      [{ date: '2026-10-01T07:00:00+07:00', exerciseName: 'Squat' }],
      `other-${randomUUID()}`,
    );

    const res = await list().expect(200);

    expect(res.body.data).toEqual([]);
  });

  describe('invalid queries', () => {
    it.each([
      ['a malformed cursor', { cursor: 'nope' }, 'cursor'],
      ['from after to', { from: '2026-10-05', to: '2026-10-01' }, 'from'],
      ['limit 0', { limit: 0 }, 'limit'],
      ['limit above 100', { limit: 101 }, 'limit'],
      ['an unsupported unit', { unit: 'stone' }, 'unit'],
      ['a malformed date', { from: '2026-13-01' }, 'from'],
      ['an empty cursor', { cursor: '' }, 'cursor'],
      ['an exercise search of only spaces', { exercise: '   ' }, 'exercise'],
      ['an unknown query field', { sort: 'weight' }, 'sort'],
    ])('rejects %s with 400', async (_, query, field) => {
      const res = await list(query).expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(
        field,
      );
    });
  });
});
