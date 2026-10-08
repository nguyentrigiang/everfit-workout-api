import { Inject } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { Transaction } from '../../../shared/database/transaction.js';
import { PrismaService } from './prisma.service.js';

/**
 * Base class for Prisma-backed repositories. Every method takes the transaction as
 * its last argument: required for writes (so a write can never silently run outside
 * the caller's transaction), optional for reads (which then use the shared client).
 */
export abstract class PrismaRepository {
  // Typed as PrismaClient so standalone scripts can pass their own client.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  protected db(tx?: Transaction): Prisma.TransactionClient {
    return tx ? toPrismaTransaction(tx) : this.prisma;
  }
}

/** The only place where the opaque handle is unwrapped. */
export function toPrismaTransaction(tx: Transaction): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}
