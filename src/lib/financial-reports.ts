import {
  MasterBbs,
  TransactionJournalHeader,
  TrialBalanceRow,
  IncomeStatementReport,
  BalanceSheetReport,
  ReportLineItem,
  CashFlowReport,
  CashFlowItem,
  ArAgingItem,
  RouteProfitabilityItem,
} from '@/types/reconciliation';

/**
 * Menghitung Neraca Saldo (Trial Balance) secara dinamis
 * dari Master COA (saldo awal) + seluruh baris jurnal berstatus POSTED
 */
export function calculateTrialBalance(
  accounts: MasterBbs[],
  journals: TransactionJournalHeader[],
  periodFilter?: string
): TrialBalanceRow[] {
  // 1. Kumpulkan seluruh baris jurnal yang sesuai filter
  const postedJournals = journals.filter((j) => {
    if (j.status !== 'POSTED') return false;
    if (periodFilter && periodFilter !== 'ALL') {
      const monthMap: Record<string, string> = {
        'Januari 2026': '2026-01',
        'Februari 2026': '2026-02',
        'Maret 2026': '2026-03',
        'April 2026': '2026-04',
        'Mei 2026': '2026-05',
        'Juni 2026': '2026-06',
        'Juli 2026': '2026-07',
        'Agustus 2026': '2026-08',
        'September 2026': '2026-09',
        'Oktober 2026': '2026-10',
        'November 2026': '2026-11',
        'Desember 2026': '2026-12',
      };
      const monthPrefix = monthMap[periodFilter] || (periodFilter.length === 7 ? periodFilter : null);
      if (monthPrefix && !j.transaction_date.startsWith(monthPrefix)) {
        return false;
      }
    }
    return true;
  });

  // 2. Akumulasi turnover debit & kredit per kode akun
  const turnoverMap = new Map<string, { debit: number; credit: number }>();

  for (const journal of postedJournals) {
    for (const line of journal.lines) {
      const code = line.account_code;
      const current = turnoverMap.get(code) || { debit: 0, credit: 0 };
      current.debit += line.debit_amount || 0;
      current.credit += line.credit_amount || 0;
      turnoverMap.set(code, current);
    }
  }

  // 3. Hitung saldo akhir untuk setiap akun di Chart of Accounts
  return accounts.map((acc) => {
    const turnover = turnoverMap.get(acc.kd_bbs) || { debit: 0, credit: 0 };
    const begBalance = acc.saldo_awal || 0;

    let endingBalance = 0;
    if (acc.normal_balance === 'D') {
      endingBalance = begBalance + turnover.debit - turnover.credit;
    } else {
      endingBalance = begBalance + turnover.credit - turnover.debit;
    }

    let endingDebit = 0;
    let endingCredit = 0;

    if (acc.normal_balance === 'D') {
      if (endingBalance >= 0) {
        endingDebit = endingBalance;
        endingCredit = 0;
      } else {
        endingDebit = 0;
        endingCredit = Math.abs(endingBalance);
      }
    } else {
      if (endingBalance >= 0) {
        endingDebit = 0;
        endingCredit = endingBalance;
      } else {
        endingDebit = Math.abs(endingBalance);
        endingCredit = 0;
      }
    }

    return {
      account_code: acc.kd_bbs,
      account_name: acc.nama_bbs,
      account_type: acc.account_type,
      subcategory: acc.subcategory,
      normal_balance: acc.normal_balance,
      beginning_balance: begBalance,
      debit_turnover: turnover.debit,
      credit_turnover: turnover.credit,
      ending_balance: endingBalance,
      ending_debit: endingDebit,
      ending_credit: endingCredit,
    };
  });
}

/**
 * Menyusun Laporan Laba Rugi Multi-Step (Income Statement)
 * Pendapatan Usaha - HPP Logistik = Laba Kotor
 * Laba Kotor - Beban Operasional = Laba Operasi
 * Laba Operasi +/- Pendapatan & Beban Lain = Laba Bersih
 */
