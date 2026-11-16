'use client';

import React from 'react';
import { MOCK_FISCAL_PERIODS } from '@/lib/mock-data';
import { Calendar, CheckCircle2, Lock } from 'lucide-react';

export default function FiscalPeriodsView() {
  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-700" />
            Periode Fiskal Pembukuan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar kalender periode akuntansi untuk kontrol penutupan buku (period closing lock)
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
            <tr>
              <th className="py-2.5 px-4 w-12 text-center">No</th>
              <th className="py-2.5 px-3">Nama Periode</th>
              <th className="py-2.5 px-3">Tanggal Mulai</th>
              <th className="py-2.5 px-3">Tanggal Selesai</th>
              <th className="py-2.5 px-4 text-center">Status Pembukuan</th>
              <th className="py-2.5 px-4 text-center">Izin Posting Jurnal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {MOCK_FISCAL_PERIODS.map((period, idx) => (
              <tr key={period.id} className="hover:bg-slate-50 transition">
                <td className="py-2.5 px-4 text-center font-mono text-slate-400">
                  {idx + 1}
                </td>
                <td className="py-2.5 px-3 font-semibold text-slate-900">
                  {period.period_name}
                </td>
                <td className="py-2.5 px-3 font-mono text-slate-600">
                  {period.start_date}
                </td>
                <td className="py-2.5 px-3 font-mono text-slate-600">
                  {period.end_date}
                </td>
                <td className="py-2.5 px-4 text-center">
                  {period.status === 'OPEN' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> TERBUKA (OPEN)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                      <Lock className="w-3 h-3" /> TERKUNCI (CLOSED)
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-center text-xs font-medium">
                  {period.status === 'OPEN' ? (
                    <span className="text-emerald-700">Diizinkan Posting Jurnal</span>
                  ) : (
                    <span className="text-rose-600">Terkunci (Hanya Baca)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
