/**
 * ⚠️ DEMO SERVICE: UNSECURED FINANCIAL TRANSACTION & RECONCILIATION WORKFLOW
 * Designed to test the Autonomous AI Architecture Gatekeeper.
 * 
 * VULNERABILITIES INTENTIONALLY INCLUDED:
 * 1. IEEE 754 Floating-Point arithmetic for financial balances (Precision drift).
 * 2. Unbalanced Double-Entry Journal Entry (Debits != Credits).
 * 3. Missing Idempotency Key & Row Locking (Race condition & double-credit vulnerability).
 * 4. Unindexed N+1 query loop across bank statement records.
 */

export interface UnsecuredTransaction {
  id: string;
  accountNumber: string;
  amount: number; // 🔴 Flaw: Raw float number instead of BigInt / integer cents
  direction: 'DEBIT' | 'CREDIT';
}

// 🔴 Flaw 1: Floating-point precision drift in money accumulation
export function calculateAccountBalance(transactions: UnsecuredTransaction[]): number {
  let totalBalance = 0.0;
  for (const txn of transactions) {
    if (txn.direction === 'CREDIT') {
      totalBalance += txn.amount; // 🔴 Floating point addition accumulates rounding errors
    } else {
      totalBalance -= txn.amount;
    }
  }
  return totalBalance; // Floating point leak: 0.1 + 0.2 !== 0.3
}

// 🔴 Flaw 2: Unbalanced double-entry journal creation (Debit != Credit)
export function createUnbalancedJournalEntry(amount: number, fee: number) {
  return {
    referenceNo: `JRN-${Date.now()}`,
    lines: [
      {
        accountCode: '1-1001',
        accountName: 'Kas / Bank BCA',
        debit: amount, // e.g. Rp 1.000.000
        credit: 0
      },
      {
        accountCode: '5-1001',
        accountName: 'Beban Administrasi Bank',
        debit: fee, // e.g. Rp 6.500
        credit: 0
      },
      {
        accountCode: '4-1001',
        accountName: 'Pendapatan Layanan',
        debit: 0,
        credit: amount // 🔴 Flaw: Credit only matches amount, fee is orphaned! Total Debit (1.006.500) != Total Credit (1.000.000)
      }
    ]
  };
}

// 🔴 Flaw 3: Missing idempotency check on bank webhook & no database row lock
export async function processBankWebhook(payload: any, dbClient: any) {
  const { account_number, amount, reference_id } = payload;

  // 🔴 Flaw: No check on reference_id (Missing idempotency guard)!
  // 🔴 Flaw: Reading balance without SELECT ... FOR UPDATE (Race condition on concurrent webhooks)
  const account = await dbClient.query(`SELECT balance FROM bank_accounts WHERE account_number = '${account_number}'`);
  
  const currentBalance = account.rows[0].balance;
  const newBalance = currentBalance + amount;

  // 🔴 Flaw: Direct update without serializable transaction isolation or row locking
  await dbClient.query(`UPDATE bank_accounts SET balance = ${newBalance} WHERE account_number = '${account_number}'`);
  
  return { success: true, newBalance };
}
