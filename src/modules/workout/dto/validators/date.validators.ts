import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../../domain/time/calendar-date.js';
import { parseOffsetDateTime } from '../../domain/time/offset-datetime.js';

// class-validator decorators for request DTOs; the parsing rules live in domain/time.

/** class-validator: ISO 8601 datetime with an explicit UTC offset. */
export function IsOffsetDateTime(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isOffsetDateTime',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an ISO 8601 datetime with a UTC offset, e.g. 2026-10-07T07:30:00+07:00`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && parseOffsetDateTime(value) !== null,
      },
    });
}

/** class-validator: the datetime is not after the current server time. */
export function IsNotInFuture(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isNotInFuture',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must not be in the future`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return true; // reported by IsOffsetDateTime
          const parsed = parseOffsetDateTime(value);
          return parsed === null || parsed.instant.getTime() <= Date.now();
        },
      },
    });
}

/** class-validator: calendar date `YYYY-MM-DD`. */
export function IsCalendarDate(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a calendar date in YYYY-MM-DD format`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isCalendarDate(value),
      },
    });
}
