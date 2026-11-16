/**
 * 🛡️ REFACTORED FINANCIAL TRANSACTION & RECONCILIATION SERVICE
 * 
 * Previously contained demo vulnerabilities (Precision drift, Unbalanced journal,
 * Missing idempotency, SQL injection, Race condition).
 * 
 * Refactored to production-ready enterprise standards:
 * 1. BigInt minor units (sen/cents) - Zero IEEE 754 precision drift.
 * 2. Strict Double-Entry validation (Debit === Credit).
 * 3. Enforced Idempotency Key validation & replay protection.
 * 4. Parameterized SQL queries & Row Locking (SELECT FOR UPDATE) to eliminate race conditions.
 * 5. Strict TypeScript typing (Zero `any`).
 */

import {
  toCents,
  fromCents,
  JournalBuilder,
  JournalEntry,
  MissingIdempotencyKeyError,
  DatabaseClient,
  BankWebhookPayload,
  WebhookProcessingResult,
  defaultIdempotencyStore,
} from './financial_service';

export interface UnsecuredTransaction {
  id: string;
  accountNumber: string;
  amount: number;
  direction: 'DEBIT' | 'CREDIT';
}

/**
 * Calculates account balance with integer cents to eliminate IEEE 754 precision drift.
 */
export function calculateAccountBalance(transactions: readonly UnsecuredTransaction[]): number {
  let totalBalanceCents = BigInt(0);

  for (const txn of transactions) {
    const cents = toCents(txn.amount);
    if (txn.direction === 'CREDIT') {
      totalBalanceCents += cents;
    } else {
      totalBalanceCents -= cents;
    }
  }

  return fromCents(totalBalanceCents);
}

/**
 * Creates a strictly balanced double-entry journal entry.
 * Guarantees Total Debit === Total Credit.
 */
export function createUnbalancedJournalEntry(amount: number, fee: number): JournalEntry {
  const grossCents = toCents(amount);
  const feeCents = toCents(fee);

  if (feeCents > grossCents) {
    throw new Error('Fee cannot exceed the gross transaction amount.');
  }

  const netCents = grossCents - feeCents;

  return new JournalBuilder(`JRN-${Date.now()}`, 'Penerimaan Pembayaran Pelanggan (Net Settlement)')
    .addDebit('1-1001', 'Kas / Bank BCA', netCents, 'Penerimaan bersih masuk rekening')
    .addDebit('5-1001', 'Beban Administrasi Bank', feeCents, 'Potongan biaya administrasi bank')
    .addCredit('4-1001', 'Pendapatan Layanan', grossCents, 'Pendapatan kotor diakui seimbang')
    .build();
}

/**
 * Securely processes bank webhooks:
 * - Validates idempotency key (reference_id)
 * - Uses parameterized queries to prevent SQL injection
 * - Executes row-level locking (SELECT FOR UPDATE) to prevent race conditions
 */
export async function processBankWebhook(
  payload: BankWebhookPayload,
  dbClient: DatabaseClient
): Promise<WebhookProcessingResult> {
  const { account_number, amount, reference_id } = payload;

  if (!reference_id || typeof reference_id !== 'string' || reference_id.trim() === '') {
    throw new MissingIdempotencyKeyError();
  }

  const cleanReferenceId = reference_id.trim();

  // Fast-path: check idempotency cache
  const cached = await defaultIdempotencyStore.get(cleanReferenceId);
  if (cached) {
    return {
      ...cached,
      isIdempotentReplay: true,
    };
  }

  const deltaCents = toCents(amount);

  await dbClient.query('BEGIN');
  try {
    // 1. Parameterized Row-Locking query (Eliminates SQL Injection & Concurrent Race Conditions)
    const selectSql = 'SELECT balance_in_cents FROM bank_accounts WHERE account_number = $1 FOR UPDATE';
    const account = await dbClient.query<{ balance_in_cents: string | number }>(selectSql, [account_number]);

    if (!account.rows || account.rows.length === 0) {
      throw new Error(`Bank account '${account_number}' not found.`);
    }

    const currentBalanceCents = BigInt(account.rows[0].balance_in_cents);
    const newBalanceCents = currentBalanceCents + deltaCents;

    // 2. Parameterized Update query
    const updateSql = 'UPDATE bank_accounts SET balance_in_cents = $1, updated_at = NOW() WHERE account_number = $2';
    await dbClient.query(updateSql, [newBalanceCents.toString(), account_number]);

    await dbClient.query('COMMIT');

    const result: WebhookProcessingResult = {
      success: true,
      isIdempotentReplay: false,
      referenceId: cleanReferenceId,
      accountNumber: account_number,
      newBalanceInCents: newBalanceCents,
      newBalanceFormatted: (Number(newBalanceCents) / 100).toLocaleString('id-ID'),
      processedAt: new Date().toISOString(),
    };

    await defaultIdempotencyStore.set(cleanReferenceId, result);
    return result;
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  }
}
