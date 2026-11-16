import { supabase, isSupabaseConfigured } from './supabase';
import {
  BankStatementLine,
  JournalLine,
  MasterBbs,
  TransactionJournalHeader,
  TransactionJournalLineItem,
} from '@/types/reconciliation';
import { MOCK_MASTER_BBS } from './mock-data';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Januari 2026',
  '02': 'Februari 2026',
  '03': 'Maret 2026',
  '04': 'April 2026',
  '05': 'Mei 2026',
  '06': 'Juni 2026',
  '07': 'Juli 2026',
  '08': 'Agustus 2026',
  '09': 'September 2026',
  '10': 'Oktober 2026',
  '11': 'November 2026',
  '12': 'Desember 2026',
};

export function getPeriodNameFromDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) return 'Oktober 2026';
  const m = dateStr.slice(5, 7);
  return MONTH_NAMES[m] || 'Oktober 2026';
}

/**
 * Fetch all bank statement lines directly from Supabase
 */
export async function fetchBankStatementLinesFromSupabase(): Promise<BankStatementLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('bank_statement_line')
    .select(`
      id,
      transaction_date,
      value_date,
      mutation_type,
      amount,
      balance_after,
      bank_reference_no,
      description,
      status,
      bank_account:bank_account_id (
        bank_code,
        bank_name,
        account_number
      )
    `)
    .order('id', { ascending: true });

  if (error || !data) {
    console.error('Error fetching bank statements from Supabase:', error);
    return [];
  }

  // Also fetch existing matches to map matched_group_id and compute allocated/remaining amounts
  const { data: matchData } = await supabase
    .from('bank_reconciliation_match')
    .select('match_group_id, statement_line_id, matched_amount');

  const matchMap = new Map<number, string>();
  const matchSumMap = new Map<number, number>();
  if (matchData) {
    for (const m of matchData) {
      if (m.statement_line_id) {
        const sId = Number(m.statement_line_id);
        if (m.match_group_id) matchMap.set(sId, m.match_group_id);
        matchSumMap.set(sId, (matchSumMap.get(sId) || 0) + Number(m.matched_amount || 0));
      }
    }
  }

  return data.map((row: any) => {
    const bankAccount = Array.isArray(row.bank_account) ? row.bank_account[0] : row.bank_account;
    const sId = Number(row.id);
    const matchGroupId = matchMap.get(sId);
    const allocated = matchSumMap.get(sId) || 0;
    const totalAmt = Number(row.amount);
    const remaining = Math.max(0, totalAmt - allocated);

    return {
      id: `BS-${String(row.id).padStart(3, '0')}`,
      transaction_date: row.transaction_date,
      value_date: row.value_date,
      mutation_type: row.mutation_type,
      amount: totalAmt,
      remaining_amount: row.status === 'PARTIALLY_MATCHED' ? remaining : (row.status === 'MATCHED' ? 0 : totalAmt),
      allocated_amount: allocated,
      balance_after: Number(row.balance_after || 0),
      bank_reference_no: row.bank_reference_no,
      description: row.description,
      status: row.status,
      bank_code: bankAccount?.bank_code || 'MANDIRI',
      bank_name: bankAccount?.bank_name || 'Bank Mandiri',
      account_number: bankAccount?.account_number || '142-00-1111111-1',
      period_name: getPeriodNameFromDate(row.transaction_date),
      matched_group_id: matchGroupId,
    };
  });
}

/**
 * Fetch all GL journal lines directly from Supabase
 */
