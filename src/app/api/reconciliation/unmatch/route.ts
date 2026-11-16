import { NextRequest, NextResponse } from 'next/server';
import {
  unmatchReconciliationGroupSecurely,
  rollbackUnmatchCompensation,
  createDefaultDatabaseClient,
  DatabaseClient,
} from '@/lib/financial_service';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface UnmatchRequestBody {
  group_id: string;
  reason?: string;
  operator?: string;
}

export async function POST(request: NextRequest) {
  const dbClient: DatabaseClient = createDefaultDatabaseClient();
  let cleanGroupId = '';

  try {
    const body = (await request.json()) as UnmatchRequestBody;
    const { group_id, reason = 'Operator unmatch rollback', operator = 'Accounting Supervisor' } = body;

    if (!group_id || typeof group_id !== 'string' || group_id.trim() === '') {
      return NextResponse.json(
        { success: false, message: 'ID grup rekonsiliasi (group_id) wajib diisi' },
        { status: 400 }
      );
    }

    cleanGroupId = group_id.trim();

    // 1. Transactional Concurrency Control with SERIALIZABLE isolation & SELECT FOR UPDATE
    const result = await unmatchReconciliationGroupSecurely(cleanGroupId, reason, dbClient, operator);

    // 2. Synchronize to Supabase with Distributed Transaction Atomicity & Compensating Actions
    // If downstream Supabase update fails, triggers compensating rollback on the primary ledger to prevent split-brain state
    if (isSupabaseConfigured && supabase) {
      try {
        // Revert bank statement lines to UNMATCHED
        const { error: bankError } = await supabase
          .from('bank_statement_line')
          .update({ status: 'UNMATCHED', allocated_amount: 0 })
          .eq('matched_group_id', cleanGroupId);

        if (bankError) {
          throw new Error(`Supabase bank_statement_line update failed: ${bankError.message}`);
        }

        // Revert journal lines to unreconciled
        const { error: journalError } = await supabase
          .from('transaction_journal_line')
          .update({ is_reconciled: false })
          .eq('matched_group_id', cleanGroupId);

        if (journalError) {
          throw new Error(`Supabase transaction_journal_line update failed: ${journalError.message}`);
        }

        // Remove reconciliation match
        const { error: matchError } = await supabase
          .from('bank_reconciliation_match')
          .delete()
          .eq('match_group_id', cleanGroupId);

        if (matchError) {
          throw new Error(`Supabase bank_reconciliation_match delete failed: ${matchError.message}`);
        }
      } catch (syncError: unknown) {
        // Compensating action: revert primary ledger back to matched state to preserve distributed atomicity
        console.error('Distributed transaction sync failure. Triggering compensating rollback...', syncError);
        await rollbackUnmatchCompensation(
          cleanGroupId,
          result.unmatchedBankRefs,
          result.unmatchedVouchers,
          dbClient
        );

        throw new Error(
          `Distributed transaction atomicity preserved: Supabase sync failed, compensating transaction reverted primary ledger changes. Cause: ${
            syncError instanceof Error ? syncError.message : String(syncError)
          }`
        );
      }
    }

    return NextResponse.json({
      success: true,
      group_id: cleanGroupId,
      unmatched_bank_refs: result.unmatchedBankRefs,
      unmatched_vouchers: result.unmatchedVouchers,
      storno_vouchers: result.stornoVouchers.map((s) => ({
        storno_voucher_code: s.stornoVoucherCode,
        original_voucher_code: s.originalVoucherCode,
        issued_at: s.issuedAt,
        reason: s.reason,
      })),
      unmatched_at: result.unmatchedAt,
      message: `Grup rekonsiliasi ${cleanGroupId} berhasil di-unmatch dengan isolasi transaksi SERIALIZABLE dan row-level locking. Dihasilkan ${result.stornoVouchers.length} storno voucher.`,
      audit_logged: true,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown unmatch error';
    console.error('Transactional Unmatch Error:', err);
    return NextResponse.json(
      {
        success: false,
        message: 'Gagal melakukan unmatch secara transaksional',
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}


