/** Pure helpers for the performance report: plan parsing and latency percentiles. */

export interface PlanSummary {
  executionMs: number;
  planningMs: number;
  /** Row count of the top plan node. */
  rows: number;
  sharedHit: number;
  sharedRead: number;
  /** Distinct scan nodes, e.g. "Index Scan using workout_entries_user_performed_idx". */
  scans: string[];
}

const SCAN =
  /((?:Parallel )?(?:Index Only Scan|Index Scan|Bitmap Index Scan|Bitmap Heap Scan|Seq Scan)(?: Backward)?) (?:using (\S+)|on (\S+))/;

/** Extracts the headline numbers from `EXPLAIN (ANALYZE, BUFFERS)` text output. */
export function summarizePlan(lines: string[]): PlanSummary {
  const number = (pattern: RegExp) => {
    for (const line of lines) {
      const match = pattern.exec(line);
      if (match) return Number(match[1]);
    }
    return 0;
  };
  const scans = new Set<string>();
  for (const line of lines) {
    const match = SCAN.exec(line);
    if (match) {
      scans.add(
        match[2]
          ? `${match[1]} using ${match[2]}`
          : `${match[1]} on ${match[3]}`,
      );
    }
  }
  return {
    executionMs: number(/Execution Time: ([\d.]+) ms/),
    planningMs: number(/Planning Time: ([\d.]+) ms/),
    rows: number(/actual time=[\d.]+\.\.[\d.]+ rows=([\d.]+)/),
    sharedHit: number(/Buffers: shared hit=(\d+)/),
    sharedRead: number(/Buffers: shared (?:hit=\d+ )?read=(\d+)/),
    scans: [...scans],
  };
}

/** Nearest-rank percentile (p in 0..100) of a non-empty sample. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) throw new Error('percentile of an empty sample');
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}
