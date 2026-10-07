import { NodeEnv, validate } from './env.validation.js';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

describe('validate (environment variables)', () => {
  it('fills defaults when only DATABASE_URL is provided', () => {
    const env = validate({ DATABASE_URL });

    expect(env.NODE_ENV).toBe(NodeEnv.Production);
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DATABASE_URL).toBe(DATABASE_URL);
  });

  it('converts PORT from string to number', () => {
    expect(validate({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws naming DATABASE_URL when it is missing', () => {
    expect(() => validate({})).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a postgres connection string', () => {
    expect(() => validate({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('throws when PORT is not a number', () => {
    expect(() => validate({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('throws when LOG_LEVEL is not a pino level', () => {
    expect(() => validate({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it('lists every invalid variable in one error', () => {
    expect(() =>
      validate({ NODE_ENV: 'staging', PORT: '99999', LOG_LEVEL: 'loud' }),
    ).toThrow(/NODE_ENV.*PORT.*DATABASE_URL.*LOG_LEVEL/);
  });
});
