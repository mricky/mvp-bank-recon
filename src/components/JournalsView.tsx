'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SAMPLE_100_JOURNAL_LINES } from '@/lib/sample-data-100';
import { TransactionJournalHeader } from '@/types/reconciliation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  Clock,
  Calendar,
  X,
  Filter,
} from 'lucide-react';

const FALLBACK_100_JOURNALS: TransactionJournalHeader[] = SAMPLE_100_JOURNAL_LINES.map((j, idx) => {
  const isCredit = j.type === 'CR';
  return {
    id: idx + 1,
    voucher_code: j.voucher_code,
    transaction_date: j.transaction_date,
    description: j.description,
    total_amount: j.amount,
    status: 'POSTED',
    lines: [
      {
        id: idx * 2 + 1,
        line_no: 1,
        account_code: j.account_code || '111-201',
        account_name: j.account_name || 'Bank Mandiri Giro Operasional',
        line_description: j.description,
        debit_amount: isCredit ? j.amount : 0,
        credit_amount: isCredit ? 0 : j.amount,
        is_reconciled: j.is_reconciled,
      },
      {
        id: idx * 2 + 2,
        line_no: 2,
        account_code: isCredit ? '112-100' : '211-100',
        account_name: isCredit ? 'Piutang Usaha Pelanggan' : 'Hutang Usaha Pemasok / Vendor',
        line_description: `Akun Lawan: ${j.description}`,
        debit_amount: isCredit ? 0 : j.amount,
        credit_amount: isCredit ? j.amount : 0,
        is_reconciled: false,
      },
    ],
  };
});

