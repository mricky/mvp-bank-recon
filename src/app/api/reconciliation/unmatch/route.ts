import { NextRequest, NextResponse } from 'next/server';
import {
  unmatchReconciliationGroupSecurely,
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
  try {
    const body = (await request.json()) as UnmatchRequestBody;
    const { group_id, reason = 'Operator unmatch rollback', operator = 'Accounting Supervisor' } = body;

    if (!group_id || typeof group_id !== 'string' || group_id.trim() === '') {
      return NextResponse.json(
        { success: false, message: 'ID grup rekonsiliasi (group_id) wajib diisi' },
        { status: 400 }
      );
    }

    const cleanGroupId = group_id.trim();

    // 1. Transactional Concurrency Control with SERIALIZABLE isolation & SELECT FOR UPDATE
    const dbClient: DatabaseClient = createDefaultDatabaseClient();
    const result = await unmatchReconciliationGroupSecurely(cleanGroupId, reason, dbClient, operator);

    // 2. Synchronize to Supabase when configured
    if (isSupabaseConfigured && supabase) {
      // Revert bank statement lines to UNMATCHED
      await supabase
        .from('bank_statement_line')
        .update({ status: 'UNMATCHED', allocated_amount: 0 })
        .eq('matched_group_id', cleanGroupId);

      // Revert journal lines to unreconciled
      await supabase
        .from('transaction_journal_line')
        .update({ is_reconciled: false })
        .eq('matched_group_id', cleanGroupId);

      // Remove reconciliation match
      await supabase
        .from('bank_reconciliation_match')
        .delete()
        .eq('match_group_id', cleanGroupId);
    }

    return NextResponse.json({
      success: true,
      group_id: cleanGroupId,
      unmatched_at: result.unmatchedAt,
      message: `Grup rekonsiliasi ${cleanGroupId} berhasil di-unmatch dengan isolasi transaksi SERIALIZABLE dan row-level locking.`,
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
