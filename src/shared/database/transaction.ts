/**
 * Opaque handle for a running database transaction. Business code only passes it
 * along; repositories are the only place that know what is inside.
 */
declare const transactionBrand: unique symbol;
export type Transaction = { readonly [transactionBrand]: true };

/**
 * Runs work in one database transaction: committed when `work` resolves, rolled back
 * when it throws. Services depend on this abstraction, not on the ORM; it is also the
 * DI token (abstract classes exist at runtime, interfaces do not).
 */
export abstract class TransactionRunner {
  abstract run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}
