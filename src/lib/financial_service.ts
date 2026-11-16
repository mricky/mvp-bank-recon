/**
 * 🏛️ ENTERPRISE FINANCIAL SERVICE & RECONCILIATION ENGINE BOILERPLATE
 * 
 * Best-Practice Implementation adhering to:
 * 1. Minor-Unit (BigInt Cents/Sen) Arithmetic - Zero IEEE 754 floating-point drift.
 * 2. Strict Double-Entry Journaling - Mathematical guarantee that Debit == Credit.
 * 3. Atomic Database Concurrency - Row-level locking (SELECT FOR UPDATE) & atomic increment.
 * 4. Deterministic Idempotency Enforcement - Replay protection for webhook & transaction ingestion.
 * 5. Parameterized SQL Queries - Complete SQL injection protection.
 * 6. Zero `any` Types - Strict TypeScript contracts.
 */

// ============================================================================
// 1. Types & Interfaces
// ============================================================================

export type TransactionDirection = 'DEBIT' | 'CREDIT';

export interface FinancialTransaction {
  id: string;
  accountNumber: string;
  /** Amount in minor currency units (e.g., Sen / Cents). 1 IDR = 100 Sen */
  amountInCents: bigint;
  direction: TransactionDirection;
  timestamp?: string;
  referenceId?: string;
}

export interface JournalLineItem {
  accountCode: string;
  accountName: string;
  debitInCents: bigint;
  creditInCents: bigint;
  description?: string;
}

export interface JournalEntry {
  referenceNo: string;
  transactionDate: string;
  description: string;
  lines: JournalLineItem[];
  totalDebitInCents: bigint;
  totalCreditInCents: bigint;
}

export interface BankWebhookPayload {
  account_number: string;
  amount: number; // Raw currency unit from external provider
  reference_id: string;
  mutation_type?: 'CR' | 'DB';
  description?: string;
  timestamp?: string;
}

export interface WebhookProcessingResult {
  success: boolean;
  isIdempotentReplay: boolean;
  referenceId: string;
  accountNumber: string;
  newBalanceInCents: bigint;
  newBalanceFormatted: string;
  processedAt: string;
}

export interface DatabaseQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number;
}

export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<DatabaseQueryResult<T>>;
}

export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  get(key: string): Promise<WebhookProcessingResult | null>;
  set(key: string, result: WebhookProcessingResult, ttlSeconds?: number): Promise<void>;
}

// ============================================================================
// 2. Custom Errors
// ============================================================================

export class UnbalancedJournalError extends Error {
  public readonly totalDebit: bigint;
  public readonly totalCredit: bigint;
  public readonly difference: bigint;

  constructor(totalDebit: bigint, totalCredit: bigint, difference: bigint) {
    super(
      `Double-Entry Imbalance: Total Debit (${totalDebit.toString()} cents) does not match Total Credit (${totalCredit.toString()} cents). Difference: ${difference.toString()} cents.`
    );
    this.name = 'UnbalancedJournalError';
    this.totalDebit = totalDebit;
    this.totalCredit = totalCredit;
    this.difference = difference;
  }
}

export class MissingIdempotencyKeyError extends Error {
  constructor() {
    super('Missing required idempotency key (reference_id) in transaction payload.');
    this.name = 'MissingIdempotencyKeyError';
  }
}

export class AccountNotFoundError extends Error {
  public readonly accountNumber: string;

  constructor(accountNumber: string) {
    super(`Bank account '${accountNumber}' was not found in the database.`);
    this.name = 'AccountNotFoundError';
    this.accountNumber = accountNumber;
  }
}

// ============================================================================
// 3. Currency & Mathematical Utilities (Minor Units / Cents)
// ============================================================================

export const CENTS_FACTOR = BigInt(100);

/**
 * Converts standard currency unit (e.g., IDR 10,000.50) to minor unit (BigInt cents/sen: BigInt(1000050)).
 * Prevents IEEE 754 precision drift.
 */
export function toCents(amount: number): bigint {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`Invalid financial amount: ${amount}`);
  }
  // Round to 2 decimal places to avoid float representation artifacts before BigInt conversion
  const rounded = Math.round(amount * Number(CENTS_FACTOR));
  return BigInt(rounded);
}

