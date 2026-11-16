import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import crypto from 'crypto';

interface BankMutationInput {
  bank_account_id?: number | string;
  mutation_type?: 'CR' | 'DB' | string;
  amount?: number | string;
  description?: string;
  transaction_date?: string;
  value_date?: string;
  bank_reference_no?: string;
  reference_id?: string;
  idempotency_key?: string;
  balance_after?: number | string;
  source_channel?: string;
}

interface BankStatementRecord {
  company_id: number;
  bank_account_id: number;
  transaction_date: string;
  value_date: string;
  mutation_type: 'CR' | 'DB';
  amount: number;
  balance_after: number;
  bank_reference_no: string;
  description: string;
  idempotency_hash: string;
  source_channel: string;
  status: 'UNMATCHED';
}

export async function POST(request: NextRequest) {
  try {
    const headerIdempotencyKey =
      request.headers.get('x-idempotency-key') ||
      request.headers.get('idempotency-key') ||
      request.headers.get('x-external-id');

    const rawBody: unknown = await request.json();
    const items: BankMutationInput[] = Array.isArray(rawBody)
      ? (rawBody as BankMutationInput[])
      : [rawBody as BankMutationInput];

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Payload mutasi bank tidak boleh kosong' },
        { status: 400 }
      );
    }

    const records: BankStatementRecord[] = items.map((body, index) => {
      const bankAccountId = body.bank_account_id ? Number(body.bank_account_id) : 1;
      const rawType = (body.mutation_type || 'CR').toString().toUpperCase();
      const mutationType: 'CR' | 'DB' = rawType === 'DB' ? 'DB' : 'CR';
      const parsedAmount = Number(body.amount);
      const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 25000000;
      const description = body.description || `TRF ${mutationType} PT MITRA SEJAHTERA SETTLEMENT INV-2026-0901`;
      
      const now = new Date();
      const dateStr = body.transaction_date || now.toISOString().slice(0, 10);
      const valueDate = body.value_date || dateStr;

      // Deterministic reference resolution to guarantee idempotency on retries
      const explicitRef = body.bank_reference_no || body.reference_id || body.idempotency_key;
      const bankRefNo =
        explicitRef ||
        (headerIdempotencyKey ? `${headerIdempotencyKey}-${index}` : null) ||
        `TRX-AUTO-${dateStr.replace(/-/g, '')}-${bankAccountId}-${amount}`;

      // Cryptographic SHA-256 idempotency hash
      const idempotencyPayload = `${bankAccountId}:${bankRefNo}:${amount}:${mutationType}:${dateStr}`;
      const idempotencyHash = crypto
        .createHash('sha256')
        .update(idempotencyPayload)
        .digest('hex');

      const balanceAfter = Number(body.balance_after) || (1500000000 + (mutationType === 'CR' ? amount : -amount));

      return {
        company_id: 1,
        bank_account_id: bankAccountId,
        transaction_date: dateStr,
        value_date: valueDate,
        mutation_type: mutationType,
        amount,
        balance_after: balanceAfter,
        bank_reference_no: bankRefNo,
        description,
        idempotency_hash: idempotencyHash,
        source_channel: body.source_channel || 'N8N_TEST_WEBHOOK',
        status: 'UNMATCHED',
      };
    });

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('bank_statement_line')
        .upsert(records, { onConflict: 'company_id,bank_account_id,idempotency_hash', ignoreDuplicates: true })
        .select();

      if (error) {
        console.error('Supabase Webhook Insert Error:', error);
        return NextResponse.json(
          {
            success: false,
            message: 'Gagal insert ke database Supabase',
            error: error.message,
          },
          { status: 500 }
        );
      }

      const nowIso = new Date().toISOString();
      const uniqueAccountIds = [...new Set(records.map((r) => r.bank_account_id))];
      try {
        await supabase.from('bank_account').update({ last_sync_at: nowIso }).in('id', uniqueAccountIds);
      } catch (syncError) {
        console.warn('Failed to update bank_account last_sync_at:', syncError);
      }

      const batchId = 'BATCH-' + Date.now();
      const responseData = Array.isArray(rawBody) ? data : data?.[0] || records[0];

      return NextResponse.json({
        success: true,
        batch_id: batchId,
        synced_at: nowIso,
        count: records.length,
        message: `${records.length} mutasi bank berhasil diproses secara idempoten dan tersinkronisasi.`,
        data: responseData,
      });
    }

    return NextResponse.json({
      success: true,
      count: records.length,
      message: `Simulasi webhook berhasil (${records.length} items - Mode Demo Local).`,
      data: Array.isArray(rawBody) ? records : records[0],
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown processing error';
    console.error('Webhook Error:', err);
    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kesalahan pemrosesan webhook mutasi bank',
        error: errorMessage,
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ONLINE',
    endpoint: '/api/webhook/bank-mutation',
    method: 'POST',
    description:
      'Endpoint Webhook On-Demand untuk menerima payload mutasi rekening koran dari n8n / Bank SNAP BI (Single / Batch Array) dengan proteksi Idempotency SHA-256.',
    headers: {
      'X-Idempotency-Key': 'Optional client-side unique request identifier for strict replay protection',
    },
    samplePayload: [
      {
        bank_account_id: 1,
        mutation_type: 'CR',
        amount: 45000000,
        description: 'TRF CR PT SINAR ABADI INV-2026-089',
        bank_reference_no: 'TRX-MDR-20261020-001',
      },
    ],
  });
}
