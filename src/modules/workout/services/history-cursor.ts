import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception.js';
import { ErrorCode } from '../../../shared/errors/error-code.js';

/** Position after the last row of a page, ordered by (performed_at DESC, id DESC). */
export interface HistoryCursor {
  performedAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to clients: base64url(JSON). The ordering can change without breaking them. */
export function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.performedAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(value: string): HistoryCursor {
  const cursor = parseCursor(value);
  if (!cursor) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.BAD_REQUEST,
      'Invalid cursor',
      [{ field: 'cursor', message: 'cursor is malformed or expired' }],
    );
  }
  return cursor;
}

/** Null for anything that is not a cursor produced by encodeCursor. */
function parseCursor(value: string): HistoryCursor | null {
  const payload = parseJson(Buffer.from(value, 'base64url').toString('utf8'));
  if (typeof payload !== 'object' || payload === null) return null;

  const { t: time, id } = payload as { t?: unknown; id?: unknown };
  if (typeof time !== 'string') return null;
  if (typeof id !== 'string' || !UUID.test(id)) return null;

  const performedAt = new Date(time);
  if (Number.isNaN(performedAt.getTime())) return null;
  return { performedAt, id };
}

/** Undefined when the text is not valid JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
