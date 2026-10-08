import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { encodeCursor } from '../../../modules/workout/domain/history-cursor.js';
import { ExerciseRepository } from '../../../modules/exercise/repositories/exercise.repository.js';
import { PersonalRecordRepository } from '../../../modules/workout/repositories/personal-record.repository.js';
import { WorkoutRepository } from '../../../modules/workout/repositories/workout.repository.js';
import { percentile, type PlanSummary, summarizePlan } from './perf-report.js';

// Measures the read paths on the seeded perf-user: `npm run db:explain`.
// Writes docs/PERFORMANCE.md (override with PERF_REPORT_PATH).
const USER = 'perf-user';
const MIN_ENTRIES = 50_000;
const HTTP_WARMUP = 5;
const HTTP_RUNS = 50;

interface Scenario {
  id: string;
  title: string;
  /** Runs the repository call(s) with the given transaction stand-in. */
  run: (tx: Prisma.TransactionClient) => Promise<unknown>;
  /** Matching API path (relative to /api/v1/users/perf-user), if any. */
  http?: string;
}

interface Measured {
  scenario: Scenario;
  plans: string[][];
  summary: PlanSummary;
  http?: { p50: number; p95: number; max: number } | string;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file; variables come from the environment
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  const reportPath = resolve(
    process.env.PERF_REPORT_PATH ?? 'docs/PERFORMANCE.md',
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const env = await environment(prisma);
    if (env.entries < MIN_ENTRIES) {
      throw new Error(
        `${USER} has ${env.entries} entries (need ${MIN_ENTRIES}); run db:seed:demo first`,
      );
    }
    const scenarios = await buildScenarios(prisma);
    const httpUp = await reachable(baseUrl);

    const measured: Measured[] = [];
    for (const scenario of scenarios) {
      // Warm the cache with the real query, then capture its plan.
      await scenario.run(prisma);
      const plans = await explain(prisma, scenario);
      const http = !scenario.http
        ? undefined
        : httpUp
          ? await timeHttp(`${baseUrl}/api/v1/users/${USER}/${scenario.http}`)
          : 'app not reachable';
      measured.push({ scenario, plans, summary: combine(plans), http });
      console.log(
        `${scenario.id} ${scenario.title}: ${measured.at(-1)!.summary.executionMs.toFixed(3)} ms`,
      );
    }

    await writeFile(reportPath, render(env, baseUrl, httpUp, measured));
    console.log(`Report written to ${reportPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Runs a scenario with a transaction stand-in that prefixes every repository query with
 * EXPLAIN, so the measured SQL is exactly what the API executes.
 */
async function explain(
  prisma: PrismaClient,
  scenario: Scenario,
): Promise<string[][]> {
  const plans: string[][] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const rows = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
        EXPLAIN (ANALYZE, BUFFERS) ${Prisma.sql(strings, ...values)}`;
      plans.push(rows.map((r) => r['QUERY PLAN']));
      return [];
    },
  } as unknown as Prisma.TransactionClient;
  await scenario.run(tx);
  return plans;
}

/** Sums time and buffers when a scenario issues several statements (comparison PRs). */
function combine(plans: string[][]): PlanSummary {
  const parts = plans.map(summarizePlan);
  return {
    executionMs: parts.reduce((t, p) => t + p.executionMs, 0),
    planningMs: parts.reduce((t, p) => t + p.planningMs, 0),
    rows: parts.reduce((t, p) => t + p.rows, 0),
    sharedHit: parts.reduce((t, p) => t + p.sharedHit, 0),
    sharedRead: parts.reduce((t, p) => t + p.sharedRead, 0),
    scans: [...new Set(parts.flatMap((p) => p.scans))],
  };
}

