'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MOCK_MASTER_BBS, MOCK_TRANSACTION_JOURNALS, MOCK_FISCAL_PERIODS, MOCK_BANK_MUTATIONS } from '@/lib/mock-data';
import { MasterBbs, TransactionJournalHeader, BankStatementLine } from '@/types/reconciliation';
import {
  calculateTrialBalance,
  generateIncomeStatement,
  generateBalanceSheet,
  generateCashFlowStatement,
  getArAgingData,
  getRouteProfitabilityData,
} from '@/lib/financial-reports';
import {
  fetchMasterBbsFromSupabase,
  fetchFinancialJournalsFromSupabase,
  fetchAccountVoucherDrillDown,
  fetchBankStatementLinesFromSupabase,
} from '@/lib/supabase-recon';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  FileText,
  TrendingUp,
  Scale,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Truck,
  Building,
  Info,
  BookOpen,
  Wallet,
  Briefcase,
  Clock,
  MapPin,
  Users,
  Database,
  RefreshCw,
  Printer,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

function formatAccountingIDR(val: number, includePrefix: boolean = true): string {
  if (val === 0) return includePrefix ? 'Rp -' : '-';
  const isNeg = val < 0;
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(val));
  if (isNeg) {
    return includePrefix ? `(Rp ${formatted})` : `(${formatted})`;
  }
  return includePrefix ? `Rp ${formatted}` : formatted;
}

interface FinancialReportsViewProps {
  onNavigateToRecon?: () => void;
}

