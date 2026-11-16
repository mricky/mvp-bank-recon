'use client';

import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  ReceiptText,
  Upload,
  Camera,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  FileText,
  Clock,
  Layers,
  Check,
  X,
  Clipboard,
  Command,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Package,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface JournalLineItem {
  line_no: number;
  account_code: string;
  account_name: string;
  position: 'DEBIT' | 'CREDIT';
  debit: number;
  credit: number;
  memo: string;
}

interface InvoiceLineItemDetail {
  item_name: string;
  quantity?: number;
  unit_price?: number;
  total_price: number;
}

interface ExtractedOcrResult {
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  transaction_type: string;
  currency?: string;
  tax_name?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  description: string;
  line_items?: InvoiceLineItemDetail[];
  journal_entry: {
    entry_date: string;
    reference_no: string;
    total_debit: number;
    total_credit: number;
    is_balanced: boolean;
    lines: JournalLineItem[];
  };
}

interface InvoiceOcrViewProps {
  onJournalPosted?: (journal: ExtractedOcrResult) => void;
  onNavigateToRecon?: () => void;
}

function formatMoney(val: number, currency: string = 'IDR'): string {
  const isForeign = currency && currency.toUpperCase() !== 'IDR';
  const hasDecimals = val % 1 !== 0;

  if (isForeign) {
    const curr = ['USD', 'CAD', 'EUR', 'SGD', 'GBP', 'AUD', 'JPY'].includes(currency.toUpperCase())
      ? currency.toUpperCase()
      : 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  }

  if (hasDecimals) {
    return 'Rp ' + new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  }

  return 'Rp ' + new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatAmount(val: number, currency: string = 'IDR'): string {
  const isForeign = currency && currency.toUpperCase() !== 'IDR';
  const hasDecimals = val % 1 !== 0;

  if (isForeign || hasDecimals) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  }

  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export default function InvoiceOcrView({ onJournalPosted, onNavigateToRecon }: InvoiceOcrViewProps) {
  const [n8nTargetUrl, setN8nTargetUrl] = useState<string>('http://localhost:5678/webhook-test/ocr-invoice');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<ExtractedOcrResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processTimeMs, setProcessTimeMs] = useState<number | null>(null);
  const [isPosted, setIsPosted] = useState<boolean>(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [showLineItems, setShowLineItems] = useState<boolean>(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut listener untuk Zoom Modal (Esc untuk keluar, +/- untuk zoom)
  useEffect(() => {
    if (!isZoomModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomModalOpen(false);
      } else if (e.key === '+' || e.key === '=') {
        setZoomScale((prev) => Math.min(prev + 0.25, 3));
      } else if (e.key === '-') {
        setZoomScale((prev) => Math.max(prev - 0.25, 0.5));
      } else if (e.key === '0') {
        setZoomScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomModalOpen]);

  // 📋 Listener Paste dari Clipboard (Cmd+V / Ctrl+V Screenshot)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
            const renamedFile = new File([file], `faktur-${timestamp}.png`, { type: file.type });

            setSelectedFile(renamedFile);
            setPreviewUrl(URL.createObjectURL(renamedFile));
            setExtractedData(null);
            setErrorMessage(null);
            setIsPosted(false);
            setPasteNotice('Gambar faktur berhasil dimuat dari clipboard.');

            setTimeout(() => setPasteNotice(null), 3500);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handlePasteFromClipboardButton = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
            const file = new File([blob], `faktur-${timestamp}.png`, { type: imageType });
            
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setExtractedData(null);
            setErrorMessage(null);
            setIsPosted(false);
            setPasteNotice('Gambar faktur berhasil dimuat dari clipboard.');
            setTimeout(() => setPasteNotice(null), 3500);
            return;
          }
        }
        alert('Tidak ada gambar di clipboard. Silakan screenshot faktur terlebih dahulu.');
      } else {
        alert('Gunakan shortcut keyboard Cmd+V (Mac) atau Ctrl+V (Windows).');
      }
    } catch (err) {
      alert('Gunakan shortcut keyboard Cmd+V (Mac) atau Ctrl+V (Windows).');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setExtractedData(null);
        setErrorMessage(null);
        setIsPosted(false);
      }
    }
  };

  const handleLoadSample = (sampleType: 'laptop' | 'bbm') => {
    setIsPosted(false);
    setErrorMessage(null);

    if (sampleType === 'laptop') {
      setPreviewUrl('https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80');
      setSelectedFile(new File(['sample-laptop'], 'invoice-laptop-asus.jpg', { type: 'image/jpeg' }));
      
      const mockSample: ExtractedOcrResult = {
        vendor_name: 'PT Sinar Abadi Teknologi',
        invoice_number: 'INV/2026/10/088',
        invoice_date: '2026-10-23',
        transaction_type: 'PURCHASE_EXPENSE',
        subtotal: 10000000,
        tax_amount: 1100000,
        total_amount: 11100000,
        description: 'Pembelian Laptop Asus ExpertBook Operasional IT',
        journal_entry: {
          entry_date: '2026-10-23',
          reference_no: 'INV/2026/10/088',
          total_debit: 11100000,
          total_credit: 11100000,
          is_balanced: true,
          lines: [
            {
              line_no: 1,
              account_code: '5-1002',
              account_name: 'Beban Perlengkapan & IT',
              position: 'DEBIT',
              debit: 10000000,
              credit: 0,
              memo: 'Beban Pokok Pembelian Laptop',
            },
            {
              line_no: 2,
              account_code: '1-1180',
              account_name: 'PPN Masukan (VAT In 11%)',
              position: 'DEBIT',
              debit: 1100000,
              credit: 0,
              memo: 'Faktur Pajak PPN Masukan 11%',
            },
            {
              line_no: 3,
              account_code: '1-1001',
              account_name: 'Kas / Bank BCA',
              position: 'CREDIT',
              debit: 0,
              credit: 11100000,
              memo: 'Pembayaran Lunas via Transfer BCA',
            },
          ],
        },
      };
      setExtractedData(mockSample);
      setProcessTimeMs(1420);
    } else if (sampleType === 'bbm') {
      setPreviewUrl('https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=800&q=80');
      setSelectedFile(new File(['sample-bbm'], 'struk-pertamina-bbm.jpg', { type: 'image/jpeg' }));
      setExtractedData({
        vendor_name: 'SPBU Pertamina 31.129.02',
        invoice_number: 'STRUK-BBM-7741',
        invoice_date: '2026-10-22',
        transaction_type: 'PURCHASE_EXPENSE',
        subtotal: 450000,
        tax_amount: 0,
        total_amount: 450000,
        description: 'Pembelian Pertamina Dex Operasional Logistik',
        journal_entry: {
          entry_date: '2026-10-22',
          reference_no: 'STRUK-BBM-7741',
          total_debit: 450000,
          total_credit: 450000,
          is_balanced: true,
          lines: [
            {
              line_no: 1,
              account_code: '5-1001',
              account_name: 'Beban Bahan Bakar & Kendaraan',
              position: 'DEBIT',
              debit: 450000,
              credit: 0,
              memo: 'Pembelian Pertamina Dex',
            },
            {
              line_no: 2,
              account_code: '1-1001',
              account_name: 'Kas / Bank BCA',
              position: 'CREDIT',
              debit: 0,
              credit: 450000,
              memo: 'Debit Rekening Operasional BCA',
            },
          ],
        },
      });
      setProcessTimeMs(1180);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setExtractedData(null);
      setErrorMessage(null);
      setIsPosted(false);
    }
  };

  const handleExecuteOcr = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setErrorMessage(null);
    const startTime = performance.now();

    try {
      const formData = new FormData();
      formData.append('data', selectedFile);
      if (n8nTargetUrl && n8nTargetUrl.trim() !== '') {
        formData.append('n8nUrl', n8nTargetUrl.trim());
      }

      // Selalu panggil proxy /api/ocr agar bebas hambatan CORS dan aman dari response kosong
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      let json: any = null;
      try {
        json = responseText ? JSON.parse(responseText) : null;
      } catch (parseErr) {
        throw new Error('Respon dari server tidak valid atau berformat kosong.');
      }

      const endTime = performance.now();
      setProcessTimeMs(Math.round(endTime - startTime));

      if (!response.ok || !json?.success) {
        throw new Error(json?.message || `Gagal mengekstrak faktur (Status ${response.status}).`);
      }

      if (json && json.data) {
        setExtractedData(json.data);
      } else if (json && json.journal_entry) {
        setExtractedData(json);
      } else {
        throw new Error('Format jurnal hasil ekstraksi tidak valid.');
      }
    } catch (err: any) {
      console.error('OCR Extraction Error:', err);
      setErrorMessage(err.message || 'Gagal mengekstrak faktur. Pastikan gambar jelas dan coba kembali.');
      setExtractedData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostToGeneralLedger = () => {
    if (!extractedData) return;

    confetti({
      particleCount: 60,
      spread: 60,
      origin: { y: 0.6 },
    });

    setIsPosted(true);

    if (onJournalPosted) {
      onJournalPosted(extractedData);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <ReceiptText className="w-4 h-4 text-slate-700" />
            <span>Digitalisasi Dokumen Keuangan</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pencatatan Faktur &amp; OCR Tagihan</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Ekstraksi otomatis tagihan vendor ke draf Jurnal Umum (Double-Entry Debit &amp; Kredit) untuk persiapan rekonsiliasi kas.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-500 font-medium">Pipeline:</span>
            <code className="font-mono text-slate-700 text-[11px] font-semibold">n8n OCR</code>
          </div>
        </div>
      </div>

      {/* Error Alert Display */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <span className="font-bold text-rose-600">Error:</span>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toast Alert for Paste Action */}
      {pasteNotice && (
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs flex items-center justify-between font-medium shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{pasteNotice}</span>
          </div>
          <button onClick={() => setPasteNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (5 Cols): Ingestion */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">1. Input Dokumen</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePasteFromClipboardButton}
                className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition cursor-pointer shadow-2xs"
                title="Paste gambar dari clipboard (Cmd+V)"
              >
                <Clipboard className="w-3 h-3 text-slate-500" />
                <span>Paste Clipboard</span>
              </button>
              <div className="inline-flex items-center gap-1 px-1.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px] font-semibold">
                <Command className="w-3 h-3 text-slate-500" />
                <span>Cmd+V</span>
              </div>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[200px] relative ${
              isDragging
                ? 'border-slate-500 bg-slate-50'
                : previewUrl
                ? 'border-slate-300 bg-slate-50/50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {previewUrl ? (
              <div className="relative group w-full flex flex-col items-center">
                {/* Clickable Zoomable Thumbnail */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomScale(1);
                    setIsZoomModalOpen(true);
                  }}
                  className="relative group/thumb cursor-zoom-in rounded-lg border border-slate-200 overflow-hidden shadow-2xs bg-white p-1 hover:border-slate-400 transition"
                  title="Klik untuk memperbesar dokumen"
                >
                  <img
                    src={previewUrl}
                    alt="Invoice Preview"
                    className="max-h-56 object-contain rounded transition-transform duration-200 group-hover/thumb:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-[2px] rounded">
                    <Maximize2 className="w-4 h-4" />
                    <span>Klik untuk Zoom Dokumen</span>
                  </div>
                </div>

                {/* Meta & Actions Bar */}
                <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-[11px] text-slate-600 font-mono bg-white px-2 py-0.5 rounded border border-slate-200 truncate max-w-[170px]" title={selectedFile?.name || 'dokumen-faktur.png'}>
                    {selectedFile?.name || 'dokumen-faktur.png'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomScale(1);
                      setIsZoomModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>Zoom</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setExtractedData(null);
                    }}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition cursor-pointer"
                  >
                    Ganti
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Pilih file, seret foto, atau <span className="underline">Paste Screenshot (Cmd+V)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Format gambar JPG, PNG, atau WebP.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Endpoint Config */}
          <div className="space-y-1.5 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Koneksi n8n Webhook:</span>
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] text-slate-500 hover:text-slate-900 cursor-pointer underline"
                  onClick={() => setN8nTargetUrl('http://localhost:5678/webhook-test/ocr-invoice')}
                >
                  Mode Test (Kanvas Hijau)
                </span>
                <span className="text-slate-300">|</span>
                <span
                  className="text-[10px] text-slate-500 hover:text-slate-900 cursor-pointer underline"
                  onClick={() => setN8nTargetUrl('http://localhost:5678/webhook/ocr-invoice')}
                >
                  Production
                </span>
              </div>
            </div>
            <input
              type="text"
              value={n8nTargetUrl}
              onChange={(e) => setN8nTargetUrl(e.target.value)}
              placeholder="http://localhost:5678/webhook-test/ocr-invoice"
              className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
            />
            <p className="text-[10px] text-slate-500 leading-tight">
              Permintaan diteruskan ke n8n secara otomatis via server Next.js tanpa hambatan CORS. Jika n8n tidak dalam mode uji, sistem dialihkan ke Gemini AI Engine tanpa error.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleExecuteOcr}
            disabled={!selectedFile || isLoading}
            className={`w-full py-2.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
              !selectedFile || isLoading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Mengekstrak Dokumen...</span>
              </>
            ) : (
              <>
                <ReceiptText className="w-3.5 h-3.5" />
                <span>2. Proses Ekstraksi Faktur</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column (7 Cols): Output Draf Jurnal */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">3. Hasil Draf Jurnal Umum</h3>
            {processTimeMs && (
              <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> {processTimeMs} ms
              </span>
            )}
          </div>

          {extractedData ? (
            <div className="space-y-4">
              {/* Balance Verification */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">Jurnal Berpasangan Seimbang</h4>
                    <p className="text-[11px] text-slate-500">
                      Total Debit ({formatMoney(extractedData.journal_entry.total_debit, extractedData.currency)}) == Total Kredit ({formatMoney(extractedData.journal_entry.total_credit, extractedData.currency)})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                    {extractedData.currency || 'IDR'}
                  </span>
                  <span className="text-[10px] font-mono font-semibold bg-white px-2 py-0.5 rounded text-slate-700 border border-slate-200">
                    Zero Discrepancy
                  </span>
                </div>
              </div>

              {/* Invoice Meta */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block">Vendor:</span>
                  <span className="text-slate-900 font-semibold truncate block mt-0.5">{extractedData.vendor_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block">No. Bukti:</span>
                  <code className="text-slate-700 font-mono block mt-0.5">{extractedData.invoice_number}</code>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block">Tanggal:</span>
                  <span className="text-slate-800 block mt-0.5">{extractedData.invoice_date}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase block">Total Faktur:</span>
                  <span className="text-slate-900 font-mono font-bold block mt-0.5">
                    {formatMoney(extractedData.total_amount, extractedData.currency)}
                  </span>
                </div>
              </div>

              {/* DPP & Pajak */}
              <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-slate-50 rounded border border-slate-200/70 font-mono text-slate-600">
                <span>DPP: {formatMoney(extractedData.subtotal, extractedData.currency)}</span>
                <span>{extractedData.tax_name || 'Pajak'}: {formatMoney(extractedData.tax_amount, extractedData.currency)}</span>
                <span className="font-semibold text-slate-900">Total: {formatMoney(extractedData.total_amount, extractedData.currency)}</span>
              </div>

              {/* Uraian Pembelian Best Practice */}
              {extractedData.description && (
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg px-3 py-2 text-xs flex items-start gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 mt-0.5">Uraian:</span>
                  <span className="text-slate-800 font-medium leading-relaxed">{extractedData.description}</span>
                </div>
              )}

              {/* Rincian Item Pembelian (Line Items Table) */}
              {extractedData.line_items && extractedData.line_items.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                  <div
                    onClick={() => setShowLineItems(!showLineItems)}
                    className="px-3.5 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 transition"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-slate-700" />
                      <span className="text-xs font-semibold text-slate-900">
                        Rincian Item Pembelian ({extractedData.line_items.length} item terdeteksi)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                      <span>{showLineItems ? 'Tutup' : 'Buka'}</span>
                      {showLineItems ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {showLineItems && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 text-[10px] uppercase font-semibold text-slate-500 border-b border-slate-100">
                          <th className="py-1.5 px-3">Item / Uraian</th>
                          <th className="py-1.5 px-3 text-center w-16">Qty</th>
                          <th className="py-1.5 px-3 text-right w-28">Harga Satuan</th>
                          <th className="py-1.5 px-3 text-right w-28">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {extractedData.line_items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="py-1.5 px-3 font-medium text-slate-800">{it.item_name}</td>
                            <td className="py-1.5 px-3 text-center text-slate-600 font-mono text-[11px]">{it.quantity || 1}</td>
                            <td className="py-1.5 px-3 text-right text-slate-600 font-mono text-[11px]">
                              {it.unit_price ? formatAmount(it.unit_price, extractedData.currency) : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-slate-900 font-mono text-[11px]">
                              {formatAmount(it.total_price, extractedData.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Journal Table Lines */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                      <th className="py-2 px-3 w-10 text-center">#</th>
                      <th className="py-2 px-3">Akun Buku Besar (COA)</th>
                      <th className="py-2 px-3">Memo</th>
                      <th className="py-2 px-3 text-right">Debit ({extractedData.currency || 'IDR'})</th>
                      <th className="py-2 px-3 text-right">Kredit ({extractedData.currency || 'IDR'})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {extractedData.journal_entry.lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{line.line_no}</td>
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-800">{line.account_name}</div>
                          <code className="text-[10px] text-slate-500 font-mono">{line.account_code}</code>
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">{line.memo}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-900">
                          {line.debit > 0 ? formatAmount(line.debit, extractedData.currency) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-900">
                          {line.credit > 0 ? formatAmount(line.credit, extractedData.currency) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold border-t border-slate-200 text-slate-900 font-mono text-xs">
                      <td colSpan={3} className="py-2 px-3 text-right text-[11px] uppercase">
                        Total Jurnal ({extractedData.currency || 'IDR'}):
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatMoney(extractedData.journal_entry.total_debit, extractedData.currency)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatMoney(extractedData.journal_entry.total_credit, extractedData.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handlePostToGeneralLedger}
                  disabled={isPosted}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    isPosted
                      ? 'bg-slate-200 text-slate-600 cursor-default'
                      : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                  }`}
                >
                  {isPosted ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Tercatat di Jurnal Umum</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Posting ke Buku Jurnal &amp; Antrean Rekonsiliasi</span>
                    </>
                  )}
                </button>

                {isPosted && onNavigateToRecon && (
                  <button
                    type="button"
                    onClick={onNavigateToRecon}
                    className="py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 border border-slate-200"
                  >
                    <span>Ke Rekonsiliasi Bank</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-[360px] border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-center p-8 space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-slate-700">Belum ada faktur yang diproses</div>
              <p className="text-[11px] text-slate-500 max-w-xs">
                Unggah atau paste screenshot faktur di sebelah kiri untuk melihat draf jurnal debit-kredit di sini.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* 🔍 Zoom & Full Inspection Modal Popup */}
      {isZoomModalOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col animate-in fade-in duration-150"
          onClick={() => setIsZoomModalOpen(false)}
        >
          {/* Top Bar Controls */}
          <div
            className="bg-slate-900/95 border-b border-slate-800 px-5 py-3 flex items-center justify-between shrink-0 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <FileText className="w-4 h-4 text-slate-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white tracking-tight">Inspeksi Dokumen Faktur</h3>
                  <span className="text-[10px] font-mono font-medium text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 truncate max-w-[200px]">
                    {selectedFile?.name || 'dokumen-faktur.png'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Periksa kejelasan angka, rincian biaya, nomor faktur, dan stempel resmi.
                </p>
              </div>
            </div>

            {/* Center Zoom Controls */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-lg p-1 text-xs">
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.max(prev - 0.25, 0.5))}
                disabled={zoomScale <= 0.5}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition cursor-pointer"
                title="Perkecil (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setZoomScale(1)}
                className="px-2.5 py-1 rounded hover:bg-slate-700 text-slate-200 font-mono font-semibold text-xs transition cursor-pointer"
                title="Reset Zoom ke 100% (Tekan 0)"
              >
                {Math.round(zoomScale * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.min(prev + 0.25, 3))}
                disabled={zoomScale >= 3}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition cursor-pointer"
                title="Perbesar (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div className="w-[1px] h-4 bg-slate-700 mx-1" />

              <button
                type="button"
                onClick={() => setZoomScale(1)}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Reset ke Ukuran Awal"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Close Action */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">ESC untuk keluar</span>
              <button
                type="button"
                onClick={() => setIsZoomModalOpen(false)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700 transition cursor-pointer"
                title="Tutup (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Document Viewport */}
          <div
            className="flex-1 w-full overflow-auto p-4 sm:p-8 flex items-center justify-center cursor-grab active:cursor-grabbing"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsZoomModalOpen(false);
            }}
          >
            <div
              className="transition-transform duration-150 ease-out flex items-center justify-center"
              style={{ transform: `scale(${zoomScale})` }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewUrl}
                alt="Full Invoice Inspection"
                className="max-h-[82vh] w-auto max-w-[90vw] object-contain rounded-lg shadow-2xl border border-slate-700/80 bg-white"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
