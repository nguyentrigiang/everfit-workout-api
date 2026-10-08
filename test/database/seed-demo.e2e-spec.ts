import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  type DemoSeedOptions,
  seedDemoWorkouts,
} from '../../src/infrastructure/database/seed/seed-demo.js';

// Uses the catalog seeded by the e2e global setup.
describe('seedDemoWorkouts (e2e)', () => {
  let prisma: PrismaClient;
  let users: string[];

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  });

  beforeEach(() => {
    const tag = randomUUID().slice(0, 8);
    users = [`seed-a-${tag}`, `seed-b-${tag}`];
  });

  afterEach(async () => {
    await prisma.workoutEntry.deleteMany({ where: { userId: { in: users } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const options = (): DemoSeedOptions => ({
    users: users.map((userId, i) => ({
      userId,
      entryCount: 30,
      spanDays: 10,
      utcOffsetMinutes: i === 0 ? 420 : -300,
    })),
    exerciseNames: ['Squat', 'Bench Press', 'Deadlift', 'Pull Up', 'Plank'],
    endDate: '2026-09-30',
    seed: 'e2e',
    // Small batches so the test crosses a batch boundary.
    batchSize: 7,
  });

  it('inserts the generated entries and sets for every user', async () => {
    const result = await seedDemoWorkouts(prisma, options());

    expect(result.seededUsers).toEqual(users);
    expect(result.entries).toBe(60);
    for (const userId of users) {
      expect(await prisma.workoutEntry.count({ where: { userId } })).toBe(30);
    }
    expect(
      await prisma.workoutSet.count({ where: { userId: { in: users } } }),
    ).toBe(result.sets);
  });

  it('copies user, exercise, time and local date from the entry onto each set', async () => {
    await seedDemoWorkouts(prisma, options());

    const mismatched = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM workout_sets s JOIN workout_entries e ON e.id = s.entry_id
      WHERE e.user_id = ANY(${users}::text[])
        AND (s.user_id <> e.user_id OR s.exercise_id <> e.exercise_id
             OR s.performed_at <> e.performed_at OR s.local_date <> e.local_date)`;
    expect(Number(mismatched[0].count)).toBe(0);
  });

  it('skips users that already have entries on a second run', async () => {
    await seedDemoWorkouts(prisma, options());
    const second = await seedDemoWorkouts(prisma, options());

    expect(second.seededUsers).toEqual([]);
    expect(second.skippedUsers).toEqual(users);
    expect(
      await prisma.workoutEntry.count({ where: { userId: { in: users } } }),
    ).toBe(60);
  });

  it('completes a partially seeded user on the next run without touching stored rows', async () => {
    const first = await seedDemoWorkouts(prisma, options());
    // Simulate a run that died after some batches: drop the newest half of one user.
    await prisma.$executeRaw`
      DELETE FROM workout_entries WHERE id IN (
        SELECT id FROM workout_entries WHERE user_id = ${users[0]}
        ORDER BY performed_at DESC LIMIT 15)`;
    const keptBefore = await prisma.workoutSet.findMany({
      where: { userId: users[0] },
      orderBy: { id: 'asc' },
    });

    const second = await seedDemoWorkouts(prisma, options());

    expect(second.seededUsers).toEqual([users[0]]);
    expect(second.skippedUsers).toEqual([users[1]]);
    expect(second.entries).toBe(15);
    expect(
      await prisma.workoutEntry.count({ where: { userId: users[0] } }),
    ).toBe(30);
    expect(
      await prisma.workoutSet.count({ where: { userId: { in: users } } }),
    ).toBe(first.sets);
    // Rows that survived keep their ids and values.
    const keptAfter = await prisma.workoutSet.findMany({
      where: { id: { in: keptBefore.map((s) => s.id) } },
      orderBy: { id: 'asc' },
    });
    expect(keptAfter).toEqual(keptBefore);
  });

  it('fails clearly when an exercise is not in the catalog', async () => {
    await expect(
      seedDemoWorkouts(prisma, {
        ...options(),
        exerciseNames: ['Squat', 'Underwater Basket Weaving'],
      }),
    ).rejects.toThrow(/run the catalog seed first/);
  });
});
