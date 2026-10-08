import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { CatalogConfig } from '../../../src/infrastructure/database/seed/catalog-config.js';
import { seedCatalog } from '../../../src/infrastructure/database/seed/seed-catalog.js';

describe('seedCatalog (e2e)', () => {
  let prisma: PrismaClient;
  // Unique per test so rows never collide with other tests or the real catalog.
  let tag: string;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  });

  beforeEach(() => {
    tag = randomUUID().slice(0, 8);
  });

  // Remove this test's rows; mappings go with them via cascade.
  afterEach(async () => {
    await prisma.exercise.deleteMany({
      where: { nameNormalized: { endsWith: ` ${tag}` } },
    });
    await prisma.muscleGroup.deleteMany({
      where: { slug: { endsWith: `_${tag}` } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function catalog(
    exercises: { name: string; muscleGroups: string[] }[],
  ): CatalogConfig {
    return {
      muscleGroups: [
        { slug: `chest_${tag}`, name: 'Chest' },
        { slug: `triceps_${tag}`, name: 'Triceps' },
      ],
      exercises: exercises.map((e) => ({
        name: `${e.name} ${tag}`,
        muscleGroups: e.muscleGroups.map((m) => `${m}_${tag}`),
      })),
    };
  }

  function slugsOf(nameNormalized: string) {
    return prisma.exerciseMuscleGroup
      .findMany({
        where: { exercise: { nameNormalized } },
        select: { muscleGroup: { select: { slug: true } } },
      })
      .then((rows) => rows.map((r) => r.muscleGroup.slug).sort());
  }

  it('inserts muscle groups, exercises and mappings on the first run', async () => {
    const result = await seedCatalog(
      prisma,
      catalog([{ name: 'Bench Press', muscleGroups: ['chest', 'triceps'] }]),
    );

    expect(result).toEqual({
      muscleGroups: 2,
      exercises: 1,
      exerciseMuscleGroups: 2,
    });
    expect(await slugsOf(`bench press ${tag}`)).toEqual([
      `chest_${tag}`,
      `triceps_${tag}`,
    ]);
  });

  it('inserts nothing when run again with the same config', async () => {
    const config = catalog([
      { name: 'Bench Press', muscleGroups: ['chest', 'triceps'] },
    ]);
    await seedCatalog(prisma, config);

    expect(await seedCatalog(prisma, config)).toEqual({
      muscleGroups: 0,
      exercises: 0,
      exerciseMuscleGroups: 0,
    });
  });

  it('keeps the display name of an existing exercise and only adds missing mappings', async () => {
    // As if a coach had logged it before the catalog was seeded.
    await prisma.exercise.create({
      data: {
        name: `bench PRESS ${tag}`,
        nameNormalized: `bench press ${tag}`,
      },
    });

    const result = await seedCatalog(
      prisma,
      catalog([{ name: 'Bench Press', muscleGroups: ['chest'] }]),
    );

    const exercise = await prisma.exercise.findUniqueOrThrow({
      where: { nameNormalized: `bench press ${tag}` },
    });
    expect(result.exercises).toBe(0);
    expect(exercise.name).toBe(`bench PRESS ${tag}`);
    expect(await slugsOf(`bench press ${tag}`)).toEqual([`chest_${tag}`]);
  });

  it('does not remove a mapping that was dropped from the config', async () => {
    await seedCatalog(
      prisma,
      catalog([{ name: 'Dips', muscleGroups: ['chest', 'triceps'] }]),
    );

    await seedCatalog(
      prisma,
      catalog([{ name: 'Dips', muscleGroups: ['triceps'] }]),
    );

    expect(await slugsOf(`dips ${tag}`)).toEqual([
      `chest_${tag}`,
      `triceps_${tag}`,
    ]);
  });
});
