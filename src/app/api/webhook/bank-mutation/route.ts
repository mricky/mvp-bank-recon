import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const items = Array.isArray(rawBody) ? rawBody : [rawBody];

    const records = items.map((body, index) => {
      const bankAccountId = body.bank_account_id ? Number(body.bank_account_id) : 1;
      const mutationType = (body.mutation_type || 'CR').toUpperCase() as 'CR' | 'DB';
      const amount = Number(body.amount || 25000000);
      const description = body.description || `TRF ${mutationType} PT MITRA SEJAHTERA SETTLEMENT INV-2026-0901`;
      const now = new Date();
      const dateStr = body.transaction_date || now.toISOString().slice(0, 10);
      const bankRefNo =
        body.bank_reference_no ||
        `TRX-MDR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
          now.getDate()
        ).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}-${index}`;

      const idempotencyHash = crypto
        .createHash('sha256')
        .update(`${bankAccountId}-${bankRefNo}-${amount}-${description}`)
        .digest('hex');

      return {
        company_id: 1,
        bank_account_id: bankAccountId,
        transaction_date: dateStr,
        value_date: body.value_date || dateStr,
        mutation_type: mutationType,
        amount: amount,
        balance_after: Number(body.balance_after) || (1500000000 + (mutationType === 'CR' ? amount : -amount)),
        bank_reference_no: bankRefNo,
        description: description,
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
      const uniqueAccountIds = [...new Set(records.map(r => r.bank_account_id))];
      try {
        await supabase.from('bank_account').update({ last_sync_at: nowIso }).in('id', uniqueAccountIds);
      } catch (_) {}

      const batchId = 'BATCH-' + Date.now();
      return NextResponse.json({
        success: true,
        batch_id: batchId,
        synced_at: nowIso,
        count: records.length,
        message: `${records.length} mutasi bank berhasil di-trigger via Webhook dan disimpan ke Supabase Realtime.`,
        data: Array.isArray(rawBody) ? data : data[0],
      });
    }

    return NextResponse.json({
      success: true,
      count: records.length,
      message: `Simulasi webhook berhasil (${records.length} items - Mode Demo Local).`,
      data: Array.isArray(rawBody) ? records : records[0],
    });
  } catch (err: any) {
    console.error('Webhook Error:', err);
    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kesalahan pemrosesan webhook mutasi bank',
        error: err.message,
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
      'Endpoint Webhook On-Demand untuk menerima payload mutasi rekening koran dari n8n / Bank SNAP BI (Single / Batch Array)',
    samplePayload: [
      {
        bank_account_id: 1,
        mutation_type: 'CR',
        amount: 45000000,
        description: 'TRF CR PT SINAR ABADI INV-2026-089',
        bank_reference_no: 'TRX-MDR-20261020-001'
      }
    ]
  });
}
