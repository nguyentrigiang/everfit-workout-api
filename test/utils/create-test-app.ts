import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/infrastructure/http/app.setup.js';

/** Boots the real AppModule with the same app-level settings as main.ts. */
export async function createTestApp(): Promise<NestExpressApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app =
    moduleFixture.createNestApplication<NestExpressApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
