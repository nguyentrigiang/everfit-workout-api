import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../shared/errors/error-response.dto.js';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'docs';
/** Fits the largest valid bulk request (100 entries × 50 sets ≈ 250 KB); Express defaults to 100 KB. */
export const JSON_BODY_LIMIT = '1mb';

/** App-level settings shared by main.ts and e2e tests so both run the same way. */
export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);
  setupSwagger(app);
}

/** Swagger UI at /docs and the OpenAPI JSON at /docs-json. */
function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Everfit Workout Logging API')
    .setVersion('1.0')
    .setDescription(
      [
        'Log workouts, browse history and get personal records per user.',
        '',
        '- **Units**: `kg` and `lb`; values are stored in kg and converted on output (`unit` query, default kg).',
        '- **Time**: `date` must be ISO 8601 with a UTC offset; date filters are calendar days in the client’s local time.',
        '- **Errors**: every error uses the `ErrorResponseDto` shape with a stable `code`.',
        '- **Auth**: none; `userId` is a path parameter.',
      ].join('\n'),
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
  });
}
