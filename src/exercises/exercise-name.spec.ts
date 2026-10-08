import { cleanDisplayName, normalizeExerciseName } from './exercise-name.js';

describe('normalizeExerciseName', () => {
  it('trims, lowercases and collapses inner whitespace', () => {
    expect(normalizeExerciseName('  Bench   PRESS ')).toBe('bench press');
  });

  it('collapses tabs and newlines as whitespace', () => {
    expect(normalizeExerciseName('Pull\tUp\n')).toBe('pull up');
  });

  it('leaves an already normalized name unchanged', () => {
    expect(normalizeExerciseName('squat')).toBe('squat');
  });

  it('matches composed and decomposed accents', () => {
    const composed = 'Caf\u00e9 Curl';
    const decomposed = 'Cafe\u0301 Curl';

    expect(normalizeExerciseName(composed)).toBe(
      normalizeExerciseName(decomposed),
    );
  });

  it('treats a non-breaking space like a normal space', () => {
    expect(normalizeExerciseName('Bench\u00a0Press')).toBe('bench press');
  });
});

describe('cleanDisplayName', () => {
  it('keeps casing but trims and collapses whitespace', () => {
    expect(cleanDisplayName('  Bench   Press ')).toBe('Bench Press');
  });
});
