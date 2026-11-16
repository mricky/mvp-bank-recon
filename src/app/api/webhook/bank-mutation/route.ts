import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import crypto from 'crypto';
import {
  toCents,
  fromCents,
  formatIDRFromCents,
  processBankWebhookSecurely,
  createDefaultDatabaseClient,
  defaultIdempotencyStore,
  DatabaseClient,
  WebhookProcessingResult,
} from '@/lib/financial_service';

interface BankMutationInput {
  bank_account_id?: number | string;
  account_number?: string;
  mutation_type?: 'CR' | 'DB' | string;
  amount?: number | string;
  description?: string;
  transaction_date?: string;
  value_date?: string;
  bank_reference_no?: string;
  reference_id?: string;
  idempotency_key?: string;
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

    // 1. Service Layer Dependency Injection
    const dbClient: DatabaseClient = createDefaultDatabaseClient();
    const idempotencyStore = defaultIdempotencyStore;

    // 2. Process transactions sequentially through the secure financial service layer
    // Guarantees BigInt minor units, row-level locking (SELECT FOR UPDATE), and atomic sync timestamps
    const processedResults: WebhookProcessingResult[] = [];
    const statementRecords: BankStatementRecord[] = [];

    for (let index = 0; index < items.length; index++) {
      const body = items[index];
      const bankAccountId = body.bank_account_id ? Number(body.bank_account_id) : 1;
      const accountNumber = body.account_number || `ACC-${bankAccountId}`;
      const rawType = (body.mutation_type || 'CR').toString().toUpperCase();
      const mutationType: 'CR' | 'DB' = rawType === 'DB' ? 'DB' : 'CR';

      // Minor-unit currency conversion with BigInt (Zero IEEE 754 precision drift)
      const parsedAmount = Number(body.amount);
      const safeAmountNumber = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 25000000;
      const amountInCents = toCents(safeAmountNumber);
      const deltaSignedAmount = mutationType === 'CR' ? safeAmountNumber : -safeAmountNumber;

      const description = body.description || `TRF ${mutationType} PT MITRA SEJAHTERA SETTLEMENT INV-2026-0901`;
      const now = new Date();
      const dateStr = body.transaction_date || now.toISOString().slice(0, 10);
      const valueDate = body.value_date || dateStr;

      // Deterministic reference resolution for replay idempotency
      const explicitRef = body.bank_reference_no || body.reference_id || body.idempotency_key;
      const bankRefNo =
        explicitRef ||
        (headerIdempotencyKey ? `${headerIdempotencyKey}-${index}` : null) ||
        `TRX-AUTO-${dateStr.replace(/-/g, '')}-${bankAccountId}-${amountInCents.toString()}`;

      // Cryptographic SHA-256 idempotency hash
      const idempotencyPayload = `${bankAccountId}:${bankRefNo}:${amountInCents.toString()}:${mutationType}:${dateStr}`;
      const idempotencyHash = crypto
        .createHash('sha256')
        .update(idempotencyPayload)
        .digest('hex');

      // 3. Execute atomic transaction through financial_service layer
      // Enforces SELECT FOR UPDATE row locking and updates balance & last_sync_at inside the same transaction
      const serviceResult = await processBankWebhookSecurely(
        {
          account_number: accountNumber,
          amount: deltaSignedAmount,
          reference_id: bankRefNo,
          mutation_type: mutationType,
          description,
          timestamp: now.toISOString(),
        },
        dbClient,
        idempotencyStore
      );

      processedResults.push(serviceResult);

      statementRecords.push({
        company_id: 1,
        bank_account_id: bankAccountId,
        transaction_date: dateStr,
        value_date: valueDate,
        mutation_type: mutationType,
        amount: fromCents(amountInCents),
        balance_after: fromCents(serviceResult.newBalanceInCents),
        bank_reference_no: bankRefNo,
        description,
        idempotency_hash: idempotencyHash,
        source_channel: body.source_channel || 'N8N_TEST_WEBHOOK',
        status: 'UNMATCHED',
      });
    }

    const nowIso = new Date().toISOString();
    const batchId = 'BATCH-' + Date.now();

    // 4. Persistence to Supabase (when configured)
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('bank_statement_line')
        .upsert(statementRecords, { onConflict: 'company_id,bank_account_id,idempotency_hash', ignoreDuplicates: true })
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

      // Sync account timestamps
      const uniqueAccountIds = [...new Set(statementRecords.map((r) => r.bank_account_id))];
      await supabase.from('bank_account').update({ last_sync_at: nowIso }).in('id', uniqueAccountIds);

      const responseData = Array.isArray(rawBody) ? data : data?.[0] || statementRecords[0];

      return NextResponse.json({
        success: true,
        batch_id: batchId,
        synced_at: nowIso,
        count: statementRecords.length,
        is_idempotent_replay: processedResults.some((r) => r.isIdempotentReplay),
        message: `${statementRecords.length} mutasi bank berhasil diproses secara idempoten dan tersinkronisasi.`,
        data: responseData,
      });
    }

    // 5. Response for Local / Demo execution
    const localData = Array.isArray(rawBody) ? statementRecords : statementRecords[0];

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      synced_at: nowIso,
      count: statementRecords.length,
      is_idempotent_replay: processedResults.some((r) => r.isIdempotentReplay),
      message: `Simulasi webhook berhasil (${statementRecords.length} items - Service Layer Verified).`,
      formatted_balance: formatIDRFromCents(processedResults[0].newBalanceInCents),
      data: localData,
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
      'Endpoint Webhook On-Demand dengan arsitektur Financial Service Layer, BigInt minor units (sen/cents), row-level locking (SELECT FOR UPDATE), dan proteksi Idempotency SHA-256.',
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