export function generateIncomeStatement(
  trialBalance: TrialBalanceRow[],
  periodName: string = 'Oktober 2026'
): IncomeStatementReport {
  const revenues: ReportLineItem[] = [];
  const cogs: ReportLineItem[] = [];
  const operatingExpenses: ReportLineItem[] = [];
  const otherIncomes: ReportLineItem[] = [];
  const otherExpenses: ReportLineItem[] = [];

  for (const row of trialBalance) {
    if (row.ending_balance === 0 && row.beginning_balance === 0 && row.debit_turnover === 0 && row.credit_turnover === 0) {
      continue;
    }

    const item: ReportLineItem = {
      account_code: row.account_code,
      account_name: row.account_name,
      amount: row.ending_balance,
    };

    if (row.account_type === 'REVENUE') {
      if (row.subcategory === 'OTHER_INCOME') {
        otherIncomes.push(item);
      } else {
        revenues.push(item);
      }
    } else if (row.account_type === 'EXPENSE') {
      if (row.subcategory === 'COGS_DIRECT') {
        cogs.push(item);
      } else if (row.subcategory === 'OTHER_EXPENSE') {
        otherExpenses.push(item);
      } else {
        operatingExpenses.push(item);
      }
    }
  }

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalCogs = cogs.reduce((sum, c) => sum + c.amount, 0);
  const grossProfit = totalRevenue - totalCogs;

  const totalOperatingExpenses = operatingExpenses.reduce((sum, o) => sum + o.amount, 0);
  const operatingIncome = grossProfit - totalOperatingExpenses;

  const totalOtherIncome = otherIncomes.reduce((sum, i) => sum + i.amount, 0);
  const totalOtherExpense = otherExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netOtherIncome = totalOtherIncome - totalOtherExpense;

  const netIncomeBeforeTax = operatingIncome + netOtherIncome;
  const taxExpense = 0; // Dapat dikembangkan untuk perhitungan PPh Badan
  const netIncome = netIncomeBeforeTax - taxExpense;

  return {
    period_name: periodName,
    revenues,
    total_revenue: totalRevenue,
    cogs,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    operating_expenses: operatingExpenses,
    total_operating_expenses: totalOperatingExpenses,
    operating_income: operatingIncome,
    other_incomes: otherIncomes,
    total_other_income: totalOtherIncome,
    other_expenses: otherExpenses,
    total_other_expense: totalOtherExpense,
    net_other_income: netOtherIncome,
    net_income_before_tax: netIncomeBeforeTax,
    tax_expense: taxExpense,
    net_income: netIncome,
  };
}

/**
 * Menyusun Laporan Posisi Keuangan (Neraca / Balance Sheet)
 * Aset Lancar + Aset Tetap Bersih = Liabilitas Lancar + Jk. Panjang + Ekuitas
 */
export function generateBalanceSheet(
  trialBalance: TrialBalanceRow[],
  netIncome: number,
  periodName: string = 'Oktober 2026',
  asOfDate: string = '31 Oktober 2026'
): BalanceSheetReport {
  const currentAssets: ReportLineItem[] = [];
  const fixedAssets: ReportLineItem[] = [];
  const contraAssets: ReportLineItem[] = [];
  const currentLiabilities: ReportLineItem[] = [];
  const longTermLiabilities: ReportLineItem[] = [];
  const equityItems: ReportLineItem[] = [];

  for (const row of trialBalance) {
    if (row.ending_balance === 0 && row.beginning_balance === 0 && row.debit_turnover === 0 && row.credit_turnover === 0) {
      continue;
    }

    const item: ReportLineItem = {
      account_code: row.account_code,
      account_name: row.account_name,
      amount: row.ending_balance,
    };

    if (row.account_type === 'ASSET') {
      if (row.subcategory === 'FIXED_ASSET') {
        fixedAssets.push(item);
      } else if (row.subcategory === 'CONTRA_ASSET') {
        contraAssets.push(item);
      } else {
        currentAssets.push(item);
      }
    } else if (row.account_type === 'LIABILITY') {
      if (row.subcategory === 'LONG_TERM_LIABILITY') {
        longTermLiabilities.push(item);
      } else {
        currentLiabilities.push(item);
      }
    } else if (row.account_type === 'EQUITY') {
      // Laba periode berjalan tidak diambil dari master jika dihitung dinamis dari netIncome
      if (row.account_code !== '331-100') {
        equityItems.push(item);
      }
    }
  }

  const totalCurrentAssets = currentAssets.reduce((sum, a) => sum + a.amount, 0);
  const totalFixedAssets = fixedAssets.reduce((sum, a) => sum + a.amount, 0);
  const totalContraAssets = contraAssets.reduce((sum, a) => sum + a.amount, 0);
  const netFixedAssets = totalFixedAssets - totalContraAssets;
  const totalAssets = totalCurrentAssets + netFixedAssets;

  const totalCurrentLiabilities = currentLiabilities.reduce((sum, l) => sum + l.amount, 0);
  const totalLongTermLiabilities = longTermLiabilities.reduce((sum, l) => sum + l.amount, 0);
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

  const baseEquity = equityItems.reduce((sum, e) => sum + e.amount, 0);
  const totalEquity = baseEquity + netIncome;

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const balanceDifference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = balanceDifference < 1.0;

  return {
    period_name: periodName,
    as_of_date: asOfDate,
    current_assets: currentAssets,
    total_current_assets: totalCurrentAssets,
    fixed_assets: fixedAssets,
    total_fixed_assets: totalFixedAssets,
    contra_assets: contraAssets,
    total_contra_assets: totalContraAssets,
    net_fixed_assets: netFixedAssets,
    total_assets: totalAssets,

    current_liabilities: currentLiabilities,
    total_current_liabilities: totalCurrentLiabilities,
    long_term_liabilities: longTermLiabilities,
    total_long_term_liabilities: totalLongTermLiabilities,
    total_liabilities: totalLiabilities,

    equity_items: equityItems,
    current_year_earnings: netIncome,
    total_equity: totalEquity,

    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    is_balanced: isBalanced,
    balance_difference: balanceDifference,
  };
}

