import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './infrastructure/http/all-exceptions.filter.js';
import { PrismaModule } from './infrastructure/database/prisma/prisma.module.js';
import { WorkoutModule } from './modules/workout/workout.module.js';
import { validationExceptionFactory } from './infrastructure/http/validation-exception.factory.js';
import { validate } from './infrastructure/config/env.validation.js';
import { buildLoggerOptions } from './infrastructure/logging/logger.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildLoggerOptions,
    }),
    PrismaModule,
    WorkoutModule,
  ],
  providers: [
    // Registered via DI (not app.useGlobal*) so e2e tests run the same pipeline.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