export default function JournalsView() {
  const [journals, setJournals] = useState<TransactionJournalHeader[]>(FALLBACK_100_JOURNALS);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | 'UNMATCHED' | 'MATCHED'>('ALL');
  const [periodFilter, setPeriodFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<number | null>(1); // Expand first journal by default
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const formatIDR = (val: number) =>
    new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(val);

  // Load from Supabase Live & Subscribe to Realtime WebSocket
  useEffect(() => {
    let isMounted = true;

    async function loadJournalsFromSupabase() {
      if (!isSupabaseConfigured || !supabase) return;
      try {
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

        if (data && data.length > 0 && isMounted) {
          const mapped: TransactionJournalHeader[] = data.map((row: any) => ({
            id: row.id,
            voucher_code: row.voucher_code,
            transaction_date: row.transaction_date,
            description: row.description,
            total_amount: Number(row.total_amount),
            status: row.status as any,
            lines: (row.transaction_journal_line || []).map((l: any) => {
              const mbbs = Array.isArray(l.master_bbs) ? l.master_bbs[0] : l.master_bbs;
              return {
                id: l.id,
                line_no: l.line_no,
                account_code: mbbs?.kd_bbs || (l.line_no === 1 ? '111-201' : '112-100'),
                account_name: mbbs?.nama_bbs || l.line_description || 'Akun GL',
                line_description: l.line_description || row.description,
                debit_amount: Number(l.debit_amount || 0),
                credit_amount: Number(l.credit_amount || 0),
                is_reconciled: Boolean(l.is_reconciled),
              };
            }),
          }));
          setJournals(mapped);
        }
      } catch (err) {
        console.error('Error fetching journals in JournalsView:', err);
      }
    }

    loadJournalsFromSupabase();

    let channel: any;
    if (isSupabaseConfigured && supabase) {
      channel = supabase
        .channel('journals-view-live-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transaction_journal_line' },
          () => {
            loadJournalsFromSupabase();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transaction_journal' },
          () => {
            loadJournalsFromSupabase();
          }
        )
        .subscribe();
    }

    return () => {
      isMounted = false;
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Dynamic status counts
  const counts = useMemo(() => {
    let all = 0, unmatched = 0, matched = 0;
    for (const j of journals) {
      const matchPeriod = periodFilter === 'ALL' || j.transaction_date.startsWith(periodFilter);
      if (matchPeriod) {
        all++;
        const bankLine = j.lines.find((l) => l.account_code.startsWith('111-')) || j.lines[0];
        if (bankLine?.is_reconciled) matched++;
        else unmatched++;
      }
    }
    return { all, unmatched, matched };
  }, [journals, periodFilter]);

  // Filtered journals
  const filteredJournals = useMemo(() => {
    const rawQ = searchTerm.trim().toLowerCase();
    const numQ = rawQ.replace(/[.,\s]/g, '').replace(/^rp/i, '');

    return journals.filter((j) => {
      const bankLine = j.lines.find((l) => l.account_code.startsWith('111-')) || j.lines[0];
      const isReconciled = Boolean(bankLine?.is_reconciled);

      const matchStatus =
        statusTab === 'ALL' ||
        (statusTab === 'UNMATCHED' && !isReconciled) ||
        (statusTab === 'MATCHED' && isReconciled);

      const matchPeriod =
        periodFilter === 'ALL' || j.transaction_date.startsWith(periodFilter);

      const matchSearch =
        rawQ === '' ||
        j.voucher_code.toLowerCase().includes(rawQ) ||
        j.description.toLowerCase().includes(rawQ) ||
        (numQ !== '' && j.total_amount.toString().includes(numQ)) ||
        formatIDR(j.total_amount).toLowerCase().includes(rawQ) ||
        j.lines.some(
          (l) =>
            l.account_code.toLowerCase().includes(rawQ) ||
            l.account_name.toLowerCase().includes(rawQ) ||
            l.line_description.toLowerCase().includes(rawQ)
        );

      return matchStatus && matchPeriod && matchSearch;
    });
  }, [journals, searchTerm, statusTab, periodFilter]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusTab, periodFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredJournals.length / pageSize));
  const paginatedJournals = filteredJournals.slice((page - 1) * pageSize, page * pageSize);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Header Info & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-700" />
              Transaksi Jurnal Umum (Double-Entry General Ledger)
            </h2>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {filteredJournals.length} Voucher
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar voucher jurnal pembukuan buku besar beserta rincian baris debit/kredit dan status kliring rekonsiliasi
          </p>
        </div>

        {/* Filter Controls: Tabs + Period + Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Segmented Control */}
          <div className="flex bg-slate-200/90 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setStatusTab('ALL')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                statusTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              <span>Semua</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                statusTab === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {counts.all}
              </span>
            </button>
            <button
              onClick={() => setStatusTab('UNMATCHED')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                statusTab === 'UNMATCHED' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              <span>Belum Kliring</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                statusTab === 'UNMATCHED' ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {counts.unmatched}
              </span>
            </button>
            <button
              onClick={() => setStatusTab('MATCHED')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                statusTab === 'MATCHED' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
              }`}
            >
              <span>Sudah Kliring</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                statusTab === 'MATCHED' ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {counts.matched}
              </span>
            </button>
          </div>

          {/* Period Filter Dropdown */}
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">🗓️ Semua Periode (2026)</option>
              <option value="2026-10">📌 Oktober 2026</option>
              <option value="2026-11">November 2026</option>
              <option value="2026-12">Desember 2026</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-08">Agustus 2026</option>
              <option value="2026-07">Juli 2026</option>
              <option value="2026-06">Juni 2026</option>
              <option value="2026-05">Mei 2026</option>
              <option value="2026-04">April 2026</option>
              <option value="2026-03">Maret 2026</option>
              <option value="2026-02">Februari 2026</option>
              <option value="2026-01">Januari 2026</option>
            </select>
          </div>

          {/* Textbox Search */}
          <div className="relative flex items-center bg-white border border-slate-300 rounded-lg shadow-2xs px-2.5 py-1 focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-slate-900/10 transition w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5" />
            <input
              type="text"
              placeholder="Cari voucher, keterangan, nominal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition shrink-0 ml-1 cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List of Journals with Line Items Accordion */}
      {filteredJournals.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold text-slate-600">Tidak ada voucher jurnal ditemukan</p>
          <p className="text-xs text-slate-400 mt-1">
            Silakan ubah filter periode, tab status, atau kata kunci pencarian.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedJournals.map((journal) => {
            const isExpanded = expandedId === journal.id;
            const bankLine = journal.lines.find((l) => l.account_code.startsWith('111-')) || journal.lines[0];
            const isKliring = Boolean(bankLine?.is_reconciled);

            // Calculate total debit and total credit of the lines
            const totalDebit = journal.lines.reduce((sum, l) => sum + l.debit_amount, 0);
            const totalCredit = journal.lines.reduce((sum, l) => sum + l.credit_amount, 0);

            return (
              <div
                key={journal.id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition"
              >
                {/* Journal Header Row */}
                <div
                  onClick={() => toggleExpand(journal.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition select-none"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-slate-400 hover:text-slate-700 cursor-pointer">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-700" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {journal.voucher_code}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {journal.transaction_date}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {journal.status}
                        </span>
                        {isKliring ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> SUDAH KLIRING
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> PENDING KLIRING
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-800 mt-1">
                        {journal.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Total Transaksi:</div>
                    <div className="font-mono font-bold text-sm text-slate-900">
                      Rp {formatIDR(journal.total_amount)}
                    </div>
                  </div>
                </div>

                {/* Expanded Line Items Detail Table (transaction_journal_line) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Rincian Baris Jurnal (transaction_journal_line) &bull; {journal.lines.length} Baris Akun
                    </div>

                    <table className="w-full text-left text-xs border-collapse bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <tr>
                          <th className="py-2 px-3 w-10 text-center">Line</th>
                          <th className="py-2 px-3">Kode &amp; Nama Akun (COA)</th>
                          <th className="py-2 px-3">Keterangan Baris</th>
                          <th className="py-2 px-3 text-right">Debit (IDR)</th>
                          <th className="py-2 px-3 text-right">Kredit (IDR)</th>
                          <th className="py-2 px-3 text-center">Status Rekonsiliasi Bank</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {journal.lines.map((line) => (
                          <tr key={line.id} className="hover:bg-slate-50/80">
                            <td className="py-2 px-3 text-center font-mono text-slate-400">
                              {line.line_no}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-mono font-semibold text-slate-900">
                                {line.account_code}
                              </span>
                              <span className="text-slate-500 ml-1.5 font-medium">
                                {line.account_name}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {line.line_description}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                              {line.debit_amount > 0 ? formatIDR(line.debit_amount) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                              {line.credit_amount > 0 ? formatIDR(line.credit_amount) : '-'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {line.account_code.startsWith('111-') ? (
                                line.is_reconciled ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3" /> Kliring Bank
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    <Clock className="w-3 h-3" /> Pending Kliring
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-400 text-[10px] font-mono">
                                  Non-Bank (Akun Lawan)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Total Balancing Row */}
                        <tr className="bg-slate-100/50 font-semibold border-t border-slate-200 text-slate-900">
                          <td colSpan={3} className="py-2 px-3 text-right text-[11px] uppercase tracking-wider text-slate-500">
                            Total Debit / Kredit (Balance Check):
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700">
                            Rp {formatIDR(totalDebit)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700">
                            Rp {formatIDR(totalCredit)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-bold">
                              <CheckCircle2 className="w-3 h-3" /> BALANCED
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 select-none">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {filteredJournals.length === 0 ? (
              '0 voucher'
            ) : (
              <>
                Menampilkan <span className="font-semibold text-slate-800">{(page - 1) * pageSize + 1}</span>-
                <span className="font-semibold text-slate-800">
                  {Math.min(page * pageSize, filteredJournals.length)}
                </span>{' '}
                dari <span className="font-semibold text-slate-800">{filteredJournals.length}</span> voucher jurnal
              </>
            )}
          </span>
          <div className="h-3 w-px bg-slate-300" />
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700 text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(1)}
            disabled={page <= 1}
            title="Halaman Pertama"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            title="Halaman Sebelumnya"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 text-xs font-mono text-slate-700">
            Halaman <span className="font-bold text-slate-900">{page}</span> dari {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            title="Halaman Berikutnya"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            title="Halaman Terakhir"
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
