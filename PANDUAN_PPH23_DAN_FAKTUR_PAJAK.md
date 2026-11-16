# Panduan Kepatuhan & Implementasi PPh 23 dan Faktur Pajak
**Sistem**: ERP Bank Reconciliation & Accounting Engine (`mvp-bank-recon`)  
**Entitas Acuan**: PT Nusantara Global Mandiri (Freight Forwarding, Trucking & Supply Chain Logistics)  
**Regulasi Acuan**: UU PPh Pasal 23, UU PPN / UU HPP, PMK No. 71/PMK.03/2022, PER-03/PJ/2022 (Faktur Pajak)  
**Status Audit Saat Ini**: Evaluasi Kesiapan Fungsional & Cetak Biru Arsitektur  

---

## 1. Ringkasan Eksekutif & Status Saat Ini (Current State Audit)

### 1.1. Apakah Modul `mvp-bank-recon` Sudah Oke?
**Secara Fondasi Core Rekonsiliasi & Finansial: SUDAH SANGAT SOLID.**
- **Rekonsiliasi Bank**: Engine pencocokan transaksi (1-to-1, 1-to-many, rule-based keywords, alokasi parsial, serta session locking status `OPEN` -> `LOCKED`) berjalan akurat dan ACID-compliant.
- **Buku Besar & Jurnal**: Menerapkan double-entry bookkeeping berimbang ($$\sum \text{Debit} = \sum \text{Kredit}$$).
- **Pelaporan Finansial**: Laporan Neraca (Balance Sheet), Laba Rugi Bertahap (Multi-Step Income Statement), Arus Kas Langsung (Direct Cash Flow), Neraca Saldo (Trial Balance), dan Analisis Umur Piutang (AR Aging) terhitung secara otomatis dan dinamis.

---

### 1.2. Apakah PPh 23 dan Faktur Pajak Sudah Ter-cover?
| Komponen Pajak | Status di Kode Saat Ini | Keterangan & Gap Analysis |
| :--- | :---: | :--- |
| **PPh Pasal 23** | ⚠️ **Belum Tercover secara Fungsional** | Baru tercatat sebatas teori di dokumen `ACCOUNTING_COMPLIANCE.md` dan ada 1 akun gabungan `213-100: Hutang Perpajakan (PPN & PPh 23)`. Modul OCR dan Bank Recon **belum** memiliki logika kalkulasi potongan 2%, pemisahan Uang Muka PPh 23 vs Hutang PPh 23, maupun pencatatan Bukti Potong (Bupot). |
| **Faktur Pajak (PPN)** | ⚠️ **Tercover Sebagian (Hanya Nominal PPN)** | Modul OCR Gemini AI sudah mampu mengekstrak nilai nominal PPN (`tax_amount`) dan membentuk jurnal `PPN Masukan (11%)`. Namun **belum mengekstrak Nomor Seri Faktur Pajak (NSFP 16 digit)**, belum ada validasi format DJP, dan belum ada integrasi e-Faktur. |

---

## 2. Pemahaman Konseptual PPh 23 & Faktur Pajak pada Industri Logistik

Dalam bisnis ekspedisi, *trucking*, dan *freight forwarding*, perlakuan pajak memiliki dua sisi yang saling berlawanan:

