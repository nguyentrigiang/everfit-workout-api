import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RecordsModule } from './records/records.module.js';
import { UnitsModule } from './units/units.module.js';
import { WorkoutsModule } from './workouts/workouts.module.js';
import { validationExceptionFactory } from './common/validation/validation-exception.factory.js';
import { validate } from './config/env.validation.js';
import { buildLoggerOptions } from './config/logger.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildLoggerOptions,
    }),
    PrismaModule,
    UnitsModule,
    WorkoutsModule,
    RecordsModule,
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