export async function fetchJournalLinesFromSupabase(): Promise<JournalLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('transaction_journal')
    .select(`
      id,
      voucher_code,
      transaction_date,
      description,
      total_amount,
      status,
      transaction_journal_line (
        id,
        line_no,
        account_id,
        line_description,
        debit_amount,
        credit_amount,
        is_reconciled,
        master_bbs (
          kd_bbs,
          nama_bbs
        )
      )
    `)
    .order('id', { ascending: true });

  if (error || !data) {
    console.error('Error fetching journals from Supabase:', error);
    return [];
  }

  // Also fetch existing matches to map matched_group_id
  const { data: matchData } = await supabase
    .from('bank_reconciliation_match')
    .select('match_group_id, transaction_journal_id');

  const matchMap = new Map<number, string>();
  if (matchData) {
    for (const m of matchData) {
      if (m.transaction_journal_id && m.match_group_id) {
        matchMap.set(Number(m.transaction_journal_id), m.match_group_id);
      }
    }
  }

  const result: JournalLine[] = [];

  for (const row of data) {
    const lines = row.transaction_journal_line || [];
    // Line 1 is the bank line
    const bankLine = lines.find((l: any) => l.line_no === 1) || lines[0];

    const masterBbs = Array.isArray(bankLine?.master_bbs)
      ? bankLine.master_bbs[0]
      : bankLine?.master_bbs;

    const isDebit = Number(bankLine?.debit_amount || 0) > 0;
    const isReconciled = Boolean(bankLine?.is_reconciled);

    const mappedLines = lines.map((l: any) => {
      const mbbs = Array.isArray(l.master_bbs) ? l.master_bbs[0] : l.master_bbs;
      return {
        id: l.id,
        line_no: l.line_no,
        account_code: mbbs?.kd_bbs || (l.line_no === 1 ? (masterBbs?.kd_bbs || '111-201') : '112-100'),
        account_name: mbbs?.nama_bbs || l.line_description || 'Akun GL',
        line_description: l.line_description || row.description,
        debit_amount: Number(l.debit_amount || 0),
        credit_amount: Number(l.credit_amount || 0),
        is_reconciled: Boolean(l.is_reconciled),
      };
    });

    result.push({
      id: `JL-${String(row.id).padStart(3, '0')}`,
      voucher_code: row.voucher_code,
      transaction_date: row.transaction_date,
      account_code: masterBbs?.kd_bbs || '111-201',
      account_name: bankLine?.line_description || masterBbs?.nama_bbs || 'Bank Mandiri Giro Operasional',
      description: row.description,
      type: isDebit ? 'CR' : 'DB',
      amount: Number(row.total_amount),
      is_reconciled: isReconciled,
      period_name: getPeriodNameFromDate(row.transaction_date),
      lines: mappedLines,
      matched_group_id: matchMap.get(Number(row.id)),
    });
  }

  return result;
}

/**
 * Fetch Chart of Accounts (COA) directly from Supabase master_bbs,
 * enriched with subcategories and balanced enterprise equity/fixed assets.
 */
export async function fetchMasterBbsFromSupabase(): Promise<MasterBbs[]> {
  if (!isSupabaseConfigured || !supabase) {
    return MOCK_MASTER_BBS;
  }

  const { data, error } = await supabase
    .from('master_bbs')
    .select('id, kd_bbs, nama_bbs, account_type, normal_balance, saldo_awal, is_active')
    .order('kd_bbs', { ascending: true });

  if (error || !data || data.length === 0) {
    console.warn('Could not fetch master_bbs from Supabase, using standard fallback:', error);
    return MOCK_MASTER_BBS;
  }

  // Map subcategories based on account code standard
  const subcategoryMap: Record<string, any> = {
    '111-': 'CURRENT_ASSET',
    '112-': 'CURRENT_ASSET',
    '121-190': 'CONTRA_ASSET',
    '122-190': 'CONTRA_ASSET',
    '121-': 'FIXED_ASSET',
    '122-': 'FIXED_ASSET',
    '211-': 'CURRENT_LIABILITY',
    '212-': 'CURRENT_LIABILITY',
    '213-': 'CURRENT_LIABILITY',
    '221-': 'LONG_TERM_LIABILITY',
    '311-': 'EQUITY_CAPITAL',
    '321-': 'EQUITY_RETAINED',
    '331-': 'EQUITY_RETAINED',
    '411-': 'OPERATING_REVENUE',
    '511-': 'COGS_DIRECT',
    '610-': 'OPEX_INDIRECT',
    '710-': 'OTHER_INCOME',
    '421-': 'OTHER_INCOME',
    '810-': 'OTHER_EXPENSE',
  };

  const getSubcategory = (code: string) => {
    for (const prefix of Object.keys(subcategoryMap)) {
      if (code.startsWith(prefix) || code === prefix) {
        return subcategoryMap[prefix];
      }
    }
    return undefined;
  };

  const supabaseAccounts: MasterBbs[] = data.map((row: any) => ({
    id: row.id,
    kd_bbs: row.kd_bbs,
    nama_bbs: row.nama_bbs,
    account_type: row.account_type,
    subcategory: getSubcategory(row.kd_bbs),
    normal_balance: row.normal_balance,
    saldo_awal: Number(row.saldo_awal || 0),
    is_active: Boolean(row.is_active),
  }));

  // Merge any missing accounts from standard enterprise COA (Fixed Assets & Equity)
  const existingCodes = new Set(supabaseAccounts.map((a) => a.kd_bbs));
  const missingAccounts = MOCK_MASTER_BBS.filter((m) => !existingCodes.has(m.kd_bbs));

  // Compute balanced initial equity so that Total Assets = Total Liabilities + Total Equity
  const allMerged = [...supabaseAccounts, ...missingAccounts];
  const totalAssets = allMerged
    .filter((a) => a.account_type === 'ASSET')
    .reduce((s, a) => s + (a.normal_balance === 'D' ? a.saldo_awal : -a.saldo_awal), 0);
  const totalLiab = allMerged
    .filter((a) => a.account_type === 'LIABILITY')
    .reduce((s, a) => s + (a.normal_balance === 'K' ? a.saldo_awal : -a.saldo_awal), 0);
  const totalRev = allMerged
    .filter((a) => a.account_type === 'REVENUE')
    .reduce((s, a) => s + (a.normal_balance === 'K' ? a.saldo_awal : -a.saldo_awal), 0);
  const totalExp = allMerged
    .filter((a) => a.account_type === 'EXPENSE')
    .reduce((s, a) => s + (a.normal_balance === 'D' ? a.saldo_awal : -a.saldo_awal), 0);

  const initialNetIncome = totalRev - totalExp;
  const targetInitialEquity = (totalAssets - totalLiab) - initialNetIncome;

  return allMerged.map((acc) => {
    if (acc.kd_bbs === '311-100') {
      return { ...acc, saldo_awal: Math.max(0, targetInitialEquity - 323500000) };
    }
    if (acc.kd_bbs === '321-100') {
      return { ...acc, saldo_awal: 323500000 };
    }
    if (acc.kd_bbs === '331-100') {
      return { ...acc, saldo_awal: 0 };
    }
    return acc;
  });
}