/**
 * Converts minor unit (BigInt cents) back to floating number for display only.
 */
export function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}

/**
 * Formats minor unit cents to standard Indonesian Rupiah currency string.
 */
export function formatIDRFromCents(cents: bigint): string {
  const amount = fromCents(cents);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Safely calculates account balance using BigInt integer arithmetic.
 * Zero rounding error.
 */
export function calculateAccountBalance(transactions: readonly FinancialTransaction[]): bigint {
  let totalBalance = BigInt(0);

  for (const txn of transactions) {
    if (txn.direction === 'CREDIT') {
      totalBalance += txn.amountInCents;
    } else {
      totalBalance -= txn.amountInCents;
    }
  }

  return totalBalance;
}

// ============================================================================
// 4. Double-Entry Journal Builder (Audit & Compliance)
// ============================================================================

export class JournalBuilder {
  private lines: JournalLineItem[] = [];
  private readonly referenceNo: string;
  private readonly description: string;
  private readonly transactionDate: string;

  constructor(
    referenceNo: string,
    description: string,
    transactionDate: string = new Date().toISOString().slice(0, 10)
  ) {
    this.referenceNo = referenceNo;
    this.description = description;
    this.transactionDate = transactionDate;
  }

  public addDebit(accountCode: string, accountName: string, amountInCents: bigint, description?: string): this {
    if (amountInCents <= BigInt(0)) throw new Error('Debit amount must be greater than zero.');
    this.lines.push({
      accountCode,
      accountName,
      debitInCents: amountInCents,
      creditInCents: BigInt(0),
      description,
    });
    return this;
  }

  public addCredit(accountCode: string, accountName: string, amountInCents: bigint, description?: string): this {
    if (amountInCents <= BigInt(0)) throw new Error('Credit amount must be greater than zero.');
    this.lines.push({
      accountCode,
      accountName,
      debitInCents: BigInt(0),
      creditInCents: amountInCents,
      description,
    });
    return this;
  }

  /**
   * Validates that total debit equals total credit and compiles the immutable JournalEntry.
   * Throws UnbalancedJournalError if unbalanced.
   */
  public build(): JournalEntry {
    const totalDebitInCents = this.lines.reduce((acc, line) => acc + line.debitInCents, BigInt(0));
    const totalCreditInCents = this.lines.reduce((acc, line) => acc + line.creditInCents, BigInt(0));

    if (totalDebitInCents !== totalCreditInCents) {
      const diff = totalDebitInCents > totalCreditInCents 
        ? totalDebitInCents - totalCreditInCents 
        : totalCreditInCents - totalDebitInCents;
      throw new UnbalancedJournalError(totalDebitInCents, totalCreditInCents, diff);
    }

    return {
      referenceNo: this.referenceNo,
      transactionDate: this.transactionDate,
      description: this.description,
      lines: [...this.lines],
      totalDebitInCents,
      totalCreditInCents,
    };
  }
}

/**
 * Creates a strictly balanced double-entry journal entry for settlements with bank fees.
 * Formula:
 * Debit Bank (Net received: Amount - Fee)
 * Debit Bank Fee Expense (Fee)
 * Credit Revenue (Gross Amount)
 * Total Debit (Amount) == Total Credit (Amount)
 */
export function createBalancedJournalEntry(
  grossAmount: number,
  fee: number,
  referenceNo?: string
): JournalEntry {
  const grossCents = toCents(grossAmount);
  const feeCents = toCents(fee);

  if (feeCents > grossCents) {
    throw new Error('Fee cannot exceed the gross transaction amount.');
  }

  const netCents = grossCents - feeCents;
  const ref = referenceNo || `JRN-${Date.now()}`;

  return new JournalBuilder(ref, 'Penerimaan Pembayaran Pelanggan (Net Settlement)')
    .addDebit('1-1001', 'Kas / Bank BCA', netCents, 'Penerimaan bersih masuk rekening')
    .addDebit('5-1001', 'Beban Administrasi Bank', feeCents, 'Potongan biaya MDR / transfer bank')
    .addCredit('4-1001', 'Pendapatan Layanan', grossCents, 'Pengakuan pendapatan kotor')
    .build();
}

// ============================================================================
// 5. In-Memory Idempotency Store (Fallback for Distributed Systems / Redis)
// ============================================================================

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private cache = new Map<string, { result: WebhookProcessingResult; expiresAt: number }>();

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<WebhookProcessingResult | null> {
    const hasKey = await this.has(key);
    if (!hasKey) return null;
    return this.cache.get(key)!.result;
  }

  async set(key: string, result: WebhookProcessingResult, ttlSeconds: number = 86400): Promise<void> {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

export const defaultIdempotencyStore = new InMemoryIdempotencyStore();

// ============================================================================
// 6. Concurrency-Safe Webhook Processor with Idempotency Guard & Row Locking
// ============================================================================

/**
 * Processes incoming bank webhook safely:
 * 1. Enforces unique idempotency key (reference_id).
 * 2. Checks idempotency cache/table to safely replay without duplicate mutations.
 * 3. Uses parameterized queries to eliminate SQL injection.
 * 4. Executes row locking (SELECT ... FOR UPDATE) and atomic balance increment to prevent race conditions.
 */
export async function processBankWebhookSecurely(
  payload: BankWebhookPayload,
  dbClient: DatabaseClient,
  idempotencyStore: IdempotencyStore = defaultIdempotencyStore
): Promise<WebhookProcessingResult> {
  const { account_number, amount, reference_id } = payload;

  // 1. Idempotency Key Validation
  if (!reference_id || typeof reference_id !== 'string' || reference_id.trim() === '') {
    throw new MissingIdempotencyKeyError();
  }

  const cleanReferenceId = reference_id.trim();

  // 2. Fast-Path: Replay Existing Idempotent Result if already processed
  const cachedResult = await idempotencyStore.get(cleanReferenceId);
  if (cachedResult) {
    return {
      ...cachedResult,
      isIdempotentReplay: true,
    };
  }

  // 3. Safe Minor-Unit Conversion
  const deltaCents = toCents(amount);

  // 4. Transactional Concurrency with Parameterized Queries
  // We execute BEGIN, row-locking SELECT, UPDATE, and COMMIT.
  await dbClient.query('BEGIN');

  try {
    // 4a. Parameterized Row-Locking query (Prevents SQL Injection & Concurrent Race Condition)
    const selectSql = `
      SELECT balance_in_cents 
      FROM bank_accounts 
      WHERE account_number = $1 
      FOR UPDATE
    `;
    const accountResult = await dbClient.query<{ balance_in_cents: string | number }>(selectSql, [account_number]);

    if (!accountResult.rows || accountResult.rows.length === 0) {
      throw new AccountNotFoundError(account_number);
    }

    const currentBalanceCents = BigInt(accountResult.rows[0].balance_in_cents);
    const newBalanceCents = currentBalanceCents + deltaCents;

    // 4b. Parameterized Balance Update
    const updateSql = `
      UPDATE bank_accounts 
      SET balance_in_cents = $1, 
          last_mutation_at = NOW() 
      WHERE account_number = $2
    `;
    await dbClient.query(updateSql, [newBalanceCents.toString(), account_number]);

    // 4c. Record Ingestion in Audit/Ledger Table
    const auditSql = `
      INSERT INTO bank_webhook_logs (
        reference_id, 
        account_number, 
        amount_in_cents, 
        balance_after_in_cents, 
        status
      ) VALUES ($1, $2, $3, $4, 'PROCESSED')
    `;
    await dbClient.query(auditSql, [
      cleanReferenceId,
      account_number,
      deltaCents.toString(),
      newBalanceCents.toString(),
    ]);

    await dbClient.query('COMMIT');

    const result: WebhookProcessingResult = {
      success: true,
      isIdempotentReplay: false,
      referenceId: cleanReferenceId,
      accountNumber: account_number,
      newBalanceInCents: newBalanceCents,
      newBalanceFormatted: formatIDRFromCents(newBalanceCents),
      processedAt: new Date().toISOString(),
    };

    // Store in Idempotency store for future replay safety
    await idempotencyStore.set(cleanReferenceId, result);

    return result;
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  }
}
