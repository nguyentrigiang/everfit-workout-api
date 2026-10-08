/** Response shapes of the workout logging and history endpoints. */

export type EntryStatus = 'created' | 'duplicate';

export interface LoggedEntry {
  index: number;
  id: string;
  status: EntryStatus;
  exercise: { id: string; name: string };
  performedAt: string;
  localDate: string;
  setCount: number;
}

export interface HistorySet {
  setIndex: number;
  reps: number;
  weight: number;
  unit: string;
  volume: number;
  e1rm: number;
}

export interface HistoryEntry {
  id: string;
  exercise: { id: string; name: string; muscleGroups: string[] };
  performedAt: string;
  localDate: string;
  sets: HistorySet[];
}

export interface HistoryPage {
  data: HistoryEntry[];
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
  message?: string;
}

export const NO_WORKOUTS_MESSAGE = 'No workouts found for the given filters';

export interface LogWorkoutsResult {
  entries: LoggedEntry[];
  summary: { created: number; duplicates: number };
}
