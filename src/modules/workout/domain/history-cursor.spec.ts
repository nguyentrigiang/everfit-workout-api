import { AppException } from '../../../shared/errors/app.exception.js';
import { decodeCursor, encodeCursor } from './history-cursor.js';

describe('history cursor', () => {
  const cursor = {
    performedAt: new Date('2026-10-01T00:30:00.123Z'),
    id: '7b7e7eb5-5b90-4475-980d-1e59309d8207',
  };

  it('round-trips through encode and decode', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('produces a URL-safe string', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['garbage', 'not-a-cursor!!'],
    ['valid base64 but not JSON', Buffer.from('hello').toString('base64url')],
    [
      'JSON with a bad id',
      Buffer.from(JSON.stringify({ t: cursor.performedAt, id: '1' })).toString(
        'base64url',
      ),
    ],
    [
      'JSON with a bad date',
      Buffer.from(JSON.stringify({ t: 'yesterday', id: cursor.id })).toString(
        'base64url',
      ),
    ],
  ])('rejects %s with a 400 AppException', (_, value) => {
    expect(() => decodeCursor(value)).toThrow(AppException);
    try {
      decodeCursor(value);
    } catch (e) {
      expect((e as AppException).getStatus()).toBe(400);
    }
  });
});