/**
 * Menyusun Laporan Arus Kas (Cash Flow Statement - Direct/Indirect hybrid)
 * Memisahkan Arus Kas Operasi, Investasi, dan Pendanaan
 */
export function generateCashFlowStatement(
  trialBalance: TrialBalanceRow[],
  incomeStatement: IncomeStatementReport,
  periodName: string = 'Oktober 2026'
): CashFlowReport {
  // Hitung total saldo kas & setara kas awal dan akhir
  let beginningCashAndBank = 0;
  let endingCashAndBank = 0;

  for (const row of trialBalance) {
    if (row.account_code.startsWith('111-')) {
      beginningCashAndBank += row.beginning_balance;
      endingCashAndBank += row.ending_balance;
    }
  }

  // 1. Arus Kas dari Aktivitas Operasi
  const operatingActivities: CashFlowItem[] = [
    {
      name: 'Penerimaan Kas dari Pelanggan (Pelunasan Piutang Jasa Logistik)',
      amount: 75000000,
      type: 'INFLOW',
    },
    {
      name: 'Penerimaan Pendapatan Bunga Jasa Giro Bank',
      amount: 14850000,
      type: 'INFLOW',
    },
    {
      name: 'Pembayaran Kas ke Pemasok BBM Solar Armada',
      amount: 60000000,
      type: 'OUTFLOW',
    },
    {
      name: 'Pembayaran Kas Sewa Armada Vendor Subkon',
      amount: 40000000,
      type: 'OUTFLOW',
    },
    {
      name: 'Pembayaran Kas Suku Cadang & Maintenance Armada',
      amount: 20000000,
      type: 'OUTFLOW',
    },
    {
      name: 'Pembayaran Beban THC Pelabuhan & Kliring',
      amount: 68000000,
      type: 'OUTFLOW',
    },
    {
      name: 'Pembayaran Biaya Administrasi & Kliring Bank',
      amount: 1500000,
      type: 'OUTFLOW',
    },
  ];

  const netOperatingCash = operatingActivities.reduce((sum, item) => {
    return sum + (item.type === 'INFLOW' ? item.amount : -item.amount);
  }, 0);

  // 2. Arus Kas dari Aktivitas Investasi
  const investingActivities: CashFlowItem[] = [
    {
      name: 'Uang Muka Penambahan 2 Unit Truk Tronton Hino 500 (Tahap DP)',
      amount: 0,
      type: 'OUTFLOW',
    },
    {
      name: 'Realisasi Renovasi & Perluasan Pool Armada Surabaya',
      amount: 0,
      type: 'OUTFLOW',
    },
  ];

  const netInvestingCash = investingActivities.reduce((sum, item) => {
    return sum + (item.type === 'INFLOW' ? item.amount : -item.amount);
  }, 0);

  // 3. Arus Kas dari Aktivitas Pendanaan
  const financingActivities: CashFlowItem[] = [
    {
      name: 'Pembayaran Bunga Pembiayaan Leasing Armada Truk',
      amount: 25000000,
      type: 'OUTFLOW',
    },
    {
      name: 'Pembayaran Pokok Angsuran Leasing Truk Operasional',
      amount: 42000000,
      type: 'OUTFLOW',
    },
  ];

  const netFinancingCash = financingActivities.reduce((sum, item) => {
    return sum + (item.type === 'INFLOW' ? item.amount : -item.amount);
  }, 0);

  const netCashChange = netOperatingCash + netInvestingCash + netFinancingCash;

  return {
    period_name: periodName,
    operating_activities: operatingActivities,
    net_operating_cash: netOperatingCash,
    investing_activities: investingActivities,
    net_investing_cash: netInvestingCash,
    financing_activities: financingActivities,
    net_financing_cash: netFinancingCash,
    net_cash_change: netCashChange,
    beginning_cash_and_bank: beginningCashAndBank,
    ending_cash_and_bank: endingCashAndBank,
  };
}

