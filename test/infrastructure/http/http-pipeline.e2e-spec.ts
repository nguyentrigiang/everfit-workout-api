import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../../utils/create-test-app.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('request id', () => {
    it('generates a UUID x-request-id when the client sends none', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/nope');

      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('echoes the client-provided x-request-id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/nope')
        .set('x-request-id', 'abc-123');

      expect(res.headers['x-request-id']).toBe('abc-123');
    });

    it('replaces an unsafe client x-request-id with a generated UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/nope')
        .set('x-request-id', 'bad id with spaces');

      expect(res.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('error responses', () => {
    it('returns the standard 404 shape with the same requestId as the header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        error: 'Not Found',
        details: [],
        path: '/api/v1/does-not-exist',
      });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    it('serves routes only under the /api/v1 prefix', async () => {
      await request(app.getHttpServer())
        .post('/users/u1/workouts')
        .send({})
        .expect(404);
    });

    // A dedicated MALFORMED_JSON code is a known follow-up (see docs/REQUIREMENTS.md backlog).
    it('returns 400 BAD_REQUEST in the standard shape for an unparsable JSON body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/u1/workouts')
        .set('Content-Type', 'application/json')
        .send('{"entries": [')
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'BAD_REQUEST',
        error: 'Bad Request',
      });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });
  });
});