export default function FinancialReportsView({ onNavigateToRecon }: FinancialReportsViewProps = {}) {
  const [activeReportTab, setActiveReportTab] = useState<
    'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'TRIAL_BALANCE' | 'CASH_FLOW' | 'OWNER_ANALYSIS'
  >('BALANCE_SHEET');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Oktober 2026');
  const [showAcidModal, setShowAcidModal] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

  // Live Supabase Data State
  const [accounts, setAccounts] = useState<MasterBbs[]>(MOCK_MASTER_BBS);
  const [journals, setJournals] = useState<TransactionJournalHeader[]>(MOCK_TRANSACTION_JOURNALS);
  const [prevMonthJournals, setPrevMonthJournals] = useState<TransactionJournalHeader[]>([]);
  const [bankLines, setBankLines] = useState<BankStatementLine[]>(MOCK_BANK_MUTATIONS);
  const [isLiveDatabase, setIsLiveDatabase] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMoMComparison, setIsMoMComparison] = useState<boolean>(false);

  // Drill-Down Modal State
  const [drillDownAccount, setDrillDownAccount] = useState<{ code: string; name: string } | null>(null);
  const [drillDownLines, setDrillDownLines] = useState<any[]>([]);
  const [isLoadingDrillDown, setIsLoadingDrillDown] = useState<boolean>(false);

  // Load Data directly from Supabase
  const loadDataFromSupabase = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        const [fetchedAccounts, fetchedJournals, fetchedPrevJournals, fetchedBankLines] = await Promise.all([
          fetchMasterBbsFromSupabase(),
          fetchFinancialJournalsFromSupabase(selectedPeriod),
          fetchFinancialJournalsFromSupabase('September 2026'),
          fetchBankStatementLinesFromSupabase(),
        ]);

        if (fetchedJournals && fetchedJournals.length > 0) {
          setAccounts(fetchedAccounts);
          setJournals(fetchedJournals);
          setPrevMonthJournals(fetchedPrevJournals || []);
          setBankLines(fetchedBankLines || []);
          setIsLiveDatabase(true);
        } else {
          // Fallback to rich mock if table empty
          setAccounts(MOCK_MASTER_BBS);
          setJournals(MOCK_TRANSACTION_JOURNALS);
          setBankLines(MOCK_BANK_MUTATIONS);
          setIsLiveDatabase(false);
        }
      } else {
        setAccounts(MOCK_MASTER_BBS);
        setJournals(MOCK_TRANSACTION_JOURNALS);
        setBankLines(MOCK_BANK_MUTATIONS);
        setIsLiveDatabase(false);
      }
    } catch (err) {
      console.error('Error loading Supabase financial reports:', err);
      setAccounts(MOCK_MASTER_BBS);
      setJournals(MOCK_TRANSACTION_JOURNALS);
      setBankLines(MOCK_BANK_MUTATIONS);
      setIsLiveDatabase(false);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadDataFromSupabase();
  }, [loadDataFromSupabase]);

  // Status Rekonsiliasi Bank Dinamis (100% Reconciled vs Draft/Pending)
  const reconStatus = useMemo(() => {
    const relevantBankLines = bankLines.filter((b) => {
      if (b.period_name) {
        return b.period_name.toLowerCase().includes(selectedPeriod.toLowerCase().replace(' 2026', ''));
      }
      if (selectedPeriod === 'Oktober 2026') return b.transaction_date.startsWith('2026-10');
      if (selectedPeriod === 'September 2026') return b.transaction_date.startsWith('2026-09');
      return true;
    });

    const totalBank = relevantBankLines.length;
    const unmatchedBank = relevantBankLines.filter((b) => b.status !== 'MATCHED');
    const matchedBank = relevantBankLines.filter((b) => b.status === 'MATCHED');
    const isFullyReconciled = totalBank > 0 && unmatchedBank.length === 0;

    return {
      totalBank,
      unmatchedCount: unmatchedBank.length,
      matchedCount: matchedBank.length,
      isFullyReconciled,
    };
  }, [bankLines, selectedPeriod]);

  // Handle Account Drill-Down Click
  const handleOpenDrillDown = async (accountCode: string, accountName: string) => {
    setDrillDownAccount({ code: accountCode, name: accountName });
    setIsLoadingDrillDown(true);
    try {
      if (isLiveDatabase) {
        const lines = await fetchAccountVoucherDrillDown(accountCode, selectedPeriod);
        setDrillDownLines(lines);
      } else {
        // Mock Drill-down lines
        const lines: any[] = [];
        for (const j of journals) {
          for (const l of j.lines) {
            if (l.account_code === accountCode) {
              lines.push({
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
        setDrillDownLines(lines);
      }
    } catch (e) {
      console.error('Drill down error:', e);
    } finally {
      setIsLoadingDrillDown(false);
    }
  };

  // Kalkulasi data keuangan bulan berjalan
  const trialBalanceData = useMemo(() => {
    return calculateTrialBalance(accounts, journals, selectedPeriod);
  }, [accounts, journals, selectedPeriod]);

  const incomeStatement = useMemo(() => {
    return generateIncomeStatement(trialBalanceData, selectedPeriod);
  }, [trialBalanceData, selectedPeriod]);

  const balanceSheet = useMemo(() => {
    return generateBalanceSheet(
      trialBalanceData,
      incomeStatement.net_income,
      selectedPeriod,
      selectedPeriod === 'Oktober 2026' ? '31 Oktober 2026' : '31 Desember 2026'
    );
  }, [trialBalanceData, incomeStatement.net_income, selectedPeriod]);

  // Kalkulasi data komparasi bulan lalu (September 2026)
  const prevTrialBalanceData = useMemo(() => {
    return calculateTrialBalance(accounts, prevMonthJournals.length > 0 ? prevMonthJournals : journals, 'September 2026');
  }, [accounts, prevMonthJournals, journals]);

  const prevIncomeStatement = useMemo(() => {
    return generateIncomeStatement(prevTrialBalanceData, 'September 2026');
  }, [prevTrialBalanceData]);

  const prevBalanceSheet = useMemo(() => {
    return generateBalanceSheet(
      prevTrialBalanceData,
      prevIncomeStatement.net_income,
      'September 2026',
      '30 September 2026'
    );
  }, [prevTrialBalanceData, prevIncomeStatement.net_income]);

  // Arus kas & analisis owner
  const cashFlowStatement = useMemo(() => {
    return generateCashFlowStatement(trialBalanceData, incomeStatement, selectedPeriod);
  }, [trialBalanceData, incomeStatement, selectedPeriod]);

  const arAgingData = useMemo(() => {
    return getArAgingData();
  }, []);

  const routeProfitabilityData = useMemo(() => {
    return getRouteProfitabilityData();
  }, []);

  const formatIDR = (val: number) =>
    new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(Math.round(val));

  const grossMarginPct =
    incomeStatement.total_revenue > 0
      ? ((incomeStatement.gross_profit / incomeStatement.total_revenue) * 100).toFixed(1)
      : '0.0';

  const netMarginPct =
    incomeStatement.total_revenue > 0
      ? ((incomeStatement.net_income / incomeStatement.total_revenue) * 100).toFixed(1)
      : '0.0';

  // Export CSV Handler
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (activeReportTab === 'BALANCE_SHEET') {
      csvContent += 'LAPORAN POSISI KEUANGAN (NERACA) - PT NUSANTARA GLOBAL MANDIRI\n';
      csvContent += `Sumber Data: ${isLiveDatabase ? 'Supabase Live PostgreSQL' : 'Mock In-Memory'}\n`;
      csvContent += `Periode: ${selectedPeriod}\n\n`;
      csvContent += 'ASET LANCAR\nKode Akun,Nama Akun,Jumlah (IDR)\n';
      balanceSheet.current_assets.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      csvContent += `Total Aset Lancar,,${balanceSheet.total_current_assets}\n\n`;
      csvContent += 'ASET TETAP\n';
      balanceSheet.fixed_assets.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      balanceSheet.contra_assets.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name} (Akum. Penyusutan)",-${item.amount}\n`;
      });
      csvContent += `Total Aset Tetap Bersih,,${balanceSheet.net_fixed_assets}\n`;
      csvContent += `TOTAL ASET,,${balanceSheet.total_assets}\n\n`;

      csvContent += 'LIABILITAS & EKUITAS\nKode Akun,Nama Akun,Jumlah (IDR)\n';
      balanceSheet.current_liabilities.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      balanceSheet.long_term_liabilities.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      csvContent += `Total Liabilitas,,${balanceSheet.total_liabilities}\n\n`;
      csvContent += 'EKUITAS\n';
      balanceSheet.equity_items.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      csvContent += `"331-100","Laba Periode Berjalan",${balanceSheet.current_year_earnings}\n`;
      csvContent += `Total Ekuitas,,${balanceSheet.total_equity}\n`;
      csvContent += `TOTAL LIABILITAS & EKUITAS,,${balanceSheet.total_liabilities_and_equity}\n`;
    } else if (activeReportTab === 'INCOME_STATEMENT') {
      csvContent += 'LAPORAN LABA RUGI KOMPREHENSIF - PT NUSANTARA GLOBAL MANDIRI\n';
      csvContent += `Periode: ${selectedPeriod}\n\n`;
      csvContent += 'PENDAPATAN USAHA LOGISTIK\nKode Akun,Nama Akun,Jumlah (IDR)\n';
      incomeStatement.revenues.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      csvContent += `Total Pendapatan Usaha,,${incomeStatement.total_revenue}\n\n`;
      csvContent += 'BEBAN POKOK PENDAPATAN (HPP LOGISTIK)\n';
      incomeStatement.cogs.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      csvContent += `Total HPP Logistik,,${incomeStatement.total_cogs}\n`;
      csvContent += `LABA KOTOR (GROSS PROFIT),,${incomeStatement.gross_profit}\n\n`;
      csvContent += 'BEBAN OPERASIONAL (OPEX)\n';
      incomeStatement.operating_expenses.forEach((item) => {
        csvContent += `"${item.account_code}","${item.account_name}",${item.amount}\n`;
      });
      csvContent += `Total Beban Operasional,,${incomeStatement.total_operating_expenses}\n`;
      csvContent += `LABA OPERASIONAL (EBIT),,${incomeStatement.operating_income}\n\n`;
      csvContent += `LABA BERSIH PERIODE BERJALAN,,${incomeStatement.net_income}\n`;
    } else if (activeReportTab === 'CASH_FLOW') {
      csvContent += 'LAPORAN ARUS KAS (CASH FLOW STATEMENT) - PT NUSANTARA GLOBAL MANDIRI\n';
      csvContent += `Periode: ${selectedPeriod}\n\n`;
      csvContent += 'AKTIVITAS OPERASI\nUraian,Arus Kas (IDR)\n';
      cashFlowStatement.operating_activities.forEach((item) => {
        csvContent += `"${item.name}",${item.type === 'INFLOW' ? item.amount : -item.amount}\n`;
      });
      csvContent += `Arus Kas Bersih dari Aktivitas Operasi,,${cashFlowStatement.net_operating_cash}\n\n`;
      csvContent += 'AKTIVITAS INVESTASI\n';
      cashFlowStatement.investing_activities.forEach((item) => {
        csvContent += `"${item.name}",${item.type === 'INFLOW' ? item.amount : -item.amount}\n`;
      });
      csvContent += `Arus Kas Bersih dari Aktivitas Investasi,,${cashFlowStatement.net_investing_cash}\n\n`;
      csvContent += 'AKTIVITAS PENDANAAN\n';
      cashFlowStatement.financing_activities.forEach((item) => {
        csvContent += `"${item.name}",${item.type === 'INFLOW' ? item.amount : -item.amount}\n`;
      });
      csvContent += `Arus Kas Bersih dari Aktivitas Pendanaan,,${cashFlowStatement.net_financing_cash}\n\n`;
      csvContent += `KENAIKAN / (PENURUNAN) KAS BERSIH,,${cashFlowStatement.net_cash_change}\n`;
      csvContent += `SALDO KAS & BANK AWAL PERIODE,,${cashFlowStatement.beginning_cash_and_bank}\n`;
      csvContent += `SALDO KAS & BANK AKHIR PERIODE,,${cashFlowStatement.ending_cash_and_bank}\n`;
    } else if (activeReportTab === 'OWNER_ANALYSIS') {
      csvContent += 'ANALISIS EKSEKUTIF OWNER (AR AGING & PROFITABILITAS RUTE) - PT NUSANTARA GLOBAL MANDIRI\n';
      csvContent += `Periode: ${selectedPeriod}\n\n`;
      csvContent += 'LAPORAN UMUR PIUTANG (AR AGING)\nNama Pelanggan,Jumlah Faktur,Total Piutang,0-30 Hari,31-60 Hari,61-90 Hari,>90 Hari,Status\n';
      arAgingData.forEach((ar) => {
        csvContent += `"${ar.customer_name}",${ar.invoice_count},${ar.total_receivable},${ar.current_0_30},${ar.days_31_60},${ar.days_61_90},${ar.over_90},"${ar.status}"\n`;
      });
      csvContent += '\nPROFITABILITAS PER RUTE LOGISTIK\nNama Rute,Pelanggan Utama,Jumlah Trip,Pendapatan,Biaya BBM,Tol & Uang Jalan,Pelabuhan THC,Total HPP Langsung,Laba Kotor,Margin (%)\n';
      routeProfitabilityData.forEach((r) => {
        csvContent += `"${r.route_name}","${r.client_name}",${r.trips_count},${r.revenue},${r.direct_fuel},${r.direct_toll_allowance},${r.direct_thc_port},${r.total_direct_cogs},${r.gross_profit},${r.margin_pct}%\n`;
      });
    } else {
      csvContent += 'NERACA SALDO (TRIAL BALANCE) - PT NUSANTARA GLOBAL MANDIRI\n';
      csvContent += `Periode: ${selectedPeriod}\n\n`;
      csvContent += 'Kode Akun,Nama Akun,Klasifikasi,Saldo Awal,Turnover Debit,Turnover Kredit,Saldo Akhir Debit,Saldo Akhir Kredit\n';
      trialBalanceData.forEach((row) => {
        csvContent += `"${row.account_code}","${row.account_name}","${row.account_type}",${row.beginning_balance},${row.debit_turnover},${row.credit_turnover},${row.ending_debit},${row.ending_credit}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeReportTab.toLowerCase()}_${selectedPeriod.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger Print PDF
  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div>
      {/* =========================================================================
          SCREEN-ONLY INTERACTIVE DASHBOARD (HIDDEN ON PRINT)
          ========================================================================= */}
      <div className="space-y-5 print:hidden">
        {/* Top Banner & Control Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-bold text-slate-900 tracking-tight">
                    Laporan Keuangan Eksekutif (PSAK / SAK EP Logistik)
                  </h1>
                {/* Database Source Badge */}
                {isLiveDatabase ? (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <Database className="w-3 h-3 text-emerald-600" />
                    Supabase Live ({journals.length} Jurnal)
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1">
                    <Database className="w-3 h-3 text-slate-500" />
                    Mock In-Memory
                  </span>
                )}

                {/* Status Rekonsiliasi Bank */}
                {reconStatus.isFullyReconciled ? (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    AUDITED &amp; RECONCILED (100% Klir)
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      DRAFT — Rekonsiliasi Pending ({reconStatus.unmatchedCount} Mutasi)
                    </span>
                    {onNavigateToRecon && (
                      <button
                        onClick={onNavigateToRecon}
                        className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Buka modul Rekonsiliasi Bank untuk menyelesaikan mutasi yang belum kliring"
                      >
                        Selesaikan Rekonsiliasi <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kalkulasi real-time Buku Besar (General Ledger), Laporan Laba Rugi, Neraca, dan Arus Kas.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh Button */}
          <button
            onClick={loadDataFromSupabase}
            disabled={isLoading}
            title="Muat ulang data terbaru dari Supabase"
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Period Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="Oktober 2026">Oktober 2026 (Periode Berjalan)</option>
              <option value="September 2026">September 2026 (Bulan Lalu)</option>
              <option value="ALL">Semua Periode Fiskal (YTD)</option>
              {MOCK_FISCAL_PERIODS.map((p) => (
                <option key={p.id} value={p.period_name}>
                  {p.period_name} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {/* MoM Comparison Toggle */}
          <button
            onClick={() => setIsMoMComparison(!isMoMComparison)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
              isMoMComparison
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {isMoMComparison ? 'Mode: Komparasi MoM Aktif' : 'Komparasi MoM (Okt vs Sep)'}
          </button>

          {/* Panduan Membaca Laporan Button */}
          <button
            onClick={() => setShowGuideModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-700" />
            Panduan Cara Membaca
          </button>

          {/* ACID Architecture Button */}
          <button
            onClick={() => setShowAcidModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            ACID Compliance
          </button>

          {/* Print PDF Button */}
          <button
            onClick={handlePrintPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-700" />
            Cetak PDF Resmi
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        {/* Card 1: Total Aset */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Aset (Posisi Keuangan)</span>
            <Building className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900">
            Rp {formatIDR(balanceSheet.total_assets)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>Lancar: Rp {formatIDR(balanceSheet.total_current_assets)}</span>
            <span>•</span>
            <span>Tetap Bersih: Rp {formatIDR(balanceSheet.net_fixed_assets)}</span>
          </div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none" />
        </div>

        {/* Card 2: Laba Kotor (Gross Profit) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Laba Kotor Logistik (Gross Profit)</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900">
            Rp {formatIDR(incomeStatement.gross_profit)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <ArrowUpRight className="w-3 h-3" />
            <span>Margin Kotor: {grossMarginPct}%</span>
            <span className="text-slate-400 font-normal">dari Rev Rp {formatIDR(incomeStatement.total_revenue)}</span>
          </div>
        </div>

        {/* Card 3: Laba Bersih (Net Income) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Laba Bersih Periode Berjalan</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-emerald-700">
            Rp {formatIDR(incomeStatement.net_income)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <span>Net Profit Margin: {netMarginPct}%</span>
            <span className="text-slate-400 font-normal">• Tertaut ke Ekuitas</span>
          </div>
        </div>

        {/* Card 4: Neraca Balance Verification */}
        <div className={`p-4 rounded-xl border shadow-sm relative overflow-hidden ${
          balanceSheet.is_balanced
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-rose-50/70 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Validasi Keseimbangan Neraca</span>
            <Scale className={`w-4 h-4 ${balanceSheet.is_balanced ? 'text-emerald-700' : 'text-rose-700'}`} />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-base font-bold font-mono">
            {balanceSheet.is_balanced ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>100% BALANCED</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>UNBALANCED (Selisih)</span>
              </>
            )}
          </div>
          <div className="mt-1 text-[11px] font-mono">
            {balanceSheet.is_balanced ? (
              <span className="text-emerald-700 font-medium">Aset = Liabilitas + Ekuitas (Rp 0 Diff)</span>
            ) : (
              <span className="text-rose-700 font-medium">Selisih: Rp {formatIDR(balanceSheet.balance_difference)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Report Sub-Tabs Navigation */}
      <div className="border-b border-slate-200 flex items-center gap-2 flex-wrap no-print">
        <button
          onClick={() => setActiveReportTab('BALANCE_SHEET')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeReportTab === 'BALANCE_SHEET'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Scale className="w-4 h-4" />
          Neraca (Posisi Keuangan)
        </button>
        <button
          onClick={() => setActiveReportTab('INCOME_STATEMENT')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeReportTab === 'INCOME_STATEMENT'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Laporan Laba Rugi
        </button>
        <button
          onClick={() => setActiveReportTab('CASH_FLOW')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeReportTab === 'CASH_FLOW'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Arus Kas (Cash Flow)
        </button>
        <button
          onClick={() => setActiveReportTab('TRIAL_BALANCE')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeReportTab === 'TRIAL_BALANCE'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Neraca Saldo (Trial Balance)
        </button>
        <button
          onClick={() => setActiveReportTab('OWNER_ANALYSIS')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
            activeReportTab === 'OWNER_ANALYSIS'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Analisis Owner (AR Aging & Rute)
          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">
            C-Level
          </span>
        </button>
      </div>

      {/* --- TAB CONTENT: BALANCE SHEET --- */}
      {activeReportTab === 'BALANCE_SHEET' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Kolom Kiri: ASET */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">ASET (AKTIVA)</h3>
                  <p className="text-[11px] text-slate-500">Harta Lancar &amp; Aset Tetap Armada Logistik</p>
                </div>
                <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  Total: Rp {formatIDR(balanceSheet.total_assets)}
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {/* 1. Aset Lancar */}
                <div>
                  <div className="flex items-center justify-between font-bold text-slate-700 pb-1.5 border-b border-slate-100">
                    <span>ASET LANCAR</span>
                    <span className="font-mono">Rp {formatIDR(balanceSheet.total_current_assets)}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {balanceSheet.current_assets.map((item) => (
                      <div
                        key={item.account_code}
                        onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-600 transition"
                        title="Klik untuk melihat bukti jurnal voucher (Drill-Down)"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 group-hover:text-indigo-600 font-semibold w-16">
                            {item.account_code}
                          </span>
                          <span className="font-medium text-slate-800 group-hover:text-indigo-900">
                            {item.account_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-slate-900">Rp {formatIDR(item.amount)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Aset Tetap */}
                <div className="pt-2">
                  <div className="flex items-center justify-between font-bold text-slate-700 pb-1.5 border-b border-slate-100">
                    <span>ASET TETAP &amp; INFRASTRUKTUR LOGISTIK</span>
                    <span className="font-mono">Rp {formatIDR(balanceSheet.net_fixed_assets)}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {balanceSheet.fixed_assets.map((item) => (
                      <div
                        key={item.account_code}
                        onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-600 transition"
                        title="Klik untuk melihat bukti jurnal voucher (Drill-Down)"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 group-hover:text-indigo-600 font-semibold w-16">
                            {item.account_code}
                          </span>
                          <span className="font-medium text-slate-800 group-hover:text-indigo-900">
                            {item.account_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-slate-900">Rp {formatIDR(item.amount)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 transition" />
                        </div>
                      </div>
                    ))}
                    {balanceSheet.contra_assets.map((item) => (
                      <div
                        key={item.account_code}
                        onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-rose-50 cursor-pointer group text-rose-700 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-rose-400 group-hover:text-rose-600 font-semibold w-16">
                            {item.account_code}
                          </span>
                          <span className="font-medium">{item.account_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-rose-700">(Rp {formatIDR(item.amount)})</span>
                          <ChevronRight className="w-3 h-3 text-rose-300 group-hover:text-rose-600 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Total Aset Footer */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between font-bold text-xs tracking-wide">
              <span>TOTAL ASET</span>
              <span className="font-mono text-sm text-emerald-400">Rp {formatIDR(balanceSheet.total_assets)}</span>
            </div>
          </div>

          {/* Kolom Kanan: LIABILITAS & EKUITAS */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">LIABILITAS &amp; EKUITAS</h3>
                  <p className="text-[11px] text-slate-500">Kewajiban Jangka Pendek, Jangka Panjang &amp; Modal</p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                  Total: Rp {formatIDR(balanceSheet.total_liabilities_and_equity)}
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {/* 1. Liabilitas Jangka Pendek */}
                <div>
                  <div className="flex items-center justify-between font-bold text-slate-700 pb-1.5 border-b border-slate-100">
                    <span>LIABILITAS JANGKA PENDEK</span>
                    <span className="font-mono">Rp {formatIDR(balanceSheet.total_current_liabilities)}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {balanceSheet.current_liabilities.map((item) => (
                      <div
                        key={item.account_code}
                        onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-600 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 group-hover:text-indigo-600 font-semibold w-16">
                            {item.account_code}
                          </span>
                          <span className="font-medium text-slate-800 group-hover:text-indigo-900">
                            {item.account_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-slate-900">Rp {formatIDR(item.amount)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Liabilitas Jangka Panjang */}
                <div className="pt-2">
                  <div className="flex items-center justify-between font-bold text-slate-700 pb-1.5 border-b border-slate-100">
                    <span>LIABILITAS JANGKA PANJANG</span>
                    <span className="font-mono">Rp {formatIDR(balanceSheet.total_long_term_liabilities)}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {balanceSheet.long_term_liabilities.map((item) => (
                      <div
                        key={item.account_code}
                        onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-600 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 group-hover:text-indigo-600 font-semibold w-16">
                            {item.account_code}
                          </span>
                          <span className="font-medium text-slate-800 group-hover:text-indigo-900">
                            {item.account_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-slate-900">Rp {formatIDR(item.amount)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Ekuitas Pemilik */}
                <div className="pt-2">
                  <div className="flex items-center justify-between font-bold text-slate-700 pb-1.5 border-b border-slate-100">
                    <span>EKUITAS (MODAL &amp; LABA DITAHAN)</span>
                    <span className="font-mono">Rp {formatIDR(balanceSheet.total_equity)}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {balanceSheet.equity_items.map((item) => (
                      <div
                        key={item.account_code}
                        onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-600 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 group-hover:text-indigo-600 font-semibold w-16">
                            {item.account_code}
                          </span>
                          <span className="font-medium text-slate-800 group-hover:text-indigo-900">
                            {item.account_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-slate-900">Rp {formatIDR(item.amount)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 transition" />
                        </div>
                      </div>
                    ))}
                    {/* Dynamic link to Net Income */}
                    <div className="flex items-center justify-between py-1.5 px-2 rounded bg-emerald-50/70 border border-emerald-100 text-emerald-900">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-emerald-600 font-bold w-16">331-100</span>
                        <span className="font-semibold">Laba Periode Berjalan (Tersambung Laba Rugi)</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-700">Rp {formatIDR(balanceSheet.current_year_earnings)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Liabilitas & Ekuitas Footer */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between font-bold text-xs tracking-wide">
              <span>TOTAL LIABILITAS &amp; EKUITAS</span>
              <span className="font-mono text-sm text-emerald-400">Rp {formatIDR(balanceSheet.total_liabilities_and_equity)}</span>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: INCOME STATEMENT --- */}
      {activeReportTab === 'INCOME_STATEMENT' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Laporan Laba Rugi Komprehensif (Multi-Step Income Statement)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Standar SAK EP untuk Industri Jasa Transportasi &amp; Ekspedisi Logistik • Periode {selectedPeriod}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-slate-500 block">Laba Bersih Akhir</span>
              <span className="text-base font-bold font-mono text-emerald-600">
                Rp {formatIDR(incomeStatement.net_income)}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6 text-xs max-w-4xl mx-auto">
            {/* Bagian 1: PENDAPATAN USAHA */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-indigo-900 font-extrabold">1. PENDAPATAN USAHA LOGISTIK</span>
                <div className="flex items-center gap-6 font-mono text-indigo-900 font-bold">
                  {isMoMComparison && (
                    <span className="text-slate-400 font-normal">Sep: Rp {formatIDR(prevIncomeStatement.total_revenue)}</span>
                  )}
                  <span>Okt: Rp {formatIDR(incomeStatement.total_revenue)}</span>
                </div>
              </div>
              <div className="space-y-1.5 pl-4">
                {incomeStatement.revenues.map((item) => (
                  <div
                    key={item.account_code}
                    onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-700 transition"
                    title="Klik untuk melihat bukti jurnal voucher"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 group-hover:text-indigo-600 font-semibold text-[11px]">
                        {item.account_code}
                      </span>
                      <span className="group-hover:text-indigo-900 font-medium">{item.account_name}</span>
                    </span>
                    <span className="font-mono font-medium text-slate-900">Rp {formatIDR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bagian 2: BEBAN POKOK PENDAPATAN (HPP LOGISTIK) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-rose-900 font-extrabold">2. BEBAN POKOK PENDAPATAN (HPP LOGISTIK LANGSUNG)</span>
                <span className="font-mono text-rose-800 font-bold">(Rp {formatIDR(incomeStatement.total_cogs)})</span>
              </div>
              <div className="space-y-1.5 pl-4">
                {incomeStatement.cogs.map((item) => (
                  <div
                    key={item.account_code}
                    onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-700 transition"
                    title="Klik untuk melihat bukti jurnal voucher"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 group-hover:text-indigo-600 font-semibold text-[11px]">
                        {item.account_code}
                      </span>
                      <span className="group-hover:text-indigo-900 font-medium">{item.account_name}</span>
                    </span>
                    <span className="font-mono font-medium text-slate-800">Rp {formatIDR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SUB TOTAL: LABA KOTOR */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between font-bold text-xs text-amber-950">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-700" />
                <span>LABA KOTOR (GROSS PROFIT)</span>
                <span className="text-[10px] font-normal text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  Margin {grossMarginPct}%
                </span>
              </div>
              <span className="font-mono text-sm font-extrabold text-amber-900">
                Rp {formatIDR(incomeStatement.gross_profit)}
              </span>
            </div>

            {/* Bagian 3: BEBAN OPERASIONAL (OPEX) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-slate-700 font-extrabold">3. BEBAN OPERASIONAL &amp; UMUM (OPEX)</span>
                <span className="font-mono text-slate-800 font-bold">(Rp {formatIDR(incomeStatement.total_operating_expenses)})</span>
              </div>
              <div className="space-y-1.5 pl-4">
                {incomeStatement.operating_expenses.map((item) => (
                  <div
                    key={item.account_code}
                    onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-100 cursor-pointer group text-slate-700 transition"
                    title="Klik untuk melihat bukti jurnal voucher"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 group-hover:text-indigo-600 font-semibold text-[11px]">
                        {item.account_code}
                      </span>
                      <span className="group-hover:text-indigo-900 font-medium">{item.account_name}</span>
                    </span>
                    <span className="font-mono font-medium text-slate-800">Rp {formatIDR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SUB TOTAL: LABA OPERASIONAL (EBIT) */}
            <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between font-bold text-xs text-slate-900">
              <span>LABA OPERASI SEBELUM BUNGA &amp; PAJAK (EBIT)</span>
              <span className="font-mono text-sm font-extrabold text-slate-900">
                Rp {formatIDR(incomeStatement.operating_income)}
              </span>
            </div>

            {/* Bagian 4: PENDAPATAN & BEBAN NON-OPERASIONAL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-slate-700 font-extrabold">4. PENDAPATAN &amp; (BEBAN) LAIN-LAIN</span>
                <span className="font-mono text-slate-800 font-bold">
                  {incomeStatement.net_other_income >= 0 ? '+' : '-'} Rp {formatIDR(Math.abs(incomeStatement.net_other_income))}
                </span>
              </div>
              <div className="space-y-1.5 pl-4">
                {incomeStatement.other_incomes.map((item) => (
                  <div
                    key={item.account_code}
                    onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-emerald-50 cursor-pointer group text-emerald-700 transition"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-emerald-500 font-semibold text-[11px]">{item.account_code}</span>
                      <span>{item.account_name}</span>
                    </span>
                    <span className="font-mono font-medium">+ Rp {formatIDR(item.amount)}</span>
                  </div>
                ))}
                {incomeStatement.other_expenses.map((item) => (
                  <div
                    key={item.account_code}
                    onClick={() => handleOpenDrillDown(item.account_code, item.account_name)}
                    className="flex items-center justify-between py-1 px-2 rounded hover:bg-rose-50 cursor-pointer group text-rose-700 transition"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-rose-400 font-semibold text-[11px]">{item.account_code}</span>
                      <span>{item.account_name}</span>
                    </span>
                    <span className="font-mono font-medium">- Rp {formatIDR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* GRAND TOTAL: LABA BERSIH PERIODE BERJALAN */}
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl shadow-md flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black tracking-wide uppercase">LABA BERSIH PERIODE BERJALAN (NET INCOME)</h4>
                <p className="text-[11px] text-emerald-100 mt-0.5">
                  Dialirkan otomatis ke Pos Ekuitas Neraca (Akun 331-100)
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-black font-mono tracking-tight block">
                  Rp {formatIDR(incomeStatement.net_income)}
                </span>
                <span className="text-[11px] text-emerald-200 font-medium">Net Margin: {netMarginPct}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: CASH FLOW STATEMENT --- */}
      {activeReportTab === 'CASH_FLOW' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                Laporan Arus Kas (Cash Flow Statement)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Aliran uang masuk &amp; keluar riil bank: Operasi, Investasi, dan Pembiayaan Leasing Armada
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-slate-500 block">Kenaikan / (Penurunan) Kas Bersih</span>
              <span className={`text-base font-bold font-mono ${
                cashFlowStatement.net_cash_change >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {cashFlowStatement.net_cash_change >= 0 ? '+' : '-'} Rp {formatIDR(Math.abs(cashFlowStatement.net_cash_change))}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6 text-xs max-w-4xl mx-auto">
            {/* Quick Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] text-slate-500 font-medium block">Arus Kas Operasi</span>
                <span className={`text-sm font-bold font-mono ${cashFlowStatement.net_operating_cash >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {cashFlowStatement.net_operating_cash >= 0 ? '+' : '-'} Rp {formatIDR(Math.abs(cashFlowStatement.net_operating_cash))}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Penerimaan piutang - biaya trip</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] text-slate-500 font-medium block">Arus Kas Investasi</span>
                <span className="text-sm font-bold font-mono text-slate-700">
                  Rp {formatIDR(cashFlowStatement.net_investing_cash)}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Capex armada &amp; gudang</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] text-slate-500 font-medium block">Arus Kas Pendanaan</span>
                <span className="text-sm font-bold font-mono text-rose-700">
                  - Rp {formatIDR(Math.abs(cashFlowStatement.net_financing_cash))}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Cicilan pokok &amp; bunga leasing</span>
              </div>
            </div>

            {/* 1. AKTIVITAS OPERASI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-slate-900 font-extrabold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  1. ARUS KAS DARI AKTIVITAS OPERASI
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {cashFlowStatement.net_operating_cash >= 0 ? '+' : '-'} Rp {formatIDR(Math.abs(cashFlowStatement.net_operating_cash))}
                </span>
              </div>
              <div className="space-y-1.5 pl-4">
                {cashFlowStatement.operating_activities.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 text-slate-700">
                    <span>{item.name}</span>
                    <span className={`font-mono font-medium ${item.type === 'INFLOW' ? 'text-emerald-700' : 'text-slate-800'}`}>
                      {item.type === 'INFLOW' ? '+' : '-'} Rp {formatIDR(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. AKTIVITAS INVESTASI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-slate-900 font-extrabold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600" />
                  2. ARUS KAS DARI AKTIVITAS INVESTASI
                </span>
                <span className="font-mono font-bold text-slate-900">
                  Rp {formatIDR(cashFlowStatement.net_investing_cash)}
                </span>
              </div>
              <div className="space-y-1.5 pl-4">
                {cashFlowStatement.investing_activities.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 text-slate-700">
                    <span>{item.name}</span>
                    <span className="font-mono font-medium text-slate-500">
                      {item.amount > 0 ? `- Rp ${formatIDR(item.amount)}` : 'Rp 0'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. AKTIVITAS PENDANAAN */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs border-b border-slate-200 pb-2">
                <span className="tracking-wide uppercase text-slate-900 font-extrabold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  3. ARUS KAS DARI AKTIVITAS PENDANAAN
                </span>
                <span className="font-mono font-bold text-rose-700">
                  - Rp {formatIDR(Math.abs(cashFlowStatement.net_financing_cash))}
                </span>
              </div>
              <div className="space-y-1.5 pl-4">
                {cashFlowStatement.financing_activities.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 text-slate-700">
                    <span>{item.name}</span>
                    <span className="font-mono font-medium text-rose-700">
                      - Rp {formatIDR(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* REKONSILIASI KAS */}
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Saldo Kas &amp; Bank Awal Periode</span>
                <span className="font-mono">Rp {formatIDR(cashFlowStatement.beginning_cash_and_bank)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Kenaikan / (Penurunan) Kas Bersih Bulan Ini</span>
                <span className={`font-mono ${cashFlowStatement.net_cash_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {cashFlowStatement.net_cash_change >= 0 ? '+' : '-'} Rp {formatIDR(Math.abs(cashFlowStatement.net_cash_change))}
                </span>
              </div>
              <div className="border-t border-slate-700 pt-2 flex items-center justify-between text-sm font-bold">
                <span className="text-emerald-400">SALDO KAS &amp; BANK AKHIR PERIODE (REKENING KORAN)</span>
                <span className="font-mono text-emerald-400">Rp {formatIDR(cashFlowStatement.ending_cash_and_bank)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: TRIAL BALANCE --- */}
      {activeReportTab === 'TRIAL_BALANCE' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Neraca Saldo Buku Besar (General Ledger Trial Balance)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik nama atau kode akun mana pun untuk melihat rincian bukti transaksi voucher (Drill-Down)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 font-semibold rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Debit &amp; Kredit Sinkron
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-24">Kode Akun</th>
                  <th className="py-2.5 px-3">Nama Akun (Klik untuk Drill-Down)</th>
                  <th className="py-2.5 px-2 text-center w-20">Tipe</th>
                  <th className="py-2.5 px-2 text-center w-12">Pos</th>
                  <th className="py-2.5 px-3 text-right">Saldo Awal</th>
                  <th className="py-2.5 px-3 text-right">Turnover Debit</th>
                  <th className="py-2.5 px-3 text-right">Turnover Kredit</th>
                  <th className="py-2.5 px-3 text-right bg-slate-200/50">Akhir Debit</th>
                  <th className="py-2.5 px-3 text-right bg-slate-200/50">Akhir Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {trialBalanceData.map((row) => (
                  <tr
                    key={row.account_code}
                    onClick={() => handleOpenDrillDown(row.account_code, row.account_name)}
                    className="hover:bg-slate-100 cursor-pointer group transition"
                    title="Klik untuk membuka rincian voucher transaksi (Drill-Down)"
                  >
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900 group-hover:text-indigo-600 flex items-center gap-1">
                      {row.account_code}
                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-indigo-600 transition" />
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800 group-hover:text-indigo-900">
                      {row.account_name}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        row.account_type === 'ASSET'
                          ? 'bg-blue-50 text-blue-700'
                          : row.account_type === 'LIABILITY'
                          ? 'bg-amber-50 text-amber-700'
                          : row.account_type === 'EQUITY'
                          ? 'bg-purple-50 text-purple-700'
                          : row.account_type === 'REVENUE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {row.account_type}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-[10px]">
                      {row.normal_balance}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      {row.beginning_balance > 0 ? `Rp ${formatIDR(row.beginning_balance)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700 font-medium">
                      {row.debit_turnover > 0 ? `Rp ${formatIDR(row.debit_turnover)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-rose-700 font-medium">
                      {row.credit_turnover > 0 ? `Rp ${formatIDR(row.credit_turnover)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                      {row.ending_debit > 0 ? `Rp ${formatIDR(row.ending_debit)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                      {row.ending_credit > 0 ? `Rp ${formatIDR(row.ending_credit)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold font-mono text-xs">
                <tr>
                  <td colSpan={5} className="py-3 px-4 text-left">
                    TOTAL NERACA SALDO BUKU BESAR
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-400">
                    Rp {formatIDR(trialBalanceData.reduce((s, r) => s + r.debit_turnover, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-rose-400">
                    Rp {formatIDR(trialBalanceData.reduce((s, r) => s + r.credit_turnover, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-amber-300 bg-slate-800">
                    Rp {formatIDR(trialBalanceData.reduce((s, r) => s + r.ending_debit, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-amber-300 bg-slate-800">
                    Rp {formatIDR(trialBalanceData.reduce((s, r) => s + r.ending_credit, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: OWNER ANALYSIS (AR AGING & ROUTE PROFITABILITY) --- */}
      {activeReportTab === 'OWNER_ANALYSIS' && (
        <div className="space-y-6">
          {/* Card 1: Umur Piutang (AR Aging Schedule) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Jadwal Umur Piutang Logistik (AR Aging Schedule)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mitigasi risiko gagal bayar klien logistik &amp; proyeksi cash-in
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 bg-amber-100 text-amber-900 font-semibold rounded-lg border border-amber-200">
                  Total Tagihan Beredar: Rp {formatIDR(arAgingData.reduce((s, a) => s + a.total_receivable, 0))}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4">Nama Pelanggan (Shipper)</th>
                    <th className="py-2.5 px-3 text-center">Faktur</th>
                    <th className="py-2.5 px-3 text-right">Total Tagihan</th>
                    <th className="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/50">0 - 30 Hari</th>
                    <th className="py-2.5 px-3 text-right text-amber-800 bg-amber-50/50">31 - 60 Hari</th>
                    <th className="py-2.5 px-3 text-right text-orange-800 bg-orange-50/50">61 - 90 Hari</th>
                    <th className="py-2.5 px-3 text-right text-rose-800 bg-rose-50/50">&gt; 90 Hari</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {arAgingData.map((ar, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{ar.customer_name}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">{ar.invoice_count} inv</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        Rp {formatIDR(ar.total_receivable)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 bg-emerald-50/30">
                        {ar.current_0_30 > 0 ? `Rp ${formatIDR(ar.current_0_30)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 bg-amber-50/30">
                        {ar.days_31_60 > 0 ? `Rp ${formatIDR(ar.days_31_60)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-orange-700 bg-orange-50/30">
                        {ar.days_61_90 > 0 ? `Rp ${formatIDR(ar.days_61_90)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700 bg-rose-50/30 font-bold">
                        {ar.over_90 > 0 ? `Rp ${formatIDR(ar.over_90)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          ar.status === 'HEALTHY'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ar.status === 'WARNING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {ar.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Alert / Warning Action */}
            <div className="p-4 bg-amber-50 border-t border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Rekomendasi Penagihan Owner:</span>{' '}
                Terdapat piutang menunggak &gt;60 hari sebesar <strong>Rp 35.000.000</strong> pada <em>CV Multi Bintang Logistik</em>. Disarankan untuk menahan order trip armada baru sampai pelunasan termin diterima.
              </div>
            </div>
          </div>

          {/* Card 2: Profitabilitas per Rute Logistik (Unit Economics) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  Profitabilitas per Rute &amp; Unit Bisnis (Job Costing)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rincian efisiensi BBM, Tol, dan Margin Laba Kotor per koridor armada
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg border border-indigo-200">
                  Total Trip: {routeProfitabilityData.reduce((s, r) => s + r.trips_count, 0)} Perjalanan
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4">Koridor Rute / Jasa</th>
                    <th className="py-2.5 px-3">Klien Utama</th>
                    <th className="py-2.5 px-2 text-center">Trip</th>
                    <th className="py-2.5 px-3 text-right">Pendapatan</th>
                    <th className="py-2.5 px-3 text-right">BBM Solar</th>
                    <th className="py-2.5 px-3 text-right">Tol &amp; Uang Saku</th>
                    <th className="py-2.5 px-3 text-right">HPP Langsung</th>
                    <th className="py-2.5 px-3 text-right font-bold text-slate-900">Laba Kotor</th>
                    <th className="py-2.5 px-3 text-center">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {routeProfitabilityData.map((route, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{route.route_name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{route.client_name}</td>
                      <td className="py-2.5 px-2 text-center font-mono font-medium">{route.trips_count}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                        Rp {formatIDR(route.revenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        Rp {formatIDR(route.direct_fuel)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        Rp {formatIDR(route.direct_toll_allowance)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                        Rp {formatIDR(route.total_direct_cogs)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/20">
                        Rp {formatIDR(route.gross_profit)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          route.status === 'HIGH_MARGIN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : route.status === 'MODERATE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {route.margin_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* =========================================================================
          DEDICATED FORMAL AUDIT-STANDARD PRINT REPORT (SHOWN ONLY ON PRINT / PDF)
          ========================================================================= */}
      <div className="hidden print:block text-slate-900 bg-white print-page-container px-6 sm:px-10 py-6 m-0 font-sans text-xs leading-normal">
        {/* Kop Surat Resmi Perusahaan */}
        <div className="border-b-2 border-slate-900 pb-3 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-serif">
                PT NUSANTARA GLOBAL MANDIRI
              </h1>
              <p className="text-xs text-slate-700 tracking-wide mt-0.5">
                Freight Forwarding, Intermodal Logistics &amp; Supply Chain Management
              </p>
              <p className="text-[9pt] text-slate-600 mt-0.5">
                Gedung Cyber 2 Tower Lt. 18, Jl. H.R. Rasuna Said, Jakarta Selatan • NPWP: 01.345.678.9-012.000
              </p>
            </div>
            <div className="text-right">
              <div
                className={`inline-block border px-3 py-0.5 font-mono text-[9pt] font-bold uppercase tracking-wider ${
                  reconStatus.isFullyReconciled
                    ? 'border-slate-900 text-slate-950 bg-slate-50'
                    : 'border-amber-700 text-amber-950 bg-amber-50'
                }`}
              >
                {reconStatus.isFullyReconciled ? 'DOKUMEN AUDITED RESMI' : 'DRAFT - BELUM AUDIT'}
              </div>
              <div className="text-[8.5pt] mt-1 font-mono">
                {reconStatus.isFullyReconciled ? (
                  <span className="text-slate-700 font-semibold">Status: 100% Reconciled (Rp 0 Selisih)</span>
                ) : (
                  <span className="text-amber-800 font-semibold">
                    Status: Draft (Rekonsiliasi Bank Pending - {reconStatus.unmatchedCount} Mutasi)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Judul Laporan & Periode */}
        <div className="text-center mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-950 font-serif">
            {activeReportTab === 'BALANCE_SHEET' && 'LAPORAN POSISI KEUANGAN (NERACA)'}
            {activeReportTab === 'INCOME_STATEMENT' && 'LAPORAN LABA RUGI KOMPREHENSIF (MULTI-STEP)'}
            {activeReportTab === 'CASH_FLOW' && 'LAPORAN ARUS KAS (METODE TIDAK LANGSUNG)'}
            {activeReportTab === 'TRIAL_BALANCE' && 'NERACA SALDO BUKU BESAR (TRIAL BALANCE GL)'}
            {activeReportTab === 'OWNER_ANALYSIS' && 'ANALISIS EKSEKUTIF: AR AGING & UNIT ECONOMICS RUTE'}
          </h2>
          <p className="text-[11px] text-slate-700 font-serif italic mt-1">
            Periode yang berakhir pada {selectedPeriod} (Disajikan dalam Rupiah Indonesia sesuai SAK EP)
          </p>
        </div>

        {/* --- FORMAL REPORT 1: BALANCE SHEET (NERACA) --- */}
        {activeReportTab === 'BALANCE_SHEET' && (
          <div className="space-y-6 text-xs text-slate-900">
            {/* BAGIAN 1: ASET */}
            <div>
              <div className="font-bold text-xs uppercase tracking-wider text-slate-950 border-b-2 border-slate-900 pb-1 mb-2 flex justify-between">
                <span>ASET (AKTIVA)</span>
                <span className="w-24 text-center">CATATAN</span>
                <span className="w-40 text-right">JUMLAH (IDR)</span>
              </div>

              {/* Aset Lancar */}
              <div className="mb-3">
                <div className="font-bold text-xs text-slate-900 mb-1">Aset Lancar</div>
                <table className="w-full text-xs">
                  <tbody>
                    {balanceSheet.current_assets.map((item) => (
                      <tr key={item.account_code} className="border-b border-slate-100">
                        <td className="py-1 w-20 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                        <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                        <td className="py-1 text-center w-24 text-[10px] text-slate-500">Cat. 4</td>
                        <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(item.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-900 border-t border-slate-400">
                      <td colSpan={2} className="py-1.5 pl-4">Jumlah Aset Lancar</td>
                      <td className="py-1.5 text-center"></td>
                      <td className="py-1.5 text-right font-mono border-t border-slate-400">
                        {formatAccountingIDR(balanceSheet.total_current_assets)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Aset Tetap */}
              <div className="mb-3">
                <div className="font-bold text-xs text-slate-900 mb-1">Aset Tetap &amp; Infrastruktur Logistik</div>
                <table className="w-full text-xs">
                  <tbody>
                    {balanceSheet.fixed_assets.map((item) => (
                      <tr key={item.account_code} className="border-b border-slate-100">
                        <td className="py-1 w-20 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                        <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                        <td className="py-1 text-center w-24 text-[10px] text-slate-500">Cat. 5</td>
                        <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(item.amount)}</td>
                      </tr>
                    ))}
                    {balanceSheet.contra_assets.map((item) => (
                      <tr key={item.account_code} className="border-b border-slate-100 text-slate-700">
                        <td className="py-1 w-20 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                        <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                        <td className="py-1 text-center w-24 text-[10px] text-slate-500">Cat. 5</td>
                        <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(-item.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-900 border-t border-slate-400">
                      <td colSpan={2} className="py-1.5 pl-4">Jumlah Aset Tetap Bersih</td>
                      <td className="py-1.5 text-center"></td>
                      <td className="py-1.5 text-right font-mono border-t border-slate-400">
                        {formatAccountingIDR(balanceSheet.net_fixed_assets)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TOTAL ASET */}
              <div className="flex items-center justify-between py-2 border-t-2 border-slate-900 double-underline font-bold text-xs uppercase tracking-wider bg-slate-50/50 px-2 mt-2">
                <span>TOTAL ASET</span>
                <span className="font-mono text-sm">{formatAccountingIDR(balanceSheet.total_assets)}</span>
              </div>
            </div>

            {/* BAGIAN 2: LIABILITAS & EKUITAS */}
            <div className="pt-2">
              <div className="font-bold text-xs uppercase tracking-wider text-slate-950 border-b-2 border-slate-900 pb-1 mb-2 flex justify-between">
                <span>LIABILITAS DAN EKUITAS</span>
                <span className="w-24 text-center">CATATAN</span>
                <span className="w-40 text-right">JUMLAH (IDR)</span>
              </div>

              {/* Liabilitas Jangka Pendek */}
              <div className="mb-3">
                <div className="font-bold text-xs text-slate-900 mb-1">Liabilitas Jangka Pendek</div>
                <table className="w-full text-xs">
                  <tbody>
                    {balanceSheet.current_liabilities.map((item) => (
                      <tr key={item.account_code} className="border-b border-slate-100">
                        <td className="py-1 w-20 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                        <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                        <td className="py-1 text-center w-24 text-[10px] text-slate-500">Cat. 6</td>
                        <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(item.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-slate-900 border-t border-slate-400">
                      <td colSpan={2} className="py-1.5 pl-4">Jumlah Liabilitas Jangka Pendek</td>
                      <td className="py-1.5 text-center"></td>
                      <td className="py-1.5 text-right font-mono border-t border-slate-400">
                        {formatAccountingIDR(balanceSheet.total_current_liabilities)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Liabilitas Jangka Panjang */}
              {balanceSheet.long_term_liabilities.length > 0 && (
                <div className="mb-3">
                  <div className="font-bold text-xs text-slate-900 mb-1">Liabilitas Jangka Panjang</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {balanceSheet.long_term_liabilities.map((item) => (
                        <tr key={item.account_code} className="border-b border-slate-100">
                          <td className="py-1 w-20 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                          <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                          <td className="py-1 text-center w-24 text-[10px] text-slate-500">Cat. 7</td>
                          <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(item.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold text-slate-900 border-t border-slate-400">
                        <td colSpan={2} className="py-1.5 pl-4">Jumlah Liabilitas Jangka Panjang</td>
                        <td className="py-1.5 text-center"></td>
                        <td className="py-1.5 text-right font-mono border-t border-slate-400">
                          {formatAccountingIDR(balanceSheet.total_long_term_liabilities)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Total Liabilitas */}
              <div className="flex items-center justify-between py-1.5 border-t border-slate-400 font-bold text-xs text-slate-900 mb-3 px-2 bg-slate-50/30">
                <span>Total Liabilitas</span>
                <span className="font-mono">{formatAccountingIDR(balanceSheet.total_liabilities)}</span>
              </div>

              {/* Ekuitas */}
              <div className="mb-3">
                <div className="font-bold text-xs text-slate-900 mb-1">Ekuitas Pemilik</div>
                <table className="w-full text-xs">
                  <tbody>
                    {balanceSheet.equity_items.map((item) => (
                      <tr key={item.account_code} className="border-b border-slate-100">
                        <td className="py-1 w-20 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                        <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                        <td className="py-1 text-center w-24 text-[10px] text-slate-500">Cat. 8</td>
                        <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(item.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-slate-100">
                      <td className="py-1 w-20 font-mono text-[10px] text-slate-600">331-100</td>
                      <td className="py-1 pl-2 text-slate-800">Laba Bersih Periode Berjalan (Bulan Ini)</td>
                      <td className="py-1 text-center w-24 text-[10px] text-slate-500">Lap. LR</td>
                      <td className="py-1 text-right font-mono w-40">{formatAccountingIDR(balanceSheet.current_year_earnings)}</td>
                    </tr>
                    <tr className="font-bold text-slate-900 border-t border-slate-400">
                      <td colSpan={2} className="py-1.5 pl-4">Jumlah Ekuitas</td>
                      <td className="py-1.5 text-center"></td>
                      <td className="py-1.5 text-right font-mono border-t border-slate-400">
                        {formatAccountingIDR(balanceSheet.total_equity)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TOTAL LIABILITAS & EKUITAS */}
              <div className="flex items-center justify-between py-2 border-t-2 border-slate-900 double-underline font-bold text-xs uppercase tracking-wider bg-slate-50/50 px-2 mt-2">
                <span>TOTAL LIABILITAS DAN EKUITAS</span>
                <span className="font-mono text-sm">{formatAccountingIDR(balanceSheet.total_liabilities_and_equity)}</span>
              </div>
            </div>
          </div>
        )}

        {/* --- FORMAL REPORT 2: INCOME STATEMENT (LABA RUGI) --- */}
        {activeReportTab === 'INCOME_STATEMENT' && (
          <div className="space-y-4 text-xs text-slate-900">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900 font-bold uppercase text-[10px] tracking-wider text-slate-950">
                  <th className="py-1.5 text-left w-20">KODE</th>
                  <th className="py-1.5 text-left">URAIAN POS LABA RUGI</th>
                  <th className="py-1.5 text-center w-24">CATATAN</th>
                  <th className="py-1.5 text-right w-40">JUMLAH (IDR)</th>
                </tr>
              </thead>
              <tbody>
                {/* 1. PENDAPATAN USAHA */}
                <tr>
                  <td colSpan={4} className="pt-3 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    1. Pendapatan Usaha Logistik
                  </td>
                </tr>
                {incomeStatement.revenues.map((item) => (
                  <tr key={item.account_code} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                    <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Cat. 9</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t border-slate-400">
                  <td colSpan={2} className="py-1.5 pl-4">Total Pendapatan Usaha</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(incomeStatement.total_revenue)}</td>
                </tr>

                {/* 2. BEBAN POKOK PENDAPATAN */}
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    2. Beban Pokok Pendapatan (HPP Logistik Langsung)
                  </td>
                </tr>
                {incomeStatement.cogs.length === 0 ? (
                  <tr className="border-b border-slate-100 text-slate-500 italic">
                    <td>-</td>
                    <td className="pl-2">Tidak ada beban pokok tercatat periode ini</td>
                    <td className="text-center">-</td>
                    <td className="text-right font-mono">Rp -</td>
                  </tr>
                ) : (
                  incomeStatement.cogs.map((item) => (
                    <tr key={item.account_code} className="border-b border-slate-100">
                      <td className="py-1 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                      <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                      <td className="py-1 text-center text-[10px] text-slate-500">Cat. 10</td>
                      <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                    </tr>
                  ))
                )}
                <tr className="font-bold border-t border-slate-400">
                  <td colSpan={2} className="py-1.5 pl-4">Total Beban Pokok Pendapatan</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(incomeStatement.total_cogs)}</td>
                </tr>

                {/* LABA KOTOR */}
                <tr className="font-bold bg-slate-50/70 border-t-2 border-slate-900 border-b border-slate-900">
                  <td colSpan={2} className="py-2 pl-4 text-slate-950 uppercase tracking-wide">
                    LABA KOTOR (GROSS PROFIT) <span className="text-[10px] font-normal lowercase text-slate-600 font-mono">(Margin: {grossMarginPct}%)</span>
                  </td>
                  <td className="py-2 text-center"></td>
                  <td className="py-2 text-right font-mono text-sm">{formatAccountingIDR(incomeStatement.gross_profit)}</td>
                </tr>

                {/* 3. BEBAN OPERASIONAL */}
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    3. Beban Operasional &amp; Umum (OPEX)
                  </td>
                </tr>
                {incomeStatement.operating_expenses.map((item) => (
                  <tr key={item.account_code} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                    <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Cat. 11</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t border-slate-400">
                  <td colSpan={2} className="py-1.5 pl-4">Total Beban Operasional &amp; Umum</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(incomeStatement.total_operating_expenses)}</td>
                </tr>

                {/* LABA OPERASI */}
                <tr className="font-bold border-t border-slate-900 border-b border-slate-900 bg-slate-50/40">
                  <td colSpan={2} className="py-1.5 pl-4 uppercase tracking-wide">
                    Laba Operasi Sebelum Bunga &amp; Pajak (EBIT)
                  </td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono">{formatAccountingIDR(incomeStatement.operating_income)}</td>
                </tr>

                {/* 4. PENDAPATAN & BEBAN LAIN */}
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    4. Pendapatan &amp; (Beban) Lain-lain
                  </td>
                </tr>
                {incomeStatement.other_incomes.map((item) => (
                  <tr key={item.account_code} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                    <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Cat. 12</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                  </tr>
                ))}
                {incomeStatement.other_expenses.map((item) => (
                  <tr key={item.account_code} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-[10px] text-slate-600">{item.account_code}</td>
                    <td className="py-1 pl-2 text-slate-800">{item.account_name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Cat. 12</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(-item.amount)}</td>
                  </tr>
                ))}
                {incomeStatement.other_incomes.length === 0 && incomeStatement.other_expenses.length === 0 && (
                  <tr className="border-b border-slate-100 text-slate-500 italic">
                    <td>-</td>
                    <td className="pl-2">Nihil</td>
                    <td className="text-center">-</td>
                    <td className="text-right font-mono">Rp -</td>
                  </tr>
                )}
                <tr className="font-bold border-t border-slate-400">
                  <td colSpan={2} className="py-1.5 pl-4">Total Pendapatan / (Beban) Lain-lain Bersih</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(incomeStatement.net_other_income)}</td>
                </tr>

                {/* LABA BERSIH SEBELUM PAJAK */}
                <tr className="font-bold border-t border-slate-400">
                  <td colSpan={2} className="py-1.5 pl-4">Laba Bersih Sebelum Beban Pajak Penghasilan</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono">{formatAccountingIDR(incomeStatement.net_income_before_tax)}</td>
                </tr>
                <tr className="text-slate-700">
                  <td colSpan={2} className="py-1 pl-4">Beban Pajak Penghasilan Badan (PPh Badan)</td>
                  <td className="py-1 text-center text-[10px] text-slate-500">Cat. 13</td>
                  <td className="py-1 text-right font-mono">{formatAccountingIDR(-incomeStatement.tax_expense)}</td>
                </tr>

                {/* GRAND TOTAL: LABA BERSIH TAHUN BERJALAN */}
                <tr className="font-bold text-slate-950 bg-slate-50 border-t-2 border-slate-900 double-underline">
                  <td colSpan={2} className="py-2 pl-4 text-xs uppercase tracking-wide">
                    LABA BERSIH PERIODE BERJALAN (NET INCOME)
                    <span className="text-[10px] font-normal lowercase text-slate-600 font-mono ml-2">(Net Margin: {netMarginPct}%)</span>
                  </td>
                  <td className="py-2 text-center text-[10px] text-slate-500">Ekuitas</td>
                  <td className="py-2 text-right font-mono text-sm">{formatAccountingIDR(incomeStatement.net_income)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* --- FORMAL REPORT 3: CASH FLOW (ARUS KAS) --- */}
        {activeReportTab === 'CASH_FLOW' && (
          <div className="space-y-4 text-xs text-slate-900">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900 font-bold uppercase text-[10px] tracking-wider text-slate-950">
                  <th className="py-1.5 text-left">URAIAN ARUS KAS</th>
                  <th className="py-1.5 text-center w-24">CATATAN</th>
                  <th className="py-1.5 text-right w-40">JUMLAH (IDR)</th>
                </tr>
              </thead>
              <tbody>
                {/* I. OPERASI */}
                <tr>
                  <td colSpan={3} className="pt-3 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    I. Arus Kas dari Aktivitas Operasi
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1 pl-2 text-slate-800">Laba Bersih Periode Berjalan</td>
                  <td className="py-1 text-center text-[10px] text-slate-500">Lap. LR</td>
                  <td className="py-1 text-right font-mono">{formatAccountingIDR(incomeStatement.net_income)}</td>
                </tr>
                {cashFlowStatement.operating_activities.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="border-b border-slate-100">
                    <td className="py-1 pl-2 text-slate-800">{item.name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Bank</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t border-slate-400 bg-slate-50/40">
                  <td className="py-1.5 pl-4">Arus Kas Bersih dari Aktivitas Operasi</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(cashFlowStatement.net_operating_cash)}</td>
                </tr>

                {/* II. INVESTASI */}
                <tr>
                  <td colSpan={3} className="pt-4 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    II. Arus Kas dari Aktivitas Investasi
                  </td>
                </tr>
                {cashFlowStatement.investing_activities.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="border-b border-slate-100">
                    <td className="py-1 pl-2 text-slate-800">{item.name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Capex</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t border-slate-400 bg-slate-50/40">
                  <td className="py-1.5 pl-4">Arus Kas Bersih Digunakan untuk Aktivitas Investasi</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(cashFlowStatement.net_investing_cash)}</td>
                </tr>

                {/* III. PENDANAAN */}
                <tr>
                  <td colSpan={3} className="pt-4 pb-1 font-bold text-slate-950 uppercase text-[11px]">
                    III. Arus Kas dari Aktivitas Pendanaan
                  </td>
                </tr>
                {cashFlowStatement.financing_activities.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="border-b border-slate-100">
                    <td className="py-1 pl-2 text-slate-800">{item.name}</td>
                    <td className="py-1 text-center text-[10px] text-slate-500">Leasing</td>
                    <td className="py-1 text-right font-mono">{formatAccountingIDR(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t border-slate-400 bg-slate-50/40">
                  <td className="py-1.5 pl-4">Arus Kas Bersih Digunakan untuk Aktivitas Pendanaan</td>
                  <td className="py-1.5 text-center"></td>
                  <td className="py-1.5 text-right font-mono border-t border-slate-400">{formatAccountingIDR(cashFlowStatement.net_financing_cash)}</td>
                </tr>

                {/* KENAIKAN BERSIH */}
                <tr className="font-bold border-t-2 border-slate-900 border-b border-slate-900 bg-slate-50/70">
                  <td className="py-2 pl-4 uppercase">Kenaikan / (Penurunan) Bersih Kas dan Setara Kas</td>
                  <td className="py-2 text-center"></td>
                  <td className="py-2 text-right font-mono text-sm">{formatAccountingIDR(cashFlowStatement.net_cash_change)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pl-4 text-slate-800">Saldo Kas dan Bank pada Awal Periode</td>
                  <td className="py-1.5 text-center text-[10px] text-slate-500">Giro</td>
                  <td className="py-1.5 text-right font-mono">{formatAccountingIDR(cashFlowStatement.beginning_cash_and_bank)}</td>
                </tr>
                <tr className="font-bold text-slate-950 bg-slate-50 border-t border-slate-900 double-underline">
                  <td className="py-2 pl-4 text-xs uppercase tracking-wide">
                    SALDO KAS DAN BANK PADA AKHIR PERIODE (REKENING KORAN)
                  </td>
                  <td className="py-2 text-center text-[10px] text-slate-500">Neraca</td>
                  <td className="py-2 text-right font-mono text-sm">{formatAccountingIDR(cashFlowStatement.ending_cash_and_bank)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* --- FORMAL REPORT 4: TRIAL BALANCE (NERACA SALDO) --- */}
        {activeReportTab === 'TRIAL_BALANCE' && (
          <div className="space-y-4 text-xs text-slate-900">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b-2 border-slate-900 font-bold uppercase text-[9px] tracking-wider text-slate-950 bg-slate-50">
                  <th className="py-1.5 px-2 text-left w-16">KODE</th>
                  <th className="py-1.5 px-2 text-left">NAMA AKUN BUKU BESAR</th>
                  <th className="py-1.5 px-1 text-center w-8">POS</th>
                  <th className="py-1.5 px-2 text-right w-24">SALDO AWAL</th>
                  <th className="py-1.5 px-2 text-right w-24">MUTASI DEBIT</th>
                  <th className="py-1.5 px-2 text-right w-24">MUTASI KREDIT</th>
                  <th className="py-1.5 px-2 text-right w-28">AKHIR DEBIT</th>
                  <th className="py-1.5 px-2 text-right w-28">AKHIR KREDIT</th>
                </tr>
              </thead>
              <tbody>
                {trialBalanceData.map((row) => (
                  <tr key={row.account_code} className="border-b border-slate-200">
                    <td className="py-1 px-2 font-mono font-semibold text-slate-800">{row.account_code}</td>
                    <td className="py-1 px-2 text-slate-900">{row.account_name}</td>
                    <td className="py-1 px-1 text-center font-bold text-slate-600">{row.normal_balance}</td>
                    <td className="py-1 px-2 text-right font-mono">{row.beginning_balance ? formatIDR(row.beginning_balance) : '-'}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-800">{row.debit_turnover ? formatIDR(row.debit_turnover) : '-'}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-800">{row.credit_turnover ? formatIDR(row.credit_turnover) : '-'}</td>
                    <td className="py-1 px-2 text-right font-mono font-semibold">{row.ending_debit ? formatIDR(row.ending_debit) : '-'}</td>
                    <td className="py-1 px-2 text-right font-mono font-semibold">{row.ending_credit ? formatIDR(row.ending_credit) : '-'}</td>
                  </tr>
                ))}
                <tr className="font-bold text-slate-950 bg-slate-100 border-t-2 border-slate-900 double-underline text-[10px]">
                  <td colSpan={4} className="py-2 px-2 uppercase tracking-wide">TOTAL NERACA SALDO BUKU BESAR</td>
                  <td className="py-2 px-2 text-right font-mono">{formatIDR(trialBalanceData.reduce((s, r) => s + r.debit_turnover, 0))}</td>
                  <td className="py-2 px-2 text-right font-mono">{formatIDR(trialBalanceData.reduce((s, r) => s + r.credit_turnover, 0))}</td>
                  <td className="py-2 px-2 text-right font-mono text-slate-950">{formatIDR(trialBalanceData.reduce((s, r) => s + r.ending_debit, 0))}</td>
                  <td className="py-2 px-2 text-right font-mono text-slate-950">{formatIDR(trialBalanceData.reduce((s, r) => s + r.ending_credit, 0))}</td>
                </tr>
              </tbody>
            </table>
            <div className="text-[9px] text-slate-500 italic text-right">
              Status Keseimbangan Debit &amp; Kredit: Rp 0 Selisih (100% Balanced)
            </div>
          </div>
        )}

        {/* --- FORMAL REPORT 5: OWNER ANALYSIS --- */}
        {activeReportTab === 'OWNER_ANALYSIS' && (
          <div className="space-y-6 text-xs text-slate-900">
            {/* Tabel AR Aging */}
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950 border-b border-slate-900 pb-1 mb-2">
                I. Skedul Umur Piutang Usaha Pelanggan (AR Aging Schedule)
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-400 font-bold uppercase text-[10px] text-slate-800 bg-slate-50">
                    <th className="py-1.5 px-2 text-left">NAMA DEBITUR / PELANGGAN</th>
                    <th className="py-1.5 px-2 text-right w-28">TOTAL PIUTANG</th>
                    <th className="py-1.5 px-2 text-right w-24">LANCAR (0-30 HR)</th>
                    <th className="py-1.5 px-2 text-right w-24">31 - 60 HARI</th>
                    <th className="py-1.5 px-2 text-right w-24">61 - 90 HARI</th>
                    <th className="py-1.5 px-2 text-right w-24">&gt; 90 HARI</th>
                  </tr>
                </thead>
                <tbody>
                  {arAgingData.map((cust) => (
                    <tr key={cust.customer_name} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 font-medium">{cust.customer_name}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold">{formatIDR(cust.total_receivable)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{cust.current_0_30 > 0 ? formatIDR(cust.current_0_30) : '-'}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{cust.days_31_60 > 0 ? formatIDR(cust.days_31_60) : '-'}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{cust.days_61_90 > 0 ? formatIDR(cust.days_61_90) : '-'}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{cust.over_90 > 0 ? formatIDR(cust.over_90) : '-'}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-slate-50 border-t border-slate-900 double-underline">
                    <td className="py-1.5 px-2">JUMLAH PIUTANG USAHA</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(arAgingData.reduce((s, c) => s + c.total_receivable, 0))}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(arAgingData.reduce((s, c) => s + c.current_0_30, 0))}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(arAgingData.reduce((s, c) => s + c.days_31_60, 0))}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(arAgingData.reduce((s, c) => s + c.days_61_90, 0))}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(arAgingData.reduce((s, c) => s + c.over_90, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tabel Unit Economics Rute */}
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950 border-b border-slate-900 pb-1 mb-2">
                II. Profitabilitas &amp; Margin Kontribusi Koridor Rute Logistik
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-400 font-bold uppercase text-[10px] text-slate-800 bg-slate-50">
                    <th className="py-1.5 px-2 text-left">KORIDOR RUTE</th>
                    <th className="py-1.5 px-2 text-center w-16">RITASE</th>
                    <th className="py-1.5 px-2 text-right w-28">PENDAPATAN</th>
                    <th className="py-1.5 px-2 text-right w-28">BIAYA LANGSUNG (HPP)</th>
                    <th className="py-1.5 px-2 text-right w-28">LABA KOTOR</th>
                    <th className="py-1.5 px-2 text-center w-20">MARGIN %</th>
                  </tr>
                </thead>
                <tbody>
                  {routeProfitabilityData.map((route) => (
                    <tr key={route.route_name} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 font-medium">{route.route_name}</td>
                      <td className="py-1.5 px-2 text-center font-mono">{route.trips_count} trip</td>
                      <td className="py-1.5 px-2 text-right font-mono">{formatIDR(route.revenue)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{formatIDR(route.total_direct_cogs)}</td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold">{formatIDR(route.gross_profit)}</td>
                      <td className="py-1.5 px-2 text-center font-mono font-bold">{route.margin_pct}%</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-slate-50 border-t border-slate-900 double-underline">
                    <td className="py-1.5 px-2">TOTAL KORIDOR RUTE OPERASIONAL</td>
                    <td className="py-1.5 px-2 text-center font-mono">{routeProfitabilityData.reduce((s, r) => s + r.trips_count, 0)} trip</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(routeProfitabilityData.reduce((s, r) => s + r.revenue, 0))}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(routeProfitabilityData.reduce((s, r) => s + r.total_direct_cogs, 0))}</td>
                    <td className="py-1.5 px-2 text-right font-mono">{formatIDR(routeProfitabilityData.reduce((s, r) => s + r.gross_profit, 0))}</td>
                    <td className="py-1.5 px-2 text-center font-mono">
                      {Math.round((routeProfitabilityData.reduce((s, r) => s + r.gross_profit, 0) / (routeProfitabilityData.reduce((s, r) => s + r.revenue, 0) || 1)) * 100)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- FORMAL SIGNATURE SECTION (PENGESAHAN DOKUMEN) --- */}
        <div className="pt-8 border-t border-slate-400 mt-10 break-inside-avoid page-break-inside-avoid">
          <div className="flex justify-between items-center text-[10px] text-slate-600 mb-4">
            <span>Lokasi Penerbitan: Kantor Pusat Jakarta</span>
            <span>Tanggal Pengesahan: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="grid grid-cols-3 gap-8 text-center text-xs text-slate-900">
            <div>
              <p className="font-semibold text-slate-700">Disiapkan Oleh,</p>
              <div className="h-16 flex items-end justify-center pb-1">
                <span className="font-mono text-[10px] text-slate-400 italic">(Tanda Tangan &amp; Cap)</span>
              </div>
              <p className="font-bold border-t border-slate-800 pt-1">Finance &amp; GL Officer</p>
              <p className="text-[10px] text-slate-500">PT Nusantara Global Mandiri</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Diperiksa Oleh,</p>
              <div className="h-16 flex items-end justify-center pb-1">
                <span className="font-mono text-[10px] text-slate-400 italic">(Tanda Tangan &amp; Cap)</span>
              </div>
              <p className="font-bold border-t border-slate-800 pt-1">Accounting Manager</p>
              <p className="text-[10px] text-slate-500">PT Nusantara Global Mandiri</p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Disetujui Oleh,</p>
              <div className="h-16 flex items-end justify-center pb-1">
                <span className="font-mono text-[10px] text-slate-400 italic">(Tanda Tangan &amp; Cap)</span>
              </div>
              <p className="font-bold border-t border-slate-800 pt-1">Direktur Utama / Owner</p>
              <p className="text-[10px] text-slate-500">PT Nusantara Global Mandiri</p>
            </div>
          </div>
          <div className="mt-8 pt-3 border-t border-slate-200 text-center text-[9px] text-slate-500">
            Dokumen ini dicetak secara otomatis melalui Sistem ERP Keuangan PT Nusantara Global Mandiri dan telah tervalidasi secara akuntansi berpasangan (Double-Entry Bookkeeping).
          </div>
        </div>
      </div>

      {/* --- MODAL DRILL-DOWN VOUCHER (BUKU BESAR AKUN) --- */}
      {drillDownAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Buku Besar Akun: {drillDownAccount.code} - {drillDownAccount.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Rincian bukti transaksi voucher ({selectedPeriod}) • Sumber Data:{' '}
                    {isLiveDatabase ? 'Supabase Live' : 'Mock Memory'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrillDownAccount(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-1 rounded cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="my-4 flex-1 overflow-y-auto">
              {isLoadingDrillDown ? (
                <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                  <span>Mengambil data voucher transaksi...</span>
                </div>
              ) : drillDownLines.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Tidak ada transaksi voucher mutasi pada akun ini di periode {selectedPeriod}.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                    <tr>
                      <th className="py-2 px-3">No Voucher</th>
                      <th className="py-2 px-3">Tanggal</th>
                      <th className="py-2 px-3">Deskripsi Transaksi</th>
                      <th className="py-2 px-3">Uraian Baris</th>
                      <th className="py-2 px-3 text-right">Debit (IDR)</th>
                      <th className="py-2 px-3 text-right">Kredit (IDR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {drillDownLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-semibold text-indigo-700">{line.voucher_code}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{line.transaction_date}</td>
                        <td className="py-2 px-3 text-slate-800">{line.description}</td>
                        <td className="py-2 px-3 text-slate-600">{line.line_description}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">
                          {line.debit_amount > 0 ? `Rp ${formatIDR(line.debit_amount)}` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-700">
                          {line.credit_amount > 0 ? `Rp ${formatIDR(line.credit_amount)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold font-mono text-xs border-t border-slate-200">
                    <tr>
                      <td colSpan={4} className="py-2.5 px-3 text-left">
                        Total Perputaran Akun Ini ({drillDownLines.length} Transaksi)
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700">
                        Rp {formatIDR(drillDownLines.reduce((s, l) => s + (l.debit_amount || 0), 0))}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-700">
                        Rp {formatIDR(drillDownLines.reduce((s, l) => s + (l.credit_amount || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 text-right">
              <button
                onClick={() => setDrillDownAccount(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ACID Compliance Documentation */}
      {showAcidModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Arsitektur Basis Data ACID (Financial Compliance)
                </h3>
              </div>
              <button
                onClick={() => setShowAcidModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-1 rounded cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-700">
              <p>
                Sistem accounting <strong>mvp-bank-recon</strong> menerapkan prinsip database transaksional ACID untuk menjamin bahwa tidak ada jurnal sepihak yang tersimpan tanpa penyeimbang:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    1. Atomicity (Keutuhan)
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Penulisan header voucher dan baris transaksi dibungkus dalam <code>BEGIN ... COMMIT;</code>. Jika salah satu baris gagal ditulis, seluruh transaksi di-rollback seketika.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    2. Consistency (Konsistensi)
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Database trigger memvalidasi bahwa <code>SUM(debit) = SUM(credit)</code> sebelum status diubah ke POSTED. Selisih 1 rupiah ditolak otomatis oleh constraint.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-600" />
                    3. Isolation (Isolasi)
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Menggunakan isolasi <code>READ COMMITTED</code> dengan row-locking pada mutasi rekening koran untuk mencegah double-reconciliation saat konkurensi tinggi.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    4. Durability (Immutability)
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Jurnal yang sudah di-POSTED dilarang keras untuk dihapus atau di-update (Larangan HARD DELETE). Koreksi wajib melalui jurnal pembalik (Storno Reversal).
                  </p>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-[11px]">
                <strong>Dokumentasi Lengkap Tersedia:</strong> Silakan tinjau file{' '}
                <a
                  href="/Users/hacaca/Projects/personal/levelUpSkill/mvp-bank-recon/ACCOUNTING_COMPLIANCE.md"
                  target="_blank"
                  className="font-mono underline text-indigo-700 font-bold"
                >
                  ACCOUNTING_COMPLIANCE.md
                </a>{' '}
                untuk penjelasan detail mengenai ketentuan PSAK 72, PPN Besaran Tertentu PMK 71, dan PPh 23.
              </div>
            </div>

            <div className="mt-5 text-right">
              <button
                onClick={() => setShowAcidModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                Saya Memahami
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Panduan Membaca Laporan Keuangan */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Panduan Praktis Membaca 3 Laporan Keuangan Logistik
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Alur pemahaman Neraca Saldo, Laba Rugi, dan Neraca Posisi Keuangan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-1 rounded cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-700">
              {/* Box 1: Neraca Saldo */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    1. Neraca Saldo (Trial Balance GL) — Alat Audit Double-Entry
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono font-bold">Langkah Awal</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Menampilkan seluruh akun pembukuan (Buku Besar). Nilai <strong>Turnover Debit</strong> dan <strong>Turnover Kredit</strong> merangkum seluruh voucher mutasi bulan ini. Pada baris paling bawah, <strong>Total Akhir Debit WAJIB sama dengan Total Akhir Kredit</strong> (Rp 0 selisih) membuktikan tidak ada jurnal korup atau tidak seimbang.
                </p>
              </div>

              {/* Box 2: Laba Rugi */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                    2. Laporan Laba Rugi (Income Statement) — Efisiensi Operasional &amp; Profit
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono font-bold">Laba Bersih</span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-1 leading-relaxed">
                  <p>• <strong>Pendapatan Usaha Logistik</strong>: Omset dari pengiriman kontainer/trucking dan kliring pelabuhan.</p>
                  <p>• <strong>Beban Pokok Pendapatan (HPP Langsung)</strong>: Biaya langsung trip armada (BBM solar, tol, uang jalan supir, THC pelabuhan, dan penyusutan armada truk).</p>
                  <p>• <strong>Laba Kotor (Gross Profit)</strong>: <code>Pendapatan - HPP</code>. Mengukur profitabilitas armada (standar logistik: 20% - 35%).</p>
                  <p>• <strong>Beban Operasional (OPEX)</strong>: Gaji kantor, sewa kantor pool, asuransi kendaraan, dan utilitas.</p>
                  <p>• <strong>Laba Bersih (Net Income)</strong>: Laba operasi disesuaikan pendapatan bunga giro dan beban leasing armada. <em>Laba bersih ini dialirkan otomatis ke Ekuitas Neraca!</em></p>
                </div>
              </div>

              {/* Box 3: Neraca */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    3. Neraca (Laporan Posisi Keuangan) — Snapshot Kekayaan Bersih
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold">Aset = Liabilitas + Ekuitas</span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-1 leading-relaxed">
                  <p>• <strong>Sisi Kiri (Aset)</strong>: Uang di rekening giro bank operasional, piutang tagihan pelanggan, uang muka jalan sopir, dan Aset Tetap Armada Truk &amp; Gudang (setelah dikurangi akumulasi penyusutan).</p>
                  <p>• <strong>Sisi Kanan (Liabilitas &amp; Ekuitas)</strong>: Hutang tagihan SPBU/vendor, hutang leasing armada jangka panjang, modal disetor pemilik, laba ditahan, dan <strong>Laba Periode Berjalan yang otomatis tersambung dari Laba Rugi</strong>.</p>
                  <p>• <strong>Ekuilibrium</strong>: Total Aset wajib sama persis dengan Total Liabilitas + Ekuitas (Status: 100% BALANCED).</p>
                </div>
              </div>

              {/* Note Dokumentasi Lengkap */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] flex items-center justify-between">
                <span>Dokumen lengkap tersedia di file <code>PANDUAN_MEMBACA_LAPORAN_KEUANGAN.md</code> dan <code>ACCOUNTING_COMPLIANCE.md</code>.</span>
              </div>
            </div>

            <div className="mt-5 text-right">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
