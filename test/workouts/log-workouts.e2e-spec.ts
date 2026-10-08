import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service.js';
import { createTestApp } from '../utils/create-test-app.js';

interface Body {
  entries: Record<string, unknown>[];
}

describe('POST /api/v1/users/:userId/workouts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    userId = `u-${randomUUID()}`;
  });

  const post = (body: unknown, user = userId) =>
    request(app.getHttpServer())
      .post(`/api/v1/users/${user}/workouts`)
      .send(body as object);

  const bench = (date = '2026-10-01T07:30:00+07:00') => ({
    date,
    exerciseName: 'Bench Press',
    sets: [
      { reps: 5, weight: 100, unit: 'kg' },
      { reps: 8, weight: 185, unit: 'lb' },
    ],
  });

  const entryCount = () => prisma.workoutEntry.count({ where: { userId } });

  describe('logging (F1)', () => {
    it('creates entries and sets with normalized kg values', async () => {
      const res = await post({ entries: [bench()] }).expect(201);

      expect(res.body.data.summary).toEqual({ created: 1, duplicates: 0 });
      expect(res.body.data.entries[0]).toMatchObject({
        index: 0,
        status: 'created',
        exercise: { name: 'Bench Press' },
        performedAt: '2026-10-01T00:30:00.000Z',
        localDate: '2026-10-01',
        setCount: 2,
      });

      const sets = await prisma.workoutSet.findMany({
        where: { userId },
        orderBy: { setIndex: 'asc' },
      });
      expect(sets).toHaveLength(2);
      // 185 lb = 83.91458845 kg → 83.914588; × 8 = 671.316704; × 38/30 = 106.291811
      expect(sets[1]).toMatchObject({ weight: expect.anything(), unit: 'lb' });
      expect(sets[1].weight.toString()).toBe('185');
      expect(sets[1].weightKg.toString()).toBe('83.914588');
      expect(sets[1].volumeKg.toString()).toBe('671.316704');
      expect(sets[1].e1rmKg.toString()).toBe('106.291811');
    });

    it('copies user, exercise, time and local date from the entry onto each set', async () => {
      // 6am Oct 1 in UTC+7 is still Sep 30 in UTC.
      await post({ entries: [bench('2026-10-01T06:00:00+07:00')] }).expect(201);

      const entry = await prisma.workoutEntry.findFirstOrThrow({
        where: { userId },
        include: { sets: true },
      });
      for (const set of entry.sets) {
        expect(set.userId).toBe(entry.userId);
        expect(set.exerciseId).toBe(entry.exerciseId);
        expect(set.performedAt).toEqual(entry.performedAt);
        expect(set.localDate).toEqual(entry.localDate);
      }
      expect(entry.localDate.toISOString().slice(0, 10)).toBe('2026-10-01');
      expect(entry.performedAt.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    });

    it('logs several exercises with mixed units in one request', async () => {
      const res = await post({
        entries: [
          bench(),
          {
            date: '2026-10-01T08:00:00+07:00',
            exerciseName: 'squat',
            sets: [{ reps: 5, weight: 140, unit: 'KG' }],
          },
        ],
      }).expect(201);

      expect(res.body.data.summary.created).toBe(2);
      expect(await entryCount()).toBe(2);
    });

    it('reuses a catalog exercise by normalized name and keeps its muscle groups', async () => {
      const res = await post({
        entries: [{ ...bench(), exerciseName: '  bench   PRESS ' }],
      }).expect(201);

      const exercise = await prisma.exercise.findUniqueOrThrow({
        where: { id: res.body.data.entries[0].exercise.id },
        include: { muscleGroups: true },
      });
      expect(exercise.nameNormalized).toBe('bench press');
      expect(exercise.muscleGroups.length).toBeGreaterThan(0);
    });

    it('creates an unknown exercise on the fly without muscle groups', async () => {
      const name = `Cable Fly ${randomUUID().slice(0, 8)}`;

      const res = await post({
        entries: [{ ...bench(), exerciseName: name }],
      }).expect(201);

      const exercise = await prisma.exercise.findUniqueOrThrow({
        where: { id: res.body.data.entries[0].exercise.id },
        include: { muscleGroups: true },
      });
      expect(exercise.name).toBe(name);
      expect(exercise.muscleGroups).toHaveLength(0);
    });
  });

  describe('idempotency and concurrency (E5)', () => {
    it('returns 200 with duplicates and stores nothing new on an identical retry', async () => {
      const body = { entries: [bench()] };
      const first = await post(body).expect(201);

      const retry = await post(body).expect(200);

      expect(retry.body.data.summary).toEqual({ created: 0, duplicates: 1 });
      expect(retry.body.data.entries[0]).toMatchObject({
        status: 'duplicate',
        id: first.body.data.entries[0].id,
      });
      expect(await entryCount()).toBe(1);
      expect(await prisma.workoutSet.count({ where: { userId } })).toBe(2);
    });

    it('returns 201 with mixed statuses when only some entries are new', async () => {
      await post({ entries: [bench()] }).expect(201);

      const res = await post({
        entries: [bench(), bench('2026-10-02T07:30:00+07:00')],
      }).expect(201);

      expect(
        res.body.data.entries.map((e: { status: string }) => e.status),
      ).toEqual(['duplicate', 'created']);
    });

    it('reports the stored set count for a duplicate sent with different sets', async () => {
      await post({ entries: [bench()] }).expect(201);

      const res = await post({
        entries: [
          {
            ...bench(),
            sets: [...bench().sets, ...bench().sets, ...bench().sets],
          },
        ],
      }).expect(200);

      expect(res.body.data.entries[0]).toMatchObject({
        status: 'duplicate',
        setCount: 2,
      });
    });

    it('does not deadlock when concurrent requests list the same entries in a different order', async () => {
      const tag = randomUUID().slice(0, 8);
      const entry = (name: string) => ({
        ...bench(),
        exerciseName: `${name} ${tag}`,
      });
      const forward = {
        entries: [entry('Alpha Lift'), entry('Beta Lift'), entry('Gamma Lift')],
      };
      const reversed = { entries: [...forward.entries].reverse() };

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) => post(i % 2 ? reversed : forward)),
      );

      expect(responses.every((r) => r.status === 200 || r.status === 201)).toBe(
        true,
      );
      expect(await entryCount()).toBe(3);
    });

    it('stores exactly one copy when identical requests run concurrently', async () => {
      const body = { entries: [bench()] };

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => post(body)),
      );

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 200, 200, 200, 201,
      ]);
      expect(await entryCount()).toBe(1);
      expect(await prisma.workoutSet.count({ where: { userId } })).toBe(2);
    });
  });

  it('accepts the largest valid request (100 entries × 50 sets)', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      exerciseName: 'Bench Press',
      sets: Array.from({ length: 50 }, () => ({
        reps: 1000,
        weight: 1999.125,
        unit: 'kg',
      })),
    }));

    const res = await post({ entries }).expect(201);

    expect(res.body.data.summary.created).toBe(100);
    expect(await prisma.workoutSet.count({ where: { userId } })).toBe(5000);
  });

  describe('validation (E1, E2)', () => {
    const expectValidationError = async (body: unknown, field: string) => {
      const res = await post(body).expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(
        field,
      );
      expect(await entryCount()).toBe(0);
      return res;
    };

    const withSet = (set: Record<string, unknown>): Body => ({
      entries: [{ ...bench(), sets: [set] }],
    });

    it('rejects an unsupported unit (E1)', async () => {
      const res = await expectValidationError(
        withSet({ reps: 5, weight: 10, unit: 'stone' }),
        'entries[0].sets[0].unit',
      );
      expect(res.body.details[0].message).toBe('unit must be one of: kg, lb');
    });

    it('rejects a null date', () =>
      expectValidationError(
        { entries: [{ ...bench(), date: null }] },
        'entries[0].date',
      ));

    it('rejects an offset beyond ±14:00 with 400 (not a database error)', () =>
      expectValidationError(
        { entries: [{ ...bench(), date: '2026-10-01T07:30:00+14:30' }] },
        'entries[0].date',
      ));

    it('rejects a date without a UTC offset', () =>
      expectValidationError(
        { entries: [{ ...bench(), date: '2026-10-01T07:30:00' }] },
        'entries[0].date',
      ));

    it('rejects a date in the future', () =>
      expectValidationError(
        { entries: [bench(new Date(Date.now() + 60_000).toISOString())] },
        'entries[0].date',
      ));

    it('rejects a negative weight', () =>
      expectValidationError(
        withSet({ reps: 5, weight: -5, unit: 'kg' }),
        'entries[0].sets[0].weight',
      ));

    it('rejects zero reps', () =>
      expectValidationError(
        withSet({ reps: 0, weight: 50, unit: 'kg' }),
        'entries[0].sets[0].reps',
      ));

    it('rejects an empty sets array', () =>
      expectValidationError(
        { entries: [{ ...bench(), sets: [] }] },
        'entries[0].sets',
      ));

    it('rejects an empty entries array', () =>
      expectValidationError({ entries: [] }, 'entries'));

    it('rejects more than 50 sets in an entry', () =>
      expectValidationError(
        {
          entries: [
            {
              ...bench(),
              sets: Array.from({ length: 51 }, () => ({
                reps: 5,
                weight: 50,
                unit: 'kg',
              })),
            },
          ],
        },
        'entries[0].sets',
      ));

    it('rejects unknown fields', () =>
      expectValidationError(
        { entries: [{ ...bench(), notes: 'felt strong' }] },
        'entries[0].notes',
      ));

    it('rejects the same exercise and date twice in one request', () =>
      expectValidationError(
        { entries: [bench(), { ...bench(), exerciseName: 'bench press' }] },
        'entries[1]',
      ));

    it('rejects a malformed userId', async () => {
      const res = await post({ entries: [bench()] }, 'bad id!').expect(400);

      expect(res.body.details[0].field).toBe('userId');
    });

    it('stores nothing when one entry in the request is invalid', async () => {
      await post({
        entries: [
          bench(),
          bench('2026-10-02T07:30:00+07:00'),
          { ...bench('2026-10-03T07:30:00+07:00'), sets: [] },
        ],
      }).expect(400);

      expect(await entryCount()).toBe(0);
    });
  });
});
