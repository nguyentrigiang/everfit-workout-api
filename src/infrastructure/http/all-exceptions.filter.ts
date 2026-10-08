import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  AppException,
  type ErrorDetail,
} from '../../shared/errors/app.exception.js';
import {
  defaultCodeForStatus,
  ErrorCode,
} from '../../shared/errors/error-code.js';
import { resolveRequestId } from '../logging/logger.config.js';

export interface ErrorResponseBody {
  statusCode: number;
  code: ErrorCode;
  error: string;
  message: string;
  details: ErrorDetail[];
  path: string;
  timestamp: string;
  requestId: string;
}

interface ResolvedError {
  status: number;
  code: ErrorCode;
  message: string;
  details: ErrorDetail[];
}

function resolveHttpException(exception: HttpException): ResolvedError {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const raw =
    typeof response === 'string'
      ? response
      : (response as { message?: unknown }).message;

  if (Array.isArray(raw)) {
    return {
      status,
      code: defaultCodeForStatus(status),
      message: 'Request is invalid',
      details: raw.map((message) => ({ message: String(message) })),
    };
  }
  return {
    status,
    code: defaultCodeForStatus(status),
    message: typeof raw === 'string' ? raw : exception.message,
    details: [],
  };
}

/**
 * Renders every error (domain, HTTP, validation, unexpected) into one response shape.
 * Unexpected errors become a generic 500; their stack is logged, never returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: unknown }>();
    const res = ctx.getResponse<Response>();

    const resolved = this.resolve(exception);
    const { status, code } = resolved;
    let { message, details } = resolved;

    // Never expose internals of server errors, whatever exception type carried them.
    if (status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled exception');
      message = 'Internal server error';
      details = [];
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      code,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      details,
      // originalUrl keeps the global prefix that Express strips from req.url.
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
      requestId: this.requestIdOf(req, res),
    };
    res.status(status).json(body);
  }

  // Requests rejected before pino-http runs (e.g. body parsing) have no id yet.
  private requestIdOf(req: Request & { id?: unknown }, res: Response): string {
    if (typeof req.id === 'string' || typeof req.id === 'number') {
      return String(req.id);
    }
    return resolveRequestId(req, res);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      return resolveHttpException(exception);
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      details: [],
    };
  }
}