```
                          ┌───────────────────────────────────────────────┐
                          │    PT NUSANTARA GLOBAL MANDIRI (LOGISTIK)     │
                          └──────────────────────┬────────────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
       [ SISI PENJUALAN / REVENUE ]                                [ SISI PEMBELIAN / BIAYA ]
   Transaksi ke Customer / Pemilik Barang                    Transaksi ke Vendor / Subkon Truk / Sewa
                   │                                                           │
   1. Menerbitkan Invoice Jasa Logistik                       1. Menerima Tagihan Subkon / Sewa Truk
   2. Menerbitkan Faktur Pajak Keluaran                       2. Menerima Faktur Pajak Masukan (NSFP 16-digit)
   3. Customer POTONG PPh 23 (2%)                             3. Kita POTONG PPh 23 (2%) dari Vendor
   4. Uang masuk Bank = Netto (Invoice - PPh 23)              4. Uang keluar Bank = Netto (Tagihan - PPh 23)
   5. Menerima Bukti Potong PPh 23 dari Customer              5. Menerbitkan Bukti Potong PPh 23 (e-Bupot)
                   │                                                           │
                   ▼                                                           ▼
   DICATAT SEBAGAI:                                           DICATAT SEBAGAI:
   "Uang Muka PPh 23" (Prepaid Tax)                           "Hutang PPh 23" (Tax Liability)
   -> Akun Aset Lancar (Posisi DEBIT)                         -> Akun Liabilitas Lancar (Posisi KREDIT)
   -> Menjadi Kredit Pajak di SPT Tahunan Badan               -> Wajib disetor ke Kas Negara (e-Billing)
```

---

## 3. Matriks Skenario Nyata Operasional Logistik

Berikut adalah tabel skenario riil transaksi operasional harian perusahaan transportasi logistik beserta perlakuan akuntansi dan perpajakannya:

| No | Tipe Transaksi | Dokumen Masukan | PPN | PPh 23 | Dampak Akuntansi & Jurnal |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1** | **Sewa Truk Subkon (Vendor PKP & Ber-NPWP)** | Invoice Vendor + Faktur Pajak NSFP | PPN Masukan 11% (Dr) | Kita potong 2% (Cr Hutang PPh 23) | `(Dr) 511-300 Beban Subkon Rp 10jt`<br>`(Dr) 118-100 PPN Masukan Rp 1.1jt`<br>`(Cr) 213-200 Hutang PPh 23 Rp 200rb`<br>`(Cr) 111-201 Bank Rp 10.9jt` |
| **2** | **Sewa Truk Subkon (Vendor Non-NPWP / Perorangan)** | Kuitansi / Nota Tagihan Sopir | Bebas PPN (0%) | Kita potong 4% (Tarif 100% lebih tinggi) | `(Dr) 511-300 Beban Subkon Rp 10jt`<br>`(Cr) 213-200 Hutang PPh 23 Rp 400rb`<br>`(Cr) 111-201 Bank Rp 9.6jt` |
| **3** | **Tagihan Ekspedisi ke Customer (PMK 71)** | Invoice Penagihan + Faktur Pajak Keluaran | PPN Keluaran 1,1% (Cr) | Customer potong 2% dari DPP | `(Dr) 112-100 Piutang Usaha Rp 50.55jt`<br>`(Cr) 411-100 Pendapatan Trucking Rp 50jt`<br>`(Cr) 213-100 Hutang PPN Keluaran Rp 550rb` |
| **4** | **Penerimaan Transfer Bank dari Customer (Pelunasan)** | Rekening Koran Bank (Mutasi Masuk) | - | Uang Muka PPh 23 diakui (Dr) | `(Dr) 111-203 Bank Collection Rp 49.55jt`<br>`(Dr) 113-100 Uang Muka PPh 23 Rp 1jt`<br>`(Cr) 112-100 Piutang Usaha Rp 50.55jt` |
| **5** | **Pembelian BBM Solar SPBU Pertamina** | Struk Mesin SPBU | Bebas PPN Masukan | Non-Objek PPh 23 | `(Dr) 511-100 Beban Solar BBM Rp 450rb`<br>`(Cr) 111-201 Bank / Kas Sopir Rp 450rb` |
| **6** | **Top-Up Tol / E-Money Armada** | Struk Struk ATM / Mutasi | Bebas PPN | Non-Objek PPh 23 | `(Dr) 511-200 Beban Tol Sopir Rp 500rb`<br>`(Cr) 111-201 Kas Bank Rp 500rb` |

---

## 4. Standar Validasi Faktur Pajak (NSFP) & Bukti Potong

### 4.1. Format Nomor Seri Faktur Pajak (NSFP DJP)
Berdasarkan **PER-03/PJ/2022**, Nomor Seri Faktur Pajak memiliki panjang **16 digit** dengan struktur baku:

