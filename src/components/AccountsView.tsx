'use client';

import React, { useState } from 'react';
import { MOCK_MASTER_BBS } from '@/lib/mock-data';
import { MasterBbs } from '@/types/reconciliation';
import { Search, Filter, Layers, CheckCircle2 } from 'lucide-react';

export default function AccountsView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filteredAccounts = MOCK_MASTER_BBS.filter((acc) => {
    const matchesSearch =
      acc.kd_bbs.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.nama_bbs.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || acc.account_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const formatIDR = (val: number) =>
    new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-700" />
            Bagan Akun (Chart of Accounts)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar master bagan akun pembukuan buku besar (General Ledger COA)
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari kode atau nama akun..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900 w-60"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="ALL">Semua Tipe Akun</option>
            <option value="ASSET">Aset (Harta)</option>
            <option value="LIABILITY">Kewajiban (Hutang)</option>
            <option value="EQUITY">Ekuitas (Modal & Laba Ditahan)</option>
            <option value="REVENUE">Pendapatan Usaha</option>
            <option value="EXPENSE">Beban Pokok & Biaya</option>
          </select>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
            <tr>
              <th className="py-2.5 px-4 w-12 text-center">ID</th>
              <th className="py-2.5 px-3">Kode Akun (kd_bbs)</th>
              <th className="py-2.5 px-3">Nama Akun (nama_bbs)</th>
              <th className="py-2.5 px-3">Klasifikasi</th>
              <th className="py-2.5 px-3 text-center">Saldo Normal</th>
              <th className="py-2.5 px-4 text-right">Saldo Awal (IDR)</th>
              <th className="py-2.5 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredAccounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-slate-50 transition">
                <td className="py-2.5 px-4 text-center font-mono text-slate-400">
                  {acc.id}
                </td>
                <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                  {acc.kd_bbs}
                </td>
                <td className="py-2.5 px-3 font-medium text-slate-800">
                  {acc.nama_bbs}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                      acc.account_type === 'ASSET'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : acc.account_type === 'LIABILITY'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : acc.account_type === 'EQUITY'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : acc.account_type === 'REVENUE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {acc.account_type}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className="font-mono font-semibold text-slate-800 px-2 py-0.5 bg-slate-100 rounded">
                    {acc.normal_balance === 'D' ? 'Debit (D)' : 'Kredit (K)'}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-900">
                  Rp {formatIDR(acc.saldo_awal)}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
