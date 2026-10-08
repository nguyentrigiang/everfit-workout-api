import {
  difference,
  type PersonalRecord,
  type RecordSet,
} from './records.service.js';

const record = (value: number): PersonalRecord => ({
  value,
  reps: 5,
  weight: value,
  performedAt: '2026-10-01T00:00:00.000Z',
  localDate: '2026-10-01',
  entryId: 'e',
  setIndex: 0,
});

describe('difference', () => {
  it('subtracts the compared value from the current one per metric', () => {
    const current: RecordSet = {
      heaviestWeight: record(105),
      highestVolume: record(750),
      bestEstimated1RM: record(116.67),
    };
    const compared: RecordSet = {
      heaviestWeight: record(100),
      highestVolume: record(800),
      bestEstimated1RM: record(114),
    };

    expect(difference(current, compared)).toEqual({
      heaviestWeight: 5,
      highestVolume: -50,
      bestEstimated1RM: 2.67,
    });
  });

  it('avoids float error when subtracting decimals', () => {
    const one = {
      heaviestWeight: record(0.3),
      highestVolume: null,
      bestEstimated1RM: null,
    };
    const two = {
      heaviestWeight: record(0.1),
      highestVolume: null,
      bestEstimated1RM: null,
    };

    expect(difference(one, two).heaviestWeight).toBe(0.2);
  });

  it('returns null when either side has no record', () => {
    const empty: RecordSet = {
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    };
    const full: RecordSet = {
      heaviestWeight: record(100),
      highestVolume: record(500),
      bestEstimated1RM: record(110),
    };

    expect(difference(full, empty)).toEqual({
      heaviestWeight: null,
      highestVolume: null,
      bestEstimated1RM: null,
    });
    expect(difference(empty, full).highestVolume).toBeNull();
  });
});
