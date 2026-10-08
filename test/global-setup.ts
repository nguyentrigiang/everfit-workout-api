import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { validateCatalogConfig } from '../src/database/seed/catalog-config.js';
import { seedCatalog } from '../src/database/seed/seed-catalog.js';

// Prepare the e2e database like a container start: apply migrations, then seed the catalog.
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
    const config = validateCatalogConfig(
      JSON.parse(readFileSync('config/exercises.json', 'utf8')),
    );
    await seedCatalog(prisma, config);
  } finally {
    await prisma.$disconnect();
  }
}
