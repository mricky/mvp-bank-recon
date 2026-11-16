'use client';

import React from 'react';
import { MOCK_BANK_ACCOUNTS } from '@/lib/mock-data';
import { Building2, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

export default function BankAccountsView() {
  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-700" />
            Daftar Rekening Bank Perusahaan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar rekening bank fisik perusahaan yang terhubung dengan akun Buku Besar (GL) &amp; Open Banking API
          </p>
        </div>
      </div>

      {/* Grid of Bank Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MOCK_BANK_ACCOUNTS.map((bank) => (
          <div
            key={bank.id}
            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 relative overflow-hidden"
          >
            {/* Top Row: Bank Code & Status */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 text-white font-mono">
                  {bank.bank_code}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {bank.bank_name}
                </h3>
                <p className="text-xs text-slate-500">{bank.branch_name}</p>
              </div>

              {bank.is_api_enabled ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Zap className="w-3 h-3 text-emerald-600" /> SNAP BI ACTIVE
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  MANUAL IMPORT
                </span>
              )}
            </div>

            {/* Account Details Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Nomor Rekening:</span>
                <span className="font-mono font-bold text-slate-900">{bank.account_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Atas Nama (Pemilik):</span>
                <span className="font-semibold text-slate-800">{bank.account_holder_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mata Uang:</span>
                <span className="font-mono font-medium text-slate-800">{bank.currency_code} (Rupiah)</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500">Relasi Akun GL:</span>
                <span className="font-mono font-semibold text-blue-700">
                  {bank.account_code} - {bank.account_name}
                </span>
              </div>
            </div>

            {/* Bottom info */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Terakhir Sinkronisasi:</span>
              <span className="font-mono font-medium text-slate-700">{bank.last_sync_at}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
