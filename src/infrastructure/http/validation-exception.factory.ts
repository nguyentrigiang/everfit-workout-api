import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import {
  AppException,
  type ErrorDetail,
} from '../../shared/errors/app.exception.js';
import { ErrorCode } from '../../shared/errors/error-code.js';

function joinPath(parent: string, property: string): string {
  if (/^\d+$/.test(property)) return `${parent}[${property}]`;
  return parent ? `${parent}.${property}` : property;
}

/**
 * Flattens nested class-validator errors into one detail per failed constraint,
 * with a full path into the payload, e.g. `entries[0].sets[2].weight`.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = joinPath(parentPath, error.property);
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    const nested = flattenValidationErrors(error.children ?? [], field);
    return [...own, ...nested];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    'Validation failed',
    flattenValidationErrors(errors),
  );
}