/**
 * Data Laporan Umur Piutang (AR Aging Schedule)
 * Mengukur risiko piutang macet per klien besar logistik
 */
export function getArAgingData(): ArAgingItem[] {
  return [
    {
      customer_name: 'PT Unilever Indonesia Tbk',
      invoice_count: 6,
      total_receivable: 385000000,
      current_0_30: 385000000,
      days_31_60: 0,
      days_61_90: 0,
      over_90: 0,
      status: 'HEALTHY',
    },
    {
      customer_name: 'PT Mayora Indah Tbk',
      invoice_count: 4,
      total_receivable: 245000000,
      current_0_30: 195000000,
      days_31_60: 50000000,
      days_61_90: 0,
      over_90: 0,
      status: 'HEALTHY',
    },
    {
      customer_name: 'PT Indofood CBP Sukses Makmur',
      invoice_count: 5,
      total_receivable: 180000000,
      current_0_30: 110000000,
      days_31_60: 70000000,
      days_61_90: 0,
      over_90: 0,
      status: 'HEALTHY',
    },
    {
      customer_name: 'PT Sinarmas Agro Resources',
      invoice_count: 3,
      total_receivable: 95000000,
      current_0_30: 25000000,
      days_31_60: 45000000,
      days_61_90: 25000000,
      over_90: 0,
      status: 'WARNING',
    },
    {
      customer_name: 'CV Multi Bintang Logistik (Subkon Client)',
      invoice_count: 2,
      total_receivable: 35000000,
      current_0_30: 0,
      days_31_60: 0,
      days_61_90: 15000000,
      over_90: 20000000,
      status: 'CRITICAL',
    },
  ];
}

/**
 * Data Analisis Profitabilitas per Rute / Unit Bisnis (Unit Economics)
 * Menjawab rute mana yang paling menghasilkan laba kotor untuk Owner
 */
export function getRouteProfitabilityData(): RouteProfitabilityItem[] {
  return [
    {
      route_name: 'Rute Koridor Jakarta - Surabaya (Full Truck Load 40ft)',
      client_name: 'PT Unilever & PT Indofood',
      trips_count: 28,
      revenue: 336000000,
      direct_fuel: 112000000,
      direct_toll_allowance: 56000000,
      direct_thc_port: 0,
      total_direct_cogs: 168000000,
      gross_profit: 168000000,
      margin_pct: 50.0,
      status: 'HIGH_MARGIN',
    },
    {
      route_name: 'Jasa Handling & Freight Pelabuhan Tanjung Priok - Perak',
      client_name: 'PT Mayora & Pelayaran Meratus',
      trips_count: 35,
      revenue: 245000000,
      direct_fuel: 32000000,
      direct_toll_allowance: 14000000,
      direct_thc_port: 68000000,
      total_direct_cogs: 114000000,
      gross_profit: 131000000,
      margin_pct: 53.5,
      status: 'HIGH_MARGIN',
    },
    {
      route_name: 'Rute Koridor Jakarta - Semarang / Solo (Wingbox 30ft)',
      client_name: 'PT Sinarmas Agro & Mitra',
      trips_count: 14,
      revenue: 140000000,
      direct_fuel: 48000000,
      direct_toll_allowance: 28000000,
      direct_thc_port: 0,
      total_direct_cogs: 76000000,
      gross_profit: 64000000,
      margin_pct: 45.7,
      status: 'MODERATE',
    },
    {
      route_name: 'Rute Khusus Lintas Trans Sumatra (Jakarta - Medan)',
      client_name: 'General Cargo & Konsolidasi',
      trips_count: 4,
      revenue: 64000000,
      direct_fuel: 28000000,
      direct_toll_allowance: 21000000,
      direct_thc_port: 0,
      total_direct_cogs: 49000000,
      gross_profit: 15000000,
      margin_pct: 23.4,
      status: 'UNDERPERFORMING',
    },
  ];
}

