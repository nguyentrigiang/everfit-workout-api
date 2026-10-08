import type { ConfigService } from '@nestjs/config';
import type { Options } from 'pino-http';
import {
  type EnvironmentVariables,
  NodeEnv,
} from '../config/env.validation.js';
import { buildLoggerOptions } from './logger.config.js';

function pinoHttpOptions(env: Partial<EnvironmentVariables>): Options {
  const config = {
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return buildLoggerOptions(config).pinoHttp as Options;
}

describe('buildLoggerOptions', () => {
  const production = {
    NODE_ENV: NodeEnv.Production,
    LOG_LEVEL: 'info',
  } as const;

  it('logs only id, method and url of a request (no headers, no body)', () => {
    const { serializers } = pinoHttpOptions(production);
    const req = {
      id: 'req-1',
      method: 'POST',
      url: '/api/v1/users/u1/workouts',
      headers: { authorization: 'Bearer secret' },
      body: { entries: [] },
    };

    expect(serializers!.req(req)).toEqual({
      id: 'req-1',
      method: 'POST',
      url: '/api/v1/users/u1/workouts',
    });
  });

  it('logs only the status code of a response', () => {
    const { serializers } = pinoHttpOptions(production);
    const res = { statusCode: 201, headers: { 'set-cookie': 'x' } };

    expect(serializers!.res(res)).toEqual({ statusCode: 201 });
  });

  it('writes raw JSON (no transport) in production', () => {
    expect(pinoHttpOptions(production).transport).toBeUndefined();
  });

  it('uses pino-pretty in development', () => {
    const options = pinoHttpOptions({
      NODE_ENV: NodeEnv.Development,
      LOG_LEVEL: 'debug',
    });

    expect(options.transport).toMatchObject({ target: 'pino-pretty' });
    expect(options.level).toBe('debug');
  });
});
