import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { validateCatalogConfig } from './catalog-config.js';
import { seedCatalog } from './seed-catalog.js';

// Standalone entry point: `npm run db:seed` locally, and on every container start.
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

  const configPath = resolve(
    process.env.SEED_CONFIG_PATH ?? 'config/exercises.json',
  );
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot read catalog config ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const config = validateCatalogConfig(raw);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const inserted = await seedCatalog(prisma, config);
    console.log(
      `Seeded exercise catalog from ${configPath}: ` +
        `${inserted.muscleGroups} muscle groups, ${inserted.exercises} exercises, ` +
        `${inserted.exerciseMuscleGroups} mappings inserted (existing rows untouched)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