async function buildScenarios(prisma: PrismaClient): Promise<Scenario[]> {
  // Standalone script outside Nest DI; the repositories have no dependencies.
  const workouts = new WorkoutRepository();
  const records = new PersonalRecordRepository();
  const exercises = new ExerciseRepository();

  const [deadlift] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM exercises WHERE name_normalized = 'deadlift'`;
  // A cursor near the oldest data (deep page) and one inside the combined-filter range.
  const [deep] = await prisma.$queryRaw<{ id: string; performed_at: Date }[]>`
    SELECT id, performed_at FROM workout_entries WHERE user_id = ${USER}
    ORDER BY performed_at DESC, id DESC OFFSET 49000 LIMIT 1`;
  const [mid] = await prisma.$queryRaw<{ id: string; performed_at: Date }[]>`
    SELECT id, performed_at FROM workout_entries
    WHERE user_id = ${USER} AND local_date = '2024-03-15'
    ORDER BY performed_at DESC, id DESC LIMIT 1`;
  const [page] = await prisma.$queryRaw<{ ids: string[] }[]>`
    SELECT array_agg(id) AS ids FROM (
      SELECT id FROM workout_entries WHERE user_id = ${USER}
      ORDER BY performed_at DESC, id DESC LIMIT 100) p`;

  const deepCursor = { performedAt: deep.performed_at, id: deep.id };
  const midCursor = { performedAt: mid.performed_at, id: mid.id };
  const history = (
    tx: Prisma.TransactionClient,
    extra: Partial<Parameters<WorkoutRepository['findHistoryPage']>[0]>,
  ) => workouts.findHistoryPage({ tx, userId: USER, limit: 20, ...extra });
  // Same sequence as WorkoutService.listHistory: resolve ids on the catalog, return
  // early when nothing matches, otherwise read history for those ids. Both are measured.
  const filtered = async (
    tx: Prisma.TransactionClient,
    filter: { nameContains?: string; muscleGroup?: string },
    extra: Partial<Parameters<WorkoutRepository['findHistoryPage']>[0]> = {},
  ) => {
    await exercises.findIdsForFilter(tx, filter);
    // The stand-in returns no rows, so take the real ids from the database.
    const exerciseIds = await exercises.findIdsForFilter(prisma, filter);
    if (exerciseIds.length > 0) await history(tx, { ...extra, exerciseIds });
  };
  const prs = (tx: Prisma.TransactionClient, from?: string, to?: string) =>
    records.findRecords(tx, {
      userId: USER,
      exerciseId: deadlift.id,
      from,
      to,
    });

  return [
    {
      id: 'H1',
      title: 'History, first page (limit 20)',
      run: (tx) => history(tx, {}),
      http: 'workouts?limit=20',
    },
    {
      id: 'H2',
      title: 'History, first page (limit 100)',
      run: (tx) => history(tx, { limit: 100 }),
      http: 'workouts?limit=100',
    },
    {
      id: 'H3',
      title: 'History, deep page (cursor after 49,000 entries)',
      run: (tx) => history(tx, { after: deepCursor }),
      http: `workouts?limit=20&cursor=${encodeCursor(deepCursor)}`,
    },
    {
      id: 'H4',
      title: 'History filtered by exercise name (squat)',
      run: (tx) => filtered(tx, { nameContains: 'squat' }),
      http: 'workouts?limit=20&exercise=squat',
    },
    {
      id: 'H5',
      title: 'History filtered by muscle group (core)',
      run: (tx) => filtered(tx, { muscleGroup: 'core' }),
      http: 'workouts?limit=20&muscleGroup=core',
    },
    {
      id: 'H6',
      title: 'History for one month (2024-03)',
      run: (tx) => history(tx, { from: '2024-03-01', to: '2024-03-31' }),
      http: 'workouts?limit=20&from=2024-03-01&to=2024-03-31',
    },
    {
      id: 'H7',
      title: 'History: muscle group + month + cursor',
      run: (tx) =>
        filtered(
          tx,
          { muscleGroup: 'back' },
          { from: '2024-03-01', to: '2024-03-31', after: midCursor },
        ),
      http: `workouts?limit=20&muscleGroup=back&from=2024-03-01&to=2024-03-31&cursor=${encodeCursor(midCursor)}`,
    },
    {
      id: 'H8',
      title: 'Sets for a page of 100 entries',
      run: (tx) => workouts.findSetsForEntries(tx, page.ids),
    },
    // Worst cases: a filter that matches nothing walks every entry of the user.
    {
      id: 'W1',
      title: 'Worst case: exercise name matching nothing',
      run: (tx) => filtered(tx, { nameContains: 'zzzz' }),
      http: 'workouts?limit=20&exercise=zzzz',
    },
    {
      id: 'W2',
      title: 'Worst case: PRs for the oldest, lightest month (2021-10)',
      run: (tx) => prs(tx, '2021-10-01', '2021-10-31'),
      http: 'records?exercise=deadlift&from=2021-10-01&to=2021-10-31',
    },
    {
      id: 'R1',
      title: 'PRs for deadlift, all time',
      run: (tx) => prs(tx),
      http: 'records?exercise=deadlift',
    },
    {
      id: 'R2',
      title: 'PRs for deadlift, one month',
      run: (tx) => prs(tx, '2026-09-01', '2026-09-30'),
      http: 'records?exercise=deadlift&from=2026-09-01&to=2026-09-30',
    },
    {
      id: 'R3',
      title: 'PRs for deadlift, month vs previous month',
      run: async (tx) => {
        await prs(tx, '2026-09-01', '2026-09-30');
        await prs(tx, '2026-08-01', '2026-08-31');
      },
      http: 'records?exercise=deadlift&from=2026-09-01&to=2026-09-30&compareFrom=2026-08-01&compareTo=2026-08-31',
    },
  ];
}

async function environment(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<
    { version: string; entries: number; sets: number; users: number }[]
  >`
    SELECT version() AS version,
      (SELECT count(*)::int FROM workout_entries WHERE user_id = ${USER}) AS entries,
      (SELECT count(*)::int FROM workout_sets WHERE user_id = ${USER}) AS sets,
      (SELECT count(DISTINCT user_id)::int FROM workout_entries) AS users`;
  return { ...row, version: row.version.split(' on ')[0] };
}

async function reachable(baseUrl: string): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/docs-json`)).ok;
  } catch {
    return false;
  }
}

