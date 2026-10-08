/** Response shapes of the personal records endpoint. */

export interface PersonalRecord {
  value: number;
  reps: number;
  weight: number;
  performedAt: string;
  localDate: string;
  entryId: string;
  setIndex: number;
}

export interface RecordSet {
  heaviestWeight: PersonalRecord | null;
  highestVolume: PersonalRecord | null;
  bestEstimated1RM: PersonalRecord | null;
}

export type RecordDifference = Record<keyof RecordSet, number | null>;

interface DateRange {
  from: string | null;
  to: string | null;
}

export interface RecordsResult {
  data: {
    exercise: { id: string; name: string };
    unit: string;
    range: DateRange;
    records: RecordSet;
    comparison?: {
      range: DateRange;
      records: RecordSet;
      difference: RecordDifference;
    };
  };
  message?: string;
}

export const NO_RECORDS_MESSAGE =
  'No workouts found for this exercise in the given range';
