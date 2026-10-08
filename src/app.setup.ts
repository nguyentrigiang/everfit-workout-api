import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/** App-level settings shared by main.ts and e2e tests so both run the same way. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
}
