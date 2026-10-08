import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { validateCatalogConfig } from '../src/database/seed/catalog-config.js';
import { seedCatalog } from '../src/database/seed/seed-catalog.js';

// Prepare the e2e database: apply migrations, wipe data left by earlier runs, then seed
// the catalog like a container start, so every run starts from the same state.
export default async function setup(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`
      SELECT current_database() AS db`;
    if (!db.endsWith('_test')) {
      throw new Error(`Refusing to wipe non-test database "${db}"`);
    }
    await prisma.$executeRaw`
      TRUNCATE workout_sets, workout_entries, exercise_muscle_groups, exercises, muscle_groups
      RESTART IDENTITY CASCADE`;

    const config = validateCatalogConfig(
      JSON.parse(readFileSync('config/exercises.json', 'utf8')),
    );
    await seedCatalog(prisma, config);
  } finally {
    await prisma.$disconnect();
  }
}