async function timeHttp(url: string) {
  const once = async () => {
    const started = performance.now();
    const res = await fetch(url);
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return performance.now() - started;
  };
  for (let i = 0; i < HTTP_WARMUP; i++) await once();
  const samples: number[] = [];
  for (let i = 0; i < HTTP_RUNS; i++) samples.push(await once());
  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
  };
}

function render(
  env: Awaited<ReturnType<typeof environment>>,
  baseUrl: string,
  httpUp: boolean,
  measured: Measured[],
): string {
  const ms = (v: number) => v.toFixed(2);
  const http = (m: Measured) =>
    m.http === undefined
      ? 'n/a'
      : typeof m.http === 'string'
        ? m.http
        : `${ms(m.http.p50)} / ${ms(m.http.p95)}`;
  const lines = [
    '# Performance measurements',
    '',
    '<!-- Generated by `npm run db:explain`; do not edit by hand. -->',
    '',
    `- Date: ${new Date().toISOString().slice(0, 10)}`,
    `- Database: ${env.version}`,
    `- Data: \`${USER}\` with ${env.entries.toLocaleString('en-US')} entries and ${env.sets.toLocaleString('en-US')} sets; ${env.users} users in total (\`npm run db:seed:demo\`)`,
    `- Node: ${process.version}`,
    `- DB time: \`EXPLAIN (ANALYZE, BUFFERS)\` on the exact SQL built by the repositories, after one warm-up run`,
    httpUp
      ? `- HTTP: ${HTTP_RUNS} sequential requests per endpoint after ${HTTP_WARMUP} warm-up requests, against ${baseUrl} (includes Nest pipeline, unit conversion and JSON)`
      : `- HTTP: not measured (app not reachable at ${baseUrl})`,
    '',
    '## Summary',
    '',
    '| ID | Query | DB execution (ms) | Rows | Buffers hit / read | Scans | HTTP p50 / p95 (ms) |',
    '|---|---|---|---|---|---|---|',
    ...measured.map(
      ({ scenario, summary: s, ...m }) =>
        `| ${scenario.id} | ${scenario.title} | ${ms(s.executionMs)} | ${s.rows} | ${s.sharedHit} / ${s.sharedRead} | ${s.scans.join('<br>')} | ${http({ scenario, summary: s, ...m })} |`,
    ),
    '',
    '## Plans',
    '',
  ];
  for (const m of measured) {
    lines.push(`### ${m.scenario.id}: ${m.scenario.title}`, '');
    if (m.scenario.http) {
      lines.push(`API: \`GET /api/v1/users/${USER}/${m.scenario.http}\``, '');
    }
    for (const plan of m.plans) {
      lines.push('```text', ...plan, '```', '');
    }
  }
  return lines.join('\n');
}

main().catch((error: unknown) => {
  console.error(
    'Performance run failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
