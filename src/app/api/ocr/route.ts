import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Direct Gemini Vision API with automatic model retry
async function extractWithGemini(base64Data: string, mimeType: string): Promise<any> {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'];
  
  const promptText = `Kamu adalah akuntan forensik senior dan AI ERP Double-Entry Bookkeeper profesional.
Tugasmu: Analisis foto bukti transaksi/invoice/kuitansi/nota ini secara presisi dan teliti.
BACA TEKS DAN ANGKA YANG SEBENARNYA TERTULIS DI FOTO GAMBAR DOKUMEN INI (JANGAN MENGARANG!).

Ekstrak informasi faktur berikut:
1. vendor_name: Nama perusahaan / toko penerbit faktur yang tertulis di kop/surat faktur.
2. invoice_number: Nomor faktur / invoice / nota resmi.
3. invoice_date: Tanggal terbit faktur dalam format YYYY-MM-DD.
4. currency: Mata uang faktur ('IDR', 'USD', 'CAD', 'EUR', 'SGD', dll. Deteksi dari simbol $, Rp, kata USD/CAD, atau alamat/negara toko).
5. tax_name: Nama atau jenis pajak (misal 'PST & GST', 'PPN 11%', 'Sales Tax', dll).
6. subtotal: Nilai dasar pengenaan pajak (DPP) atau harga sebelum pajak (angka number/float murni, JANGAN buang desimal sen jika ada).
7. tax_amount: Nilai total pajak (angka number/float murni, jika ada).
8. total_amount: Total tagihan akhir yang wajib dibayar (angka number/float murni, JANGAN buang desimal sen).
9. line_items: Daftar rincian barang atau jasa yang dibeli (WAJIB diekstrak jika ada tabel/daftar rincian di dokumen):
   [
     {
       "item_name": "Nama barang/jasa asli",
       "quantity": 10,
       "unit_price": 420.00,
       "total_price": 4200.00
     }
   ]
10. description: Ringkasan belanja deskriptif berbasis item riil (CONTOH BEST PRACTICE: "Beli 10x Motorola E815, 12x Nokia 3220, 10x Razr Black" atau "Reimbursement Talent Video (Esa & Michael)"). JANGAN MENGGUNAKAN TEKS GENERIK SEPERTI "Pembelian operasional".
11. journal_lines: Susunan jurnal berpasangan Debit dan Kredit yang SEIMBANG (Total Debit == Total Kredit).
   - Debit: Akun Beban sesuai jenis pembelian (misal: 'Beban Operasional', 'Beban Perlengkapan & IT', 'Beban Logistik', dll). PADA KOLOM MEMO, TULISKAN RINCIAN ITEM BARANG SECARA JELAS (misal: "Beli 10x Motorola E815, 12x Nokia 3220").
   - Debit (Pajak Masukan/PPN): Akun 'PPN Masukan (VAT In 11%)' (COA: 1-1180 untuk IDR) atau Pajak Masukan sesuai nama pajak sebesar tax_amount.
   - Kredit: 'Kas / Bank BCA' (COA: 1-1001) jika sudah lunas/transfer/tunai, atau 'Hutang Usaha' (COA: 2-1001) jika tempo/tagihan, sebesar total_amount.

ATURAN PAJAK INDONESIA (KHUSUS MATA UANG IDR / RUPIAH):
1. Standar PPN Indonesia: Tarif umum PPN di Indonesia adalah 11%.
2. Jika transaksi pembelian kena pajak (dari Pengusaha Kena Pajak / PKP):
   - Masukkan nilai PPN ke akun 'PPN Masukan (VAT In 11%)' (Akun Aset Pajak / Posisi DEBIT).
   - Subtotal adalah Dasar Pengenaan Pajak (DPP).
3. Jika pada struk tertulis 'Harga termasuk PPN' (Include PPN):
   - DPP (Subtotal) = Total / 1.11
   - PPN (tax_amount) = Total - DPP
4. Jika struk Non-PKP / Bebas PPN (misal struk BBM Pertamina, kuitansi warung/toko ritel tanpa NPWP/PPN):
   - tax_amount = 0, tax_name = 'Non-PKP (Bebas PPN)'.
   - Seluruh nominal masuk ke akun Beban terkait (Subtotal == Total).

Format JSON yang WAJIB dihasilkan:
{
  "is_valid": true,
  "transaction_type": "PURCHASE_EXPENSE",
  "vendor_name": "Nama Toko Asli",
  "invoice_number": "Nomor Asli",
  "invoice_date": "YYYY-MM-DD",
  "currency": "USD",
  "tax_name": "PST & GST",
  "subtotal": 13417.54,
  "tax_amount": 1204.50,
  "total_amount": 14622.04,
  "description": "Beli 10x Motorola E815, 12x Nokia 3220, 10x Razr Black",
  "line_items": [
    {
      "item_name": "Motorola E815",
      "quantity": 10,
      "unit_price": 420.00,
      "total_price": 4200.00
    },
    {
      "item_name": "Nokia 3220",
      "quantity": 12,
      "unit_price": 199.99,
      "total_price": 2399.88
    }
  ],
  "journal_lines": [
    {
      "account_code": "5-1001",
      "account_name": "Beban Operasional",
      "position": "DEBIT",
      "amount": 13417.54,
      "memo": "Beli 10x Motorola E815, 12x Nokia 3220, 10x Razr Black"
    },
    {
      "account_code": "1-1180",
      "account_name": "Pajak Masukan (PST & GST)",
      "position": "DEBIT",
      "amount": 1204.50,
      "memo": "Pajak Masukan (PST 807.14 + GST 397.36)"
    },
    {
      "account_code": "2-1001",
      "account_name": "Hutang Usaha",
      "position": "CREDIT",
      "amount": 14622.04,
      "memo": "Tagihan Vendor INV1000"
    }
  ]
}

ATURAN KETAT:
- WAJIB BACA TEKS DARI GAMBAR ASLI.
- Seluruh angka nominal harus berupa angka murni number/float (contoh: 14622.04 untuk $14,622.04, atau 11100000 untuk Rp 11.100.000). JANGAN memotong atau membulatkan sen ke integer jika terdapat desimal!
- Total Debit HARUS SAMA PERSIS dengan Total Kredit (Zero Discrepancy).`;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
    },
  };

  let lastErr = '';
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return JSON.parse(text);
        } else {
          lastErr = `${model} ${res.status}: ${await res.text()}`;
        }
      } catch (e: any) {
        lastErr = e.message;
      }
    }
  }

  throw new Error(`Semua endpoint AI sedang sibuk: ${lastErr}`);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = (formData.get('data') || formData.get('file')) as File | null;
    const n8nUrl = (formData.get('n8nUrl') as string) || '';

    if (!file) {
      return NextResponse.json({ success: false, message: 'Tidak ada file gambar yang diunggah.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // 1. Jika ada target n8n, forward file ke n8n agar canvas n8n MENYALA HIJAU ✅!
    let n8nResult: any = null;
    if (n8nUrl && (n8nUrl.includes('localhost:5678') || n8nUrl.includes('/ocr-invoice'))) {
      try {
        const n8nFormData = new FormData();
        n8nFormData.append('data', file);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const n8nRes = await fetch(n8nUrl, {
          method: 'POST',
          body: n8nFormData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (n8nRes.ok) {
          const textBody = await n8nRes.text();
          if (textBody && textBody.trim().length > 0) {
            try {
              n8nResult = JSON.parse(textBody);
            } catch (e) {
              console.log('n8n returned non-JSON, fallback to direct Gemini');
            }
          }
        }
      } catch (err: any) {
        console.log('Forwarding to n8n completed or skipped:', err.message);
      }
    }

    // 2. Jika n8n mengembalikan data valid, pakai hasil n8n
    let parsed: any = null;
    if (n8nResult && (n8nResult.data || n8nResult.journal_entry)) {
      parsed = n8nResult.data || n8nResult;
    } else {
      // 3. Jika n8n tidak mengembalikan payload (misal responseBody kosong), proses langsung via Gemini Vision
      parsed = await extractWithGemini(base64Data, mimeType);
    }

    if (!parsed || parsed.is_valid === false) {
      return NextResponse.json({
        success: false,
        message: parsed?.error_reason || 'Dokumen buram atau bukan kuitansi/faktur resmi.',
      }, { status: 422 });
    }

    // Helper pembersih angka desimal akurat (presisi sen finansial 2 desimal)
    const parseFinAmount = (val: any): number => {
      if (typeof val === 'number') return Math.round(val * 100) / 100;
      const str = String(val || '0').replace(/[^0-9.-]+/g, '');
      const num = parseFloat(str);
      return isNaN(num) ? 0 : Math.round(num * 100) / 100;
    };

    const cleanTotal = parseFinAmount(parsed.total_amount);
    const cleanSubtotal = parseFinAmount(parsed.subtotal || cleanTotal);
    const cleanTax = parseFinAmount(parsed.tax_amount);
    const cleanCurrency = (parsed.currency || 'IDR').toUpperCase().replace('$', 'USD');
    const cleanTaxName = parsed.tax_name || (cleanTax > 0 ? (cleanCurrency === 'IDR' ? 'PPN 11%' : 'Pajak Masukan') : 'Tanpa Pajak');

    // Parse rincian line items barang/jasa
    const rawItems = Array.isArray(parsed.line_items) ? parsed.line_items : (Array.isArray(parsed.items) ? parsed.items : []);
    const cleanLineItems = rawItems.map((it: any) => ({
      item_name: it.item_name || it.description || it.name || 'Item Belanja',
      quantity: it.quantity ? Number(it.quantity) : 1,
      unit_price: it.unit_price ? parseFinAmount(it.unit_price) : undefined,
      total_price: parseFinAmount(it.total_price || it.total || it.amount || 0),
    }));

    // Auto-generate Best Practice Description jika deskripsi dari AI masih terlalu generik
    let cleanDescription = parsed.description || 'Pembelian Operasional';
    if (cleanLineItems.length > 0 && (cleanDescription.toLowerCase().includes('pembelian barang') || cleanDescription.toLowerCase().includes('tagihan operasional') || cleanDescription === 'Pembelian Operasional')) {
      const summaryList = cleanLineItems.slice(0, 3).map((it: any) => `${it.quantity > 1 ? it.quantity + 'x ' : ''}${it.item_name}`).join(', ');
      cleanDescription = 'Beli: ' + summaryList + (cleanLineItems.length > 3 ? ` (+${cleanLineItems.length - 3} item lainnya)` : '');
    }

    let lines = Array.isArray(parsed.journal_lines) ? parsed.journal_lines : (parsed.journal_entry?.lines || []);
    if (lines.length === 0) {
      lines = [
        {
          account_code: '5-1001',
          account_name: 'Beban Operasional',
          position: 'DEBIT',
          amount: cleanSubtotal,
          memo: parsed.description || 'Beban Pembelian',
        },
        ...(cleanTax > 0 ? [{
          account_code: '1-1180',
          account_name: 'PPN Masukan (VAT In 11%)',
          position: 'DEBIT',
          amount: cleanTax,
          memo: 'PPN Masukan 11%',
        }] : []),
        {
          account_code: '1-1001',
          account_name: 'Kas / Bank BCA',
          position: 'CREDIT',
          amount: cleanTotal,
          memo: 'Pembayaran Lunas via Kas/Bank',
        },
      ];
    }

    let totalDebit = 0;
    let totalCredit = 0;

    const formattedLines = lines.map((line: any, idx: number) => {
      const pos = (line.position || (line.debit > 0 ? 'DEBIT' : 'CREDIT')).toUpperCase();
      const amt = parseFinAmount(line.amount || (pos === 'DEBIT' ? line.debit : line.credit));
      if (pos === 'DEBIT') totalDebit += amt;
      else totalCredit += amt;

      return {
        line_no: idx + 1,
        account_code: line.account_code || (pos === 'DEBIT' ? '5-1001' : '1-1001'),
        account_name: line.account_name || (pos === 'DEBIT' ? 'Beban Operasional' : 'Kas / Bank BCA'),
        position: pos,
        debit: pos === 'DEBIT' ? amt : 0,
        credit: pos === 'CREDIT' ? amt : 0,
        memo: line.memo || parsed.description || 'Jurnal Posting',
      };
    });

    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.05;

    return NextResponse.json({
      success: true,
      data: {
        vendor_name: parsed.vendor_name || 'Vendor Rekanan',
        invoice_number: parsed.invoice_number || `INV-${Math.floor(Math.random() * 89999 + 10000)}`,
        invoice_date: parsed.invoice_date || new Date().toISOString().split('T')[0],
        transaction_type: parsed.transaction_type || 'PURCHASE_EXPENSE',
        currency: cleanCurrency,
        tax_name: cleanTaxName,
        subtotal: cleanSubtotal,
        tax_amount: cleanTax,
        total_amount: cleanTotal,
        description: cleanDescription,
        line_items: cleanLineItems,
        journal_entry: {
          entry_date: parsed.invoice_date || new Date().toISOString().split('T')[0],
          reference_no: parsed.invoice_number || 'INV-AUTO',
          total_debit: totalDebit,
          total_credit: totalCredit,
          is_balanced: isBalanced,
          lines: formattedLines,
        },
      },
    });
  } catch (error: any) {
    console.error('OCR Route Exception:', error);
    return NextResponse.json({ success: false, message: error.message || 'Gagal memproses OCR.' }, { status: 500 });
  }
}
