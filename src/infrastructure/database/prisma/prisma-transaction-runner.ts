import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  type Transaction,
  TransactionRunner,
} from '../../../shared/database/transaction.js';
import { PrismaService } from './prisma.service.js';

/** TransactionRunner backed by an interactive Prisma transaction. */
@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaClient,
    // Not injected: only set through withTimeout() by batch scripts.
    @Optional() private readonly timeoutMs?: number,
  ) {
    super();
  }

  /** A runner with a longer transaction timeout (Prisma's default is 5 s), for batch scripts. */
  withTimeout(timeoutMs: number): PrismaTransactionRunner {
    return new PrismaTransactionRunner(this.prisma, timeoutMs);
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (client) => work(client as unknown as Transaction),
      this.timeoutMs === undefined ? undefined : { timeout: this.timeoutMs },
    );
  }
}