$$\underbrace{\text{XXX}}_{\text{Kode Transaksi}} . \underbrace{\text{XXX}}_{\text{Status \& Cabang}} - \underbrace{\text{XX}}_{\text{Tahun}} . \underbrace{\text{XXXXXXXX}}_{\text{Nomor Urut}}$$

- **Pola Regex Validasi**:
  ```regex
  ^(0[1-9]|90)[0-9]\.[0-9]{3}\-[0-9]{2}\.[0-9]{8}$
  ```
- **Arti 2 Digit Pertama (Kode Transaksi)**:
  - `01`: Penyerahan Umum BKP/JKP kepada pihak selain Pemungut PPN (Tarif standar 11%).
  - `02`: Penyerahan kepada Instansi Pemerintah (Pemungut bendaharawan).
  - `03`: Penyerahan kepada BUMN / Pemungut PPN Khusus.
  - `04`: Penyerahan dengan DPP Nilai Lain (**Sangat Relevan**: PMK 71/2022 untuk jasa pengiriman paket/ekspedisi tarif efektif 1,1%).
  - `07`: Penyerahan yang PPN-nya Tidak Dipungut (Kawasan Berikat/Kawasan Bebas).
  - `08`: Penyerahan yang PPN-nya Dibebaskan.

### 4.2. Standar e-Bupot Unifikasi (PPh Pasal 23)
Bukti Pemotongan PPh Pasal 23 diterbitkan melalui aplikasi **e-Bupot Unifikasi DJP**:
- Nomor Bukti Potong baku berformat: `X-XXXXXXXXXX-XX-XXXX` (18–22 karakter alfanumerik).
- Wajib mencantumkan:
  1. NPWP / NIK pihak yang dipotong.
  2. Kode Objek Pajak (contoh: `28-100-02` untuk Jasa Pengangkutan/Ekspedisi, `28-100-05` untuk Jasa Sewa Kendaraan/Armada).
  3. Jumlah Penghasilan Bruto (DPP).
  4. Tarif Pajak (2% atau 4%).
  5. Jumlah PPh yang dipotong.

---

## 5. Blueprint Arsitektur Perubahan (Engineering Roadmap)

### 5.1. Pembaruan Master Chart of Accounts (COA)
Struktur akun diperbarui pada `src/lib/mock-data.ts` dan tipe `AccountSubCategory`:

| Kode Akun | Nama Akun | Kategori | Saldo Normal | Penjelasan Posisi Finansial |
| :--- | :--- | :--- | :---: | :--- |
| `113-100` | **Uang Muka PPh Pasal 23** | `CURRENT_ASSET` | **Debit (D)** | Aset Lancar. Bukti potong 2% dari customer, mengurangi PPh Badan di akhir tahun. |
| `118-100` | **PPN Masukan (VAT In)** | `CURRENT_ASSET` | **Debit (D)** | Aset Lancar. Pajak masukan dari vendor PKP yang memiliki NSFP valid. |
| `213-100` | **Hutang PPN Keluaran** | `CURRENT_LIABILITY` | **Kredit (K)** | Liabilitas Lancar. PPN yang kita pungut dari penagihan ke customer. |
| `213-200` | **Hutang PPh Pasal 23** | `CURRENT_LIABILITY` | **Kredit (K)** | Liabilitas Lancar. Potongan 2% dari tagihan subkon, wajib disetor ke kas negara. |

---

### 5.2. Upgrade Engine OCR AI (`src/app/api/ocr/route.ts`)
Tambahkan instruksi spesifik perpajakan Indonesia pada prompt Gemini:

