import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { loadCatalogConfig } from './catalog-config.js';
import { type DemoUser, seedDemoWorkouts } from './seed-demo.js';

// Opt-in demo / performance data: `npm run db:seed:demo` (not run on container start).
const SEED = 'everfit-demo-v1';
const END_DATE = '2026-09-30';
const OFFSETS = [420, -300, 0, 330, 570]; // +07:00, -05:00, UTC, +05:30, +09:30

const USERS: DemoUser[] = [
  // 50k entries for the E6 measurements; denser than real life on purpose.
  {
    userId: 'perf-user',
    entryCount: 50_000,
    spanDays: 5 * 365,
    utcOffsetMinutes: 420,
  },
  ...Array.from({ length: 20 }, (_, i) => ({
    userId: `demo-user-${String(i + 1).padStart(2, '0')}`,
    entryCount: 500,
    spanDays: 365,
    utcOffsetMinutes: OFFSETS[i % OFFSETS.length],
  })),
];

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file; variables come from the environment
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const config = await loadCatalogConfig(
    resolve(process.env.SEED_CONFIG_PATH ?? 'config/exercises.json'),
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const started = Date.now();
  try {
    const result = await seedDemoWorkouts(prisma, {
      users: USERS,
      exerciseNames: config.exercises.map((e) => e.name),
      endDate: END_DATE,
      seed: SEED,
      log: (message) => console.log(message),
    });
    console.log(
      `Demo seed done in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
        `${result.seededUsers.length} users seeded (${result.entries} entries, ${result.sets} sets), ` +
        `${result.skippedUsers.length} skipped`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Demo seed failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
