import { Global, Module } from '@nestjs/common';
import { TransactionRunner } from '../../../shared/database/transaction.js';
import { PrismaTransactionRunner } from './prisma-transaction-runner.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
  ],
  exports: [PrismaService, TransactionRunner],
})
export class PrismaModule {}