```typescript
export interface ExtractedTaxInvoiceData {
  vendor_name: string;
  vendor_npwp?: string;              // 15 atau 16 digit NPWP
  is_pkp: boolean;                   // Apakah vendor PKP resmi
  invoice_number: string;            // Nomor invoice komersial vendor
  faktur_pajak_number?: string;      // 16-digit NSFP (misal: 010.001-26.12345678)
  invoice_date: string;              // YYYY-MM-DD
  currency: 'IDR' | 'USD';
  dpp_amount: number;                // Dasar Pengenaan Pajak (Subtotal)
  tax_name: string;                  // 'PPN 11%', 'PPN PMK 71 (1.1%)', atau 'Non-PKP'
  tax_amount: number;                // Nominal PPN Masukan
  is_subject_to_pph23: boolean;      // True jika tagihan jasa/subkon truk/sewa
  pph23_rate_pct: number;            // 2% (atau 4% non-NPWP)
  pph23_amount: number;              // Nilai potongan PPh 23
  total_invoice_amount: number;      // DPP + PPN
  net_payment_payable: number;       // DPP + PPN - PPh 23 (Nominal yang ditransfer)
}
```

---

### 5.3. Fitur "Smart Withholding Tax Reconciliation" pada Layar Rekonsiliasi
Alur kerja pada `src/app/page.tsx` & `BankReconView`:

```
 [ Mutasi Bank Masuk: Rp 49.550.000 ]  ──┐
                                         ├─► Selisih Rp 1.000.000 (= 2% DPP)
 [ Piutang Invoice:   Rp 50.550.000 ]  ──┘
                                         │
                                         ▼
            Tombol Pintar: [+ Alokasikan ke Uang Muka PPh 23]
                                         │
                                         ▼
                    Modal Input Bukti Potong:
                    - Nomor Bupot: BP-2026-X-00912
                    - Tanggal Bupot: 2026-10-25
                                         │
                                         ▼
                       AUTO-POSTING JURNAL AUDIT:
           (Dr) Bank Collection          Rp 49.550.000  (Cocok mutasi bank)
           (Dr) Uang Muka PPh 23         Rp  1.000.000  (Klaim bukti potong)
           (Cr) Piutang Usaha Customer   Rp 50.550.000  (Piutang lunas 100%)
```

---

## 6. Dampak terhadap Laporan Keuangan (Audit Compliance)

1. **Laporan Posisi Keuangan (Neraca / Balance Sheet)**:
   - Akun `113-100 Uang Muka PPh 23` muncul di kelompok **Aset Lancar** (Current Assets).
   - Akun `213-200 Hutang PPh 23` muncul di kelompok **Liabilitas Jangka Pendek** (Current Liabilities).
   - Kedua akun ini diaudit secara berkala: saldo `Hutang PPh 23` harus menjadi **Rp 0** setiap tanggal 10 bulan berikutnya setelah pembayaran e-Billing NTPN ke kas negara.
2. **Laporan Arus Kas (Direct Cash Flow)**:
   - Kas masuk dari pelanggan dicatat sebesar nilai neto penerimaan fisik mutasi bank (`Rp 49.550.000`).
   - Pembayaran PPh 23 ke kas negara dicatat pada arus kas operasional sebagai *Pembayaran Pajak Penghasilan*.
3. **SPT Tahunan PPh Badan (Formulir 1771 Lampiran III)**:
   - Seluruh mutasi debit pada akun `113-100` diekspor bersama daftar nomor bukti potong untuk langsung dijadikan pengurang (kredit pajak) atas PPh Terutang Badan di akhir tahun fiskal.

---

## 7. Rencana Tindakan Lanjutan (Checklist)

- [x] Menyusun dokumen kepatuhan & arsitektur perpajakan lengkap (`PANDUAN_PPH23_DAN_FAKTUR_PAJAK.md`).
- [ ] Menambahkan kode akun `113-100` dan `213-200` pada `src/lib/mock-data.ts`.
- [ ] Menambahkan field NSFP 16 digit dan parameter PPh 23 pada prompt AI `src/app/api/ocr/route.ts`.
- [ ] Mengupdate UI draf jurnal pada `src/components/InvoiceOcrView.tsx` untuk menampilkan baris PPh 23.
- [ ] Mengimplementasikan modal alokasi selisih PPh 23 pada modul rekonsiliasi mutasi bank `src/app/page.tsx`.
