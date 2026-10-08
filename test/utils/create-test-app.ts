import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/infrastructure/http/app.setup.js';

/** Boots the real AppModule with the same app-level settings as main.ts. */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}
