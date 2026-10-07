import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import { type EnvironmentVariables, NodeEnv } from './env.validation.js';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept client-provided ids only if they are short and safe to write into logs.
const SAFE_REQUEST_ID = /^[\w-]{1,128}$/;

export function resolveRequestId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function buildLoggerOptions(
  config: ConfigService<EnvironmentVariables, true>,
): Params {
  const isDev =
    config.get('NODE_ENV', { infer: true }) === NodeEnv.Development;

  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      // Pretty, single-line logs locally; raw JSON everywhere else.
      transport: isDev
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
      genReqId: resolveRequestId,
      // Never log bodies or headers: keeps volume low and avoids leaking user data.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
