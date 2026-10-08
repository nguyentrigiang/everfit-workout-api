import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../utils/create-test-app.js';

type Set = { reps: number; weight: number; unit: string };

describe('GET /api/v1/users/:userId/records (e2e)', () => {
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

  const log = async (
    entries: { date: string; sets: Set[]; exerciseName?: string }[],
    user = userId,
  ) => {
    await request(app.getHttpServer())
      .post(`/api/v1/users/${user}/workouts`)
      .send({
        entries: entries.map((e) => ({ exerciseName: 'Bench Press', ...e })),
      })
      .expect(201);
  };

  const records = (query: Record<string, string>, user = userId) =>
    request(app.getHttpServer())
      .get(`/api/v1/users/${user}/records`)
      .query({ exercise: 'Bench Press', ...query });

  const kg = (reps: number, weight: number): Set => ({
    reps,
    weight,
    unit: 'kg',
  });

  // September: each PR comes from a different set and day.
  const september = [
    { date: '2026-09-01T07:00:00+07:00', sets: [kg(3, 100)] }, // heaviest 100
    { date: '2026-09-10T07:00:00+07:00', sets: [kg(10, 80)] }, // volume 800
    { date: '2026-09-20T07:00:00+07:00', sets: [kg(6, 95)] }, // 1RM 95 × 36/30 = 114
  ];
  const october = [
    { date: '2026-10-02T07:00:00+07:00', sets: [kg(2, 105)] }, // heaviest 105, 1RM 112
    { date: '2026-10-05T07:00:00+07:00', sets: [kg(10, 75)] }, // volume 750, 1RM 100
  ];

  it('returns the three all-time PRs with the date each was achieved (F3.1–F3.4)', async () => {
    await log(september);

    const res = await records({}).expect(200);

    expect(res.body.data).toMatchObject({
      exercise: { name: 'Bench Press' },
      unit: 'kg',
      range: { from: null, to: null },
      records: {
        heaviestWeight: {
          value: 100,
          reps: 3,
          weight: 100,
          localDate: '2026-09-01',
        },
        highestVolume: {
          value: 800,
          reps: 10,
          weight: 80,
          localDate: '2026-09-10',
        },
        bestEstimated1RM: {
          value: 114,
          reps: 6,
          weight: 95,
          localDate: '2026-09-20',
        },
      },
    });
    expect(res.body.data.records.heaviestWeight.performedAt).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(res.body.data.comparison).toBeUndefined();
    expect(res.body.message).toBeUndefined();
  });

  it('compares this month with last month (F3.5)', async () => {
    await log([...september, ...october]);

    const res = await records({
      from: '2026-10-01',
      to: '2026-10-31',
      compareFrom: '2026-09-01',
      compareTo: '2026-09-30',
    }).expect(200);

    const { records: current, comparison } = res.body.data;
    expect(current.heaviestWeight.value).toBe(105);
    expect(current.highestVolume.value).toBe(750);
    expect(current.bestEstimated1RM.value).toBe(112);
    expect(comparison.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(comparison.records.heaviestWeight.value).toBe(100);
    expect(comparison.difference).toEqual({
      heaviestWeight: 5,
      highestVolume: -50,
      bestEstimated1RM: -2,
    });
  });

  it('returns null differences when the compared range is empty', async () => {
    await log(october);

    const res = await records({
      from: '2026-10-01',
      to: '2026-10-31',
      compareFrom: '2026-09-01',
      compareTo: '2026-09-30',
    }).expect(200);

    expect(res.body.data.comparison.records.heaviestWeight).toBeNull();
    expect(res.body.data.comparison.difference).toEqual({
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    });
  });

  it('reports the most recent set when the same PR value was reached again', async () => {
    await log([
      { date: '2026-09-01T07:00:00+07:00', sets: [kg(3, 100)] },
      { date: '2026-09-15T07:00:00+07:00', sets: [kg(3, 100)] },
    ]);

    const res = await records({}).expect(200);

    expect(res.body.data.records.heaviestWeight.localDate).toBe('2026-09-15');
  });

  it('uses the local calendar date for ranges', async () => {
    // 6am Oct 1 in UTC+7 is Sep 30 in UTC: it belongs to October.
    await log([{ date: '2026-10-01T06:00:00+07:00', sets: [kg(1, 120)] }]);

    const oct = await records({ from: '2026-10-01', to: '2026-10-31' }).expect(
      200,
    );
    const sep = await records({ from: '2026-09-01', to: '2026-09-30' }).expect(
      200,
    );

    expect(oct.body.data.records.heaviestWeight.value).toBe(120);
    expect(sep.body.data.records.heaviestWeight).toBeNull();
  });

  it('converts values to the requested unit', async () => {
    await log([
      {
        date: '2026-09-01T07:00:00+07:00',
        sets: [{ reps: 5, weight: 225, unit: 'lb' }],
      },
    ]);

    const inLb = await records({ unit: 'lb' }).expect(200);
    const inKg = await records({}).expect(200);

    expect(inLb.body.data.records.heaviestWeight).toMatchObject({
      value: 225,
      weight: 225,
    });
    expect(inLb.body.data.records.highestVolume.value).toBe(1125);
    expect(inKg.body.data.records.heaviestWeight.value).toBe(102.06);
  });

  it('matches the exercise name case- and whitespace-insensitively', async () => {
    await log(september);

    const res = await records({ exercise: '  bench   PRESS ' }).expect(200);

    expect(res.body.data.records.heaviestWeight.value).toBe(100);
  });

  it('returns null records with a message for an empty range (E3)', async () => {
    await log(september);

    const res = await records({ from: '2025-01-01', to: '2025-01-31' }).expect(
      200,
    );

    expect(res.body.data.records).toEqual({
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    });
    expect(res.body.message).toBe(
      'No workouts found for this exercise in the given range',
    );
  });

  it('does not use other users’ sets', async () => {
    await log(september, `other-${randomUUID()}`);

    const res = await records({}).expect(200);

    expect(res.body.data.records.heaviestWeight).toBeNull();
  });

  it('returns 404 for an unknown exercise', async () => {
    const res = await records({
      exercise: `No Such Lift ${randomUUID()}`,
    }).expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
  });

  describe('invalid queries', () => {
    it.each([
      ['a missing exercise', { exercise: '' }, 'exercise'],
      ['from after to', { from: '2026-10-05', to: '2026-10-01' }, 'from'],
      [
        'compareFrom without compareTo',
        { compareFrom: '2026-09-01' },
        'compareTo',
      ],
      [
        'compareFrom after compareTo',
        { compareFrom: '2026-09-30', compareTo: '2026-09-01' },
        'compareFrom',
      ],
      ['a malformed date', { from: '2026-02-30' }, 'from'],
      ['an unsupported unit', { unit: 'stone' }, 'unit'],
    ])('rejects %s with 400', async (_, query, field) => {
      const res = await records(query).expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(
        field,
      );
    });
  });
});
