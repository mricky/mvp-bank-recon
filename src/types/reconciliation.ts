export type MutationType = 'CR' | 'DB';
export type BankLineStatus = 'UNMATCHED' | 'MATCHED' | 'PARTIALLY_MATCHED';
export type SessionStatus = 'OPEN' | 'LOCKED' | 'VOID';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type JournalStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export interface BankStatementLine {
  id: string;
  transaction_date: string;
  value_date: string;
  mutation_type: MutationType;
  amount: number;
  remaining_amount?: number;
  allocated_amount?: number;
  balance_after?: number;
  bank_reference_no: string;
  description: string;
  status: BankLineStatus;
  matched_group_id?: string;
  bank_code?: string;
  bank_name?: string;
  account_number?: string;
  period_name?: string;
  compliance_flag?: 'FLAG_CLOSED_PERIOD' | 'NORMAL';
  is_closed_period?: boolean;
}

export interface ReconciliationAuditTrail {
  id: string;
  event_type: 'MATCH' | 'UNMATCH_STORNO' | 'SPLIT_PPH23' | 'FLAG_CLOSED_PERIOD';
  group_id: string;
  bank_reference_no: string;
  voucher_code?: string;
  storno_voucher_code?: string;
  amount: number;
  tax_withholding_amount?: number;
  fee_amount?: number;
  reason: string;
  operator: string;
  timestamp: string;
}

export interface MultiSplitMatchDetail {
  bank_reference_no: string;
  invoice_voucher_code: string;
  gross_invoice_amount: number;
  net_bank_amount: number;
  pph23_amount: number;
  bank_fee_amount: number;
  target_ar_account_code: string;
  target_tax_prepaid_account_code: string;
  target_fee_account_code: string;
}

export interface JournalLine {
  id: string;
  voucher_code: string;
  transaction_date: string;
  account_code: string;
  account_name: string;
  description: string;
  type: MutationType; // CR = Kas Masuk (Debit GL Bank), DB = Kas Keluar (Kredit GL Bank)
  amount: number;
  is_reconciled: boolean;
  matched_group_id?: string;
  bank_account_number?: string;
  period_name?: string;
  invoice_no?: string;
  partner_name?: string;
  lines?: TransactionJournalLineItem[];
}

export interface ReconciliationRule {
  id: string;
  keyword: string;
  mutation_type: MutationType;
  target_account_code: string;
  target_account_name: string;
  auto_post: boolean;
}

export interface ReconciliationSession {
  id: string;
  bank_name: string;
  account_number: string;
  period_name: string;
  bank_opening_balance: number;
  bank_ending_balance: number;
  gl_opening_balance: number;
  gl_ending_balance: number;
  status: SessionStatus;
  reconciled_at?: string;
  reconciled_by?: string;
}

// Master Chart of Accounts (master_bbs)
export type AccountSubCategory =
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'CONTRA_ASSET'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'EQUITY_CAPITAL'
  | 'EQUITY_RETAINED'
  | 'OPERATING_REVENUE'
  | 'COGS_DIRECT'
  | 'OPEX_INDIRECT'
  | 'OTHER_INCOME'
  | 'OTHER_EXPENSE';

export interface MasterBbs {
  id: number;
  kd_bbs: string;
  nama_bbs: string;
  account_type: AccountType;
  subcategory?: AccountSubCategory;
  normal_balance: 'D' | 'K';
  saldo_awal: number;
  is_active: boolean;
}

// Master Bank Account (bank_account)
export interface BankAccountMaster {
  id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  currency_code: string;
  branch_name: string;
  is_api_enabled: boolean;
  last_sync_at: string;
  is_active: boolean;
}

// Fiscal Period (fiscal_period)
export interface FiscalPeriodMaster {
  id: number;
  period_name: string;
  start_date: string;
  end_date: string;
  status: 'OPEN' | 'CLOSED';
}

// Transaction Journal with Line Items (transaction_journal & transaction_journal_line)
export interface TransactionJournalLineItem {
  id: number;
  line_no: number;
  account_code: string;
  account_name: string;
  line_description: string;
  debit_amount: number;
  credit_amount: number;
  is_reconciled: boolean;
}

export interface TransactionJournalHeader {
  id: number;
  voucher_code: string;
  transaction_date: string;
  description: string;
  total_amount: number;
  status: JournalStatus;
  lines: TransactionJournalLineItem[];
}

// --- FINANCIAL REPORTING TYPES (Trial Balance, Income Statement, Balance Sheet) ---

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  subcategory?: AccountSubCategory;
  normal_balance: 'D' | 'K';
  beginning_balance: number;
  debit_turnover: number;
  credit_turnover: number;
  ending_balance: number;
  ending_debit: number;
  ending_credit: number;
}

export interface ReportLineItem {
  account_code: string;
  account_name: string;
  amount: number;
}

export interface IncomeStatementReport {
  period_name: string;
  revenues: ReportLineItem[];
  total_revenue: number;
  cogs: ReportLineItem[];
  total_cogs: number;
  gross_profit: number;
  operating_expenses: ReportLineItem[];
  total_operating_expenses: number;
  operating_income: number;
  other_incomes: ReportLineItem[];
  total_other_income: number;
  other_expenses: ReportLineItem[];
  total_other_expense: number;
  net_other_income: number;
  net_income_before_tax: number;
  tax_expense: number;
  net_income: number;
}

export interface BalanceSheetReport {
  period_name: string;
  as_of_date: string;
  current_assets: ReportLineItem[];
  total_current_assets: number;
  fixed_assets: ReportLineItem[];
  total_fixed_assets: number;
  contra_assets: ReportLineItem[];
  total_contra_assets: number;
  net_fixed_assets: number;
  total_assets: number;

  current_liabilities: ReportLineItem[];
  total_current_liabilities: number;
  long_term_liabilities: ReportLineItem[];
  total_long_term_liabilities: number;
  total_liabilities: number;

  equity_items: ReportLineItem[];
  current_year_earnings: number;
  total_equity: number;

  total_liabilities_and_equity: number;
  is_balanced: boolean;
  balance_difference: number;
}

// --- CASH FLOW & OWNER EXECUTIVE REPORTING TYPES ---

export interface CashFlowItem {
  name: string;
  amount: number;
  type: 'INFLOW' | 'OUTFLOW';
}

export interface CashFlowReport {
  period_name: string;
  operating_activities: CashFlowItem[];
  net_operating_cash: number;
  investing_activities: CashFlowItem[];
  net_investing_cash: number;
  financing_activities: CashFlowItem[];
  net_financing_cash: number;
  net_cash_change: number;
  beginning_cash_and_bank: number;
  ending_cash_and_bank: number;
}

export interface ArAgingItem {
  customer_name: string;
  invoice_count: number;
  total_receivable: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface RouteProfitabilityItem {
  route_name: string;
  client_name: string;
  trips_count: number;
  revenue: number;
  direct_fuel: number;
  direct_toll_allowance: number;
  direct_thc_port: number;
  total_direct_cogs: number;
  gross_profit: number;
  margin_pct: number;
  status: 'HIGH_MARGIN' | 'MODERATE' | 'UNDERPERFORMING';
}


