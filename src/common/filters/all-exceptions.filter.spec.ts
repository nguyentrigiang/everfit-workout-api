import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-code.js';
import {
  AllExceptionsFilter,
  type ErrorResponseBody,
} from './all-exceptions.filter.js';

function run(
  exception: unknown,
  req: object = { url: '/api/v1/things?x=1', id: 'req-42' },
) {
  const logger = { error: vi.fn() };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter(logger as unknown as PinoLogger).catch(
    exception,
    host,
  );

  const body = res.json.mock.calls[0][0] as ErrorResponseBody;
  return { status: res.status.mock.calls[0][0] as number, body, logger, res };
}

describe('AllExceptionsFilter', () => {
  it('renders the full standard shape', () => {
    const { body } = run(new NotFoundException('Workout not found'));

    expect(body).toEqual({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      error: 'Not Found',
      message: 'Workout not found',
      details: [],
      path: '/api/v1/things?x=1',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      requestId: 'req-42',
    });
  });

  it('uses code and details from an AppException', () => {
    const details = [
      { field: 'sets[0].unit', message: 'unit must be kg or lb' },
    ];
    const { status, body } = run(
      new AppException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        details,
      ),
    );

    expect(status).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual(details);
  });

  it('maps a plain HttpException status to a default code', () => {
    const { body } = run(new BadRequestException('Bad cursor'));

    expect(body.statusCode).toBe(400);
    expect(body.code).toBe(ErrorCode.BAD_REQUEST);
    expect(body.message).toBe('Bad cursor');
  });

  it('turns an unknown error into a generic 500 without leaking internals', () => {
    const { status, body, logger } = run(
      new Error('connection refused at 10.0.0.5:5432'),
    );

    expect(status).toBe(500);
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('does not log 4xx errors (already in the request log)', () => {
    const { logger } = run(new NotFoundException());

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('generates a request id when the request has none (rejected before logging middleware)', () => {
    const { body, res } = run(
      new BadRequestException('Unexpected end of JSON input'),
      {
        url: '/',
        headers: {},
      },
    );

    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', body.requestId);
  });

  it('masks the message and details of 5xx HTTP exceptions', () => {
    const { body } = run(
      new InternalServerErrorException('connection refused at 10.0.0.5:5432'),
    );

    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('masks 5xx AppExceptions but keeps their code', () => {
    const { body } = run(
      new AppException(503, ErrorCode.INTERNAL_ERROR, 'db pool exhausted', [
        { message: 'pool size 10' },
      ]),
    );

    expect(body.message).toBe('Internal server error');
    expect(body.details).toEqual([]);
  });

  it('maps 413 to PAYLOAD_TOO_LARGE', () => {
    const { body } = run(new HttpException('request entity too large', 413));

    expect(body.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('falls back to BAD_REQUEST for unlisted 4xx statuses', () => {
    const { body } = run(new HttpException('Method Not Allowed', 405));

    expect(body.statusCode).toBe(405);
    expect(body.code).toBe(ErrorCode.BAD_REQUEST);
  });
});
