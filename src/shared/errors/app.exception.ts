import { HttpException } from '@nestjs/common';
import type { ErrorCode } from './error-code.js';

export interface ErrorDetail {
  field?: string;
  message: string;
}

/**
 * Domain/application error carrying a machine-readable code and optional details.
 * Rendered by AllExceptionsFilter into the standard error response shape.
 */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message, status);
  }
}
