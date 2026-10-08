import { percentile, summarizePlan } from './perf-report.js';

const PLAN =
  `Limit  (cost=0.42..12.3 rows=21 width=120) (actual time=0.051..0.240 rows=21.00 loops=1)
  Buffers: shared hit=87 read=3
  ->  Nested Loop  (cost=0.42..2900.1 rows=50000 width=120) (actual time=0.050..0.236 rows=21.00 loops=1)
        ->  Index Scan using workout_entries_user_performed_idx on workout_entries e  (cost=0.42..1500.2 rows=50000 width=60) (actual time=0.020..0.060 rows=21.00 loops=1)
              Index Cond: (user_id = 'perf-user'::text)
        ->  Index Scan using exercises_pkey on exercises ex  (cost=0.15..0.17 rows=1 width=60) (actual time=0.003..0.003 rows=1.00 loops=21)
        ->  Seq Scan on muscle_groups mg  (cost=0.00..1.12 rows=12 width=40) (actual time=0.001..0.002 rows=12.00 loops=21)
Planning Time: 0.412 ms
Execution Time: 0.301 ms`.split('\n');

describe('summarizePlan', () => {
  it('reads execution and planning time, top-node rows and buffers', () => {
    expect(summarizePlan(PLAN)).toMatchObject({
      executionMs: 0.301,
      planningMs: 0.412,
      rows: 21,
      sharedHit: 87,
      sharedRead: 3,
    });
  });

  it('lists each distinct scan node with its index or table', () => {
    expect(summarizePlan(PLAN).scans).toEqual([
      'Index Scan using workout_entries_user_performed_idx',
      'Index Scan using exercises_pkey',
      'Seq Scan on muscle_groups',
    ]);
  });

  it('reads buffers when nothing was read from disk', () => {
    expect(summarizePlan(['Buffers: shared hit=12']).sharedRead).toBe(0);
    expect(summarizePlan(['Buffers: shared read=5']).sharedRead).toBe(5);
  });
});

describe('percentile', () => {
  const samples = [5, 1, 4, 2, 3, 10, 7, 6, 9, 8];

  it('returns nearest-rank percentiles', () => {
    expect(percentile(samples, 50)).toBe(5);
    expect(percentile(samples, 95)).toBe(10);
    expect(percentile(samples, 0)).toBe(1);
    expect(percentile(samples, 100)).toBe(10);
  });

  it('rejects an empty sample', () => {
    expect(() => percentile([], 50)).toThrow();
  });
});
