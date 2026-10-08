import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './utils/create-test-app.js';

describe('API docs (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the OpenAPI document with every endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(
      Object.keys(res.body.paths['/api/v1/users/{userId}/workouts']),
    ).toEqual(expect.arrayContaining(['get', 'post']));
    expect(res.body.paths['/api/v1/users/{userId}/records'].get).toBeDefined();
  });

  it('documents the shared error shape with the error code enum', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    const schemas = res.body.components.schemas;
    expect(JSON.stringify(schemas.ErrorResponseDto.properties.code)).toContain(
      '#/components/schemas/ErrorCode',
    );
    expect(schemas.ErrorCode.enum).toEqual(
      expect.arrayContaining([
        'VALIDATION_ERROR',
        'NOT_FOUND',
        'INTERNAL_ERROR',
      ]),
    );
  });

  it('serves the Swagger UI', async () => {
    const res = await request(app.getHttpServer()).get('/docs').expect(200);

    expect(res.headers['content-type']).toContain('text/html');
  });
});
