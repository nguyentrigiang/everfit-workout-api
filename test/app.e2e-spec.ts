import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  describe('request id', () => {
    it('generates a UUID x-request-id when the client sends none', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);

      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('echoes the client-provided x-request-id', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('x-request-id', 'abc-123')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('abc-123');
    });

    it('replaces an unsafe client x-request-id with a generated UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('x-request-id', 'bad id with spaces')
        .expect(200);

      expect(res.headers['x-request-id']).toMatch(UUID);
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