/**
 * Fetch all transaction journals and their line items directly from Supabase
 * with support for month period filtering (e.g. '2026-10', '2026-09', or 'ALL').
 */
export async function fetchFinancialJournalsFromSupabase(
  periodFilter?: string
): Promise<TransactionJournalHeader[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  let query = supabase
    .from('transaction_journal')
    .select(`
      id,
      voucher_code,
      transaction_date,
      description,
      total_amount,
      status,
      transaction_journal_line (
        id,
        line_no,
        account_id,
        line_description,
        debit_amount,
        credit_amount,
        is_reconciled,
        master_bbs (
          kd_bbs,
          nama_bbs,
          account_type,
          normal_balance
        )
      )
    `)
    .eq('status', 'POSTED')
    .order('transaction_date', { ascending: true });

  // Filter based on period if provided
  if (periodFilter && periodFilter !== 'ALL') {
    let startDate = '';
    let endDate = '';

    if (periodFilter === 'Oktober 2026' || periodFilter === '2026-10') {
      startDate = '2026-10-01';
      endDate = '2026-10-31';
    } else if (periodFilter === 'September 2026' || periodFilter === '2026-09') {
      startDate = '2026-09-01';
      endDate = '2026-09-30';
    } else if (periodFilter === 'Januari 2026' || periodFilter === '2026-01') {
      startDate = '2026-01-01';
      endDate = '2026-01-31';
    } else if (periodFilter.length === 7 && periodFilter.startsWith('2026-')) {
      const month = periodFilter.slice(5, 7);
      startDate = `${periodFilter}-01`;
      endDate = `${periodFilter}-31`;
    }

    if (startDate && endDate) {
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('Error fetching financial journals from Supabase:', error);
    return [];
  }

  return data.map((row: any) => {
    const rawLines = row.transaction_journal_line || [];
    const lines: TransactionJournalLineItem[] = rawLines.map((l: any) => {
      const mbbs = Array.isArray(l.master_bbs) ? l.master_bbs[0] : l.master_bbs;
      return {
        id: l.id,
        line_no: l.line_no,
        account_code: mbbs?.kd_bbs || '111-201',
        account_name: mbbs?.nama_bbs || l.line_description || 'Akun GL',
        line_description: l.line_description || row.description,
        debit_amount: Number(l.debit_amount || 0),
        credit_amount: Number(l.credit_amount || 0),
        is_reconciled: Boolean(l.is_reconciled),
      };
    });

    return {
      id: row.id,
      voucher_code: row.voucher_code,
      transaction_date: row.transaction_date,
      description: row.description,
      total_amount: Number(row.total_amount),
      status: row.status,
      lines: lines,
    };
  });
}

/**
 * Fetch Voucher Drill-Down lines for a specific account code from Supabase
 */
export async function fetchAccountVoucherDrillDown(
  accountCode: string,
  periodFilter?: string
): Promise<
  Array<{
    voucher_code: string;
    transaction_date: string;
    description: string;
    line_description: string;
    debit_amount: number;
    credit_amount: number;
  }>
> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const journals = await fetchFinancialJournalsFromSupabase(periodFilter);
  const result: Array<{
    voucher_code: string;
    transaction_date: string;
    description: string;
    line_description: string;
    debit_amount: number;
    credit_amount: number;
  }> = [];

  for (const j of journals) {
    for (const l of j.lines) {
      if (l.account_code === accountCode) {
        result.push({
          voucher_code: j.voucher_code,
          transaction_date: j.transaction_date,
          description: j.description,
          line_description: l.line_description,
          debit_amount: l.debit_amount,
          credit_amount: l.credit_amount,
        });
      }
    }
  }

  return result;
}

