import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

// Verifies constraints enforced by the database itself (not by application code).
describe('database schema constraints (e2e)', () => {
  let prisma: PrismaClient;
  let exerciseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    const exercise = await prisma.exercise.create({
      data: {
        name: 'Schema Test Press',
        nameNormalized: `schema test press ${randomUUID()}`,
      },
    });
    exerciseId = exercise.id;
  });

  afterAll(async () => {
    await prisma.workoutEntry.deleteMany({ where: { exerciseId } });
    await prisma.exercise.delete({ where: { id: exerciseId } });
    await prisma.$disconnect();
  });

  // Mirrors the insert the logging service will use: duplicates are skipped by the unique index.
  function insertEntry(userId: string, performedAt: string) {
    return prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO workout_entries (user_id, exercise_id, performed_at, local_date, utc_offset_minutes)
      VALUES (${userId}, ${exerciseId}::uuid, ${performedAt}::timestamptz, ${performedAt.slice(0, 10)}::date, 420)
      ON CONFLICT (user_id, exercise_id, performed_at) DO NOTHING
      RETURNING id`;
  }

  function countEntries(userId: string) {
    return prisma.workoutEntry.count({ where: { userId, exerciseId } });
  }

  it('skips a second entry with the same user, exercise and performed_at', async () => {
    const userId = randomUUID();

    const first = await insertEntry(userId, '2026-10-07T07:30:00+07:00');
    const second = await insertEntry(userId, '2026-10-07T07:30:00+07:00');

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(await countEntries(userId)).toBe(1);
  });

  it('treats the same instant in different offsets as the same entry', async () => {
    const userId = randomUUID();

    await insertEntry(userId, '2026-10-07T07:30:00+07:00');
    const sameInstantUtc = await insertEntry(userId, '2026-10-07T00:30:00Z');

    expect(sameInstantUtc).toHaveLength(0);
  });

  it('keeps entries at different times as separate rows', async () => {
    const userId = randomUUID();

    await insertEntry(userId, '2026-10-07T07:30:00+07:00');
    await insertEntry(userId, '2026-10-07T18:00:00+07:00');

    expect(await countEntries(userId)).toBe(2);
  });

  it('stores exactly one row when identical inserts run concurrently', async () => {
    const userId = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        insertEntry(userId, '2026-10-07T07:30:00+07:00'),
      ),
    );

    expect(results.filter((rows) => rows.length === 1)).toHaveLength(1);
    expect(await countEntries(userId)).toBe(1);
  });

  it('deletes sets when their entry is deleted', async () => {
    const userId = randomUUID();
    const [{ id: entryId }] = await insertEntry(
      userId,
      '2026-10-07T07:30:00+07:00',
    );
    await prisma.workoutSet.create({
      data: {
        entryId,
        setIndex: 0,
        reps: 5,
        weight: 100,
        unit: 'kg',
        weightKg: 100,
        volumeKg: 500,
        e1rmKg: 116.667,
        userId,
        exerciseId,
        performedAt: new Date('2026-10-07T00:30:00Z'),
        localDate: new Date('2026-10-07'),
      },
    });

    await prisma.workoutEntry.delete({ where: { id: entryId } });

    expect(await prisma.workoutSet.count({ where: { entryId } })).toBe(0);
  });

  it('generates time-ordered UUIDv7 primary keys', async () => {
    const userId = randomUUID();
    const [{ id: earlier }] = await insertEntry(
      userId,
      '2026-10-07T07:30:00+07:00',
    );
    // uuidv7() is only monotonic within one session; step past the millisecond.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const [{ id: later }] = await insertEntry(
      userId,
      '2026-10-06T07:30:00+07:00',
    );
    const [{ id: setId }] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO workout_sets (entry_id, set_index, reps, weight, unit, weight_kg, volume_kg, e1rm_kg,
                                user_id, exercise_id, performed_at, local_date)
      VALUES (${later}::uuid, 0, 5, 100, 'kg', 100, 500, 116.667,
              ${userId}, ${exerciseId}::uuid, '2026-10-06T00:30:00Z', '2026-10-06')
      RETURNING id`;

    const version = (id: string) => id.split('-')[2][0];
    expect([exerciseId, earlier, later, setId].map(version)).toEqual([
      '7',
      '7',
      '7',
      '7',
    ]);
    // Ordered by insertion time, not by performed_at (the later insert is an earlier workout).
    expect(later > earlier).toBe(true);
  });

  it('rejects a set with non-positive reps at the database level', async () => {
    const userId = randomUUID();
    const [{ id: entryId }] = await insertEntry(
      userId,
      '2026-10-07T07:30:00+07:00',
    );

    await expect(
      prisma.$executeRaw`
        INSERT INTO workout_sets (entry_id, set_index, reps, weight, unit, weight_kg, volume_kg, e1rm_kg,
                                  user_id, exercise_id, performed_at, local_date)
        VALUES (${entryId}::uuid, 0, -5, 100, 'kg', 100, -500, 83.333,
                ${userId}, ${exerciseId}::uuid, '2026-10-07T00:30:00Z', '2026-10-07')`,
    ).rejects.toThrow(/workout_sets_reps_positive/);
  });
});
