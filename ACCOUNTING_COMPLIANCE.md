# Standar Kepatuhan Akuntansi & Arsitektur Sistem Finansial (Logistik Enterprise)
**Sistem**: ERP Bank Reconciliation & Accounting Module  
**Entitas Acuan**: PT Nusantara Global Mandiri (Industri Freight Forwarding, Trucking & Supply Chain Logistics)  
**Standar Akuntansi**: PSAK (Pernyataan Standar Akuntansi Keuangan) & SAK EP (Standar Akuntansi Keuangan Entitas Privat)  
**Prinsip Rekayasa Basis Data**: ACID Compliance (Atomicity, Consistency, Isolation, Durability)

---

## 1. Landasan Regulasi & Kepatuhan Akuntansi (Compliance Baseline)

Untuk perusahaan transportasi dan logistik skala menengah hingga besar di Indonesia, pelaporan keuangan wajib mematuhi ketentuan perundang-undangan dan standar profesi akuntan (Ikatan Akuntan Indonesia - IAI):

### 1.1. Standar Akuntansi Keuangan (SAK)
1. **SAK EP (Entitas Privat) / PSAK 1 (Penyajian Laporan Keuangan)**:
   - Mengharuskan penyajian terstruktur atas:
     - **Laporan Posisi Keuangan (Neraca)** pada akhir periode.
     - **Laporan Laba Rugi dan Penghasilan Komprehensif Lain** selama periode.
     - **Laporan Perubahan Ekuitas**.
     - **Laporan Arus Kas**.
     - **Catatan atas Laporan Keuangan (CALK)**.
2. **Pengakuan Pendapatan (PSAK 72 / SAK EP Bab 23 - Pendapatan dari Kontrak Pelanggan)**:
   - Pendapatan jasa *trucking* dan *freight forwarding* diakui berdasarkan pemenuhan kewajiban pelaksanaan (*performance obligations*), umumnya saat barang sampai di tujuan dan dokumen bukti serah terima (*Proof of Delivery* / POD) telah ditandatangani oleh penerima.
   - Penerimaan kas sebelum POD terbit dicatat sebagai **Pendapatan Diterima di Muka (Unearned Revenue / Liabilitas)**, bukan pendapatan langsung.
3. **Pemisahan Beban Pokok Pendapatan (HPP Jasa Logistik) vs Beban Operasional**:
   - Mengharuskan pemisahan tegas antara biaya langsung armada/pengiriman (*Direct Operating Costs* / HPP) dengan biaya operasional kantor (*Operating Expenses* / OPEX) untuk menghasilkan **Laba Kotor (Gross Profit)** yang akurat.
4. **Aset Tetap & Penyusutan (PSAK 16 / SAK EP Bab 17)**:
   - Armada truk logistik, tronton, kontainer, dan gudang dicatat sebesar harga perolehan dikurangi **Akumulasi Penyusutan** (metode Garis Lurus / *Straight-Line Method*) dan akumulasi rugi penurunan nilai.

### 1.2. Kepatuhan Perpajakan Indonesia
1. **PPN Jasa Kena Pajak Tertentu (PMK No. 71/PMK.03/2022)**:
   - Jasa pengiriman paket/ekspedisi menggunakan besaran tertentu PPN efektif sebesar **1,1%** (10% x tarif PPN umum 11% / penyesuaian regulasi tarif) dari jumlah yang ditagihkan.
2. **PPh Pasal 23**:
   - Pemotongan pajak sebesar **2%** atas jasa perantara, jasa ekspedisi/transportasi pihak ketiga, atau sewa armada tanpa pengemudi.
3. **Faktur Pajak & Bukti Potong**:
   - Sistem wajib mencatat nomor seri faktur pajak dan nomor bukti potong sebagai referensi audit pada setiap jurnal pelunasan invoice.
   - *Panduan mendalam implementasi sistem, formula jurnal, dan OCR tersedia di: [PANDUAN_PPH23_DAN_FAKTUR_PAJAK.md](file:///Users/hacaca/Projects/personal/levelUpSkill/mvp-bank-recon/PANDUAN_PPH23_DAN_FAKTUR_PAJAK.md).*

---

## 2. Arsitektur Basis Data ACID (Financial Ledger Integrity)

Integritas buku besar akuntansi bergantung pada jaminan transaksi ACID di tingkat basis data (PostgreSQL / Supabase):

```
                        [ TRANSAKSI BISNIS ]
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
   Posting Jurnal                             Rekonsiliasi Bank
           │                                           │
 ┌───────────────────────────────────────────────────────────┐
 │                      BEGIN TRANSACTION;                   │
 │                                                           │
 │  [1. ATOMICITY]                                           │
 │  Insert Journal Header & Insert N Journal Lines           │
 │  Gagal 1 baris ──> ROLLBACK seluruh operasi.              │
 │                                                           │
 │  [2. CONSISTENCY]                                         │
 │  Trigger validasi: SUM(debit_amount) = SUM(credit_amount) │
 │  Selisih > 0 ──> RAISE EXCEPTION; ROLLBACK                │
 │                                                           │
 │  [3. ISOLATION]                                           │
 │  Isolation Level: READ COMMITTED / REPEATABLE READ        │
 │  Mencegah dirty read & phantom read saat tutup buku       │
 │                                                           │
 │  [4. DURABILITY]                                          │
 │  Write-Ahead Logging (WAL) ke disk permanen               │
 │  Audit Log & Immutability (Larangan HARD DELETE)          │
 │                                                           │
 │                      COMMIT TRANSACTION;                  │
 └───────────────────────────────────────────────────────────┘
```

### 2.1. Penjelasan 4 Pilar ACID pada Modul Akuntansi

#### A. Atomicity (Keutuhan Transaksi)
- Setiap transaksi jurnal terdiri dari minimal 2 baris (Debit & Kredit).
- Seluruh baris jurnal dalam satu voucher (`transaction_journal` dan seluruh `transaction_journal_line`) harus berhasil ditulis bersamaan.
- Jika koneksi terputus saat baris kredit baru tertulis sebagian, seluruh operasi di-`ROLLBACK` otomatis ke kondisi semula.

#### B. Consistency (Konsistensi Aturan Akuntansi)
- Basis data menerapkan *trigger function* PostgreSQL sebelum commit:
  $$\sum \text{debit\_amount} - \sum \text{credit\_amount} = 0$$
- Akun yang digunakan harus berstatus `is_active = true` di tabel master `master_bbs`.
- Tanggal transaksi wajib berada dalam rentang `start_date` dan `end_date` dari periode fiskal yang berstatus `status = 'OPEN'`. Jika periode fiskal telah `'CLOSED'`, penulisan jurnal ditolak sistem.

#### C. Isolation (Isolasi Transaksi Konkuren)
- Ketika proses rekonsiliasi otomatis berjalan paralel dengan entri invoice OCR, transaksi menggunakan level isolasi `READ COMMITTED` dengan *row-level locking* (`SELECT ... FOR UPDATE`) pada rekening bank dan baris mutasi agar tidak terjadi *double reconciliation*.

#### D. Durability (Daya Tahan & Immutability)
- Sekali jurnal berstatus `POSTED`, data tidak boleh diubah (`UPDATE`) atau dihapus (`DELETE`).
- Koreksi kesalahan wajib menggunakan mekanisme **Jurnal Pembalik (Storno / Reversal Voucher)** yang menghasilkan jejak audit lengkap (*audit trail*).

---

## 3. Bagan Akun (Chart of Accounts / COA) Standar Logistik

Struktur akun mengadopsi hierarki kode numerik standar industri:

### 1xx-xxx : ASET (ASSETS) — Saldo Normal: Debit (D)
- **111-xxx : Kas dan Setara Kas (Aset Lancar)**
  - `111-100` : Kas Kecil Operasional Kantor
  - `111-201` : Bank Mandiri Giro Operasional (Pusat)
  - `111-202` : Bank Mandiri Giro Disbursement (Vendor)
  - `111-203` : Bank Mandiri Giro Collection (VA Pelanggan)
  - `111-204` : Bank Mandiri Giro Cabang Surabaya
  - `111-205` : Bank Mandiri Giro Escrow & Deposito
  - `111-210` : Bank Central Asia (BCA) Giro Operasional
  - `111-220` : Bank Rakyat Indonesia (BRI) Giro Pelabuhan
  - `111-230` : Bank Negara Indonesia (BNI) Giro Perpajakan
- **112-xxx : Piutang Usaha & Lainnya (Aset Lancar)**
  - `112-100` : Piutang Usaha Pelanggan (Freight / Trucking)
  - `112-200` : Cadangan Kerugian Penurunan Nilai Piutang (Kontra Aset)
  - `112-300` : Uang Muka Operasional Sopir & Uang Jalan
- **121-xxx : Aset Tetap Armada Kendaraan (Aset Tidak Lancar)**
  - `121-100` : Aset Tetap Armada Truk & Tronton Logistik
  - `121-190` : Akumulasi Penyusutan Armada Truk (Kontra Aset)
- **122-xxx : Aset Tetap Fasilitas & Peralatan (Aset Tidak Lancar)**
  - `122-100` : Bangunan Gudang, Kantor & Pool Armada
  - `122-190` : Akumulasi Penyusutan Fasilitas Gudang (Kontra Aset)
  - `122-200` : Peralatan Gudang, Forklift & Sistem IT

### 2xx-xxx : LIABILITAS (LIABILITIES) — Saldo Normal: Kredit (K)
- **211-xxx : Liabilitas Jangka Pendek (Lancar)**
  - `211-100` : Hutang Usaha Vendor / Mitra Pelayaran / Subkon Truk
  - `212-100` : Hutang Biaya Operasional Akrual (Gaji Sopir, Klaim Kerusakan)
  - `213-100` : Hutang Perpajakan (PPN Keluaran & PPh 23 Terutang)
- **221-xxx : Liabilitas Jangka Panjang**
  - `221-100` : Hutang Pembiayaan Sewa Armada (Leasing Investasi Truk)
  - `221-200` : Pinjaman Investasi Bank Jangka Panjang

### 3xx-xxx : EKUITAS (EQUITY) — Saldo Normal: Kredit (K)
- `311-100` : Modal Saham Disetor Penuh
- `321-100` : Saldo Laba Ditahan (*Retained Earnings*)
- `331-100` : Laba Periode Berjalan (*Current Year Earnings - Dinamis dari Laba Rugi*)

### 4xx-xxx : PENDAPATAN USAHA (REVENUE) — Saldo Normal: Kredit (K)
- `411-100` : Pendapatan Jasa Trucking & Distribusi Darat
- `411-200` : Pendapatan Jasa Freight Forwarding & Kliring Pelabuhan
- `411-300` : Pendapatan Jasa Pergudangan (*Warehousing & Handling*)

### 5xx-xxx : BEBAN POKOK PENDAPATAN / HPP LOGISTIK (COGS) — Saldo Normal: Debit (D)
- `511-100` : Beban Bahan Bakar Minyak (BBM Solar Armada)
- `511-200` : Beban Tol & Uang Jalan Pengemudi
- `511-300` : Beban Vendor Subkontraktor Angkutan & Freight
- `511-400` : Beban Terminal Handling Charges (THC) & Pelabuhan
- `511-500` : Beban Penyusutan Armada Truk Operasional

### 6xx-xxx : BEBAN OPERASIONAL & UMUM (OPEX) — Saldo Normal: Debit (D)
- `610-100` : Beban Pemeliharaan & Suku Cadang Armada (*Maintenance Sparepart*)
- `610-200` : Beban Asuransi Kargo & Kendaraan
- `610-300` : Beban Gaji Karyawan Kantor & Manajemen
- `610-400` : Beban Sewa Kantor & Utilitas Listrik/Air/Internet
- `610-500` : Beban Penyusutan Gedung & Peralatan Kantor

### 7xx-xxx : PENDAPATAN LAIN-LAIN — Saldo Normal: Kredit (K)
- `710-100` : Pendapatan Bunga Jasa Giro & Deposito Bank

### 8xx-xxx : BEBAN LAIN-LAIN & KEUANGAN — Saldo Normal: Debit (D)
- `810-100` : Beban Administrasi Bank
- `810-200` : Beban Bunga Pembiayaan Leasing Armada

---

## 4. Alur Siklus Akuntansi & Logika Laporan Finansial

### 4.1. Siklus Akuntansi Standar

$$\begin{matrix}
\text{Bukti Transaksi} & \longrightarrow & \text{Jurnal Transaksi} & \longrightarrow & \text{Posting Buku Besar (GL)} \\
\text{(Invoice, Mutasi Bank, OCR)} & & \text{(Double-Entry: Dr/Cr)} & & \text{(Update Saldo Akun)} \\
& & & & \downarrow \\
\text{Laporan Posisi Keuangan} & \longleftarrow & \text{Laporan Laba Rugi} & \longleftarrow & \text{Neraca Saldo} \\
\text{(Neraca: Aset = Hutang + Ekuitas)} & & \text{(Pendapatan - HPP - Beban)} & & \text{(Trial Balance: Total Dr = Cr)}
\end{matrix}$$

### 4.2. Formula Matematis Laporan Keuangan

#### A. Perhitungan Saldo Akhir Buku Besar (General Ledger Rollup)
Untuk akun dengan **Saldo Normal Debit (D)** (Aset, Beban Pokok, Beban Operasional):
$$\text{Saldo Akhir} = \text{Saldo Awal} + \sum \text{Debit Transaksi} - \sum \text{Kredit Transaksi}$$

Untuk akun dengan **Saldo Normal Kredit (K)** (Liabilitas, Ekuitas, Pendapatan):
$$\text{Saldo Akhir} = \text{Saldo Awal} + \sum \text{Kredit Transaksi} - \sum \text{Debit Transaksi}$$

#### B. Laporan Laba Rugi Bertahap (*Multi-Step Income Statement*)
1. **Total Pendapatan Usaha ($R$)**:
   $$R = \sum \text{Akun 4xx}$$
2. **Total Beban Pokok Pendapatan Logistik ($COGS$)**:
   $$COGS = \sum \text{Akun 5xx}$$
3. **Laba Kotor (*Gross Profit*)**:
   $$GP = R - COGS$$
4. **Total Beban Operasional ($OPEX$)**:
   $$OPEX = \sum \text{Akun 6xx}$$
5. **Laba Operasional Usaha (*Operating Income*)**:
   $$EBIT = GP - OPEX$$
6. **Pendapatan & Beban Lain-lain Non-Operasional**:
   $$NetOther = \sum \text{Akun 7xx} - \sum \text{Akun 8xx}$$
7. **Laba Bersih Periode Berjalan (*Net Profit / Loss*)**:
   $$NP = EBIT + NetOther$$

#### C. Laporan Posisi Keuangan (Neraca / Balance Sheet)
Neraca wajib memenuhi persamaan ekuilibrium fundamental:
$$\text{Total Aset} = \text{Total Liabilitas} + \text{Total Ekuitas}$$

Di mana komposisi Ekuitas mencakup:
$$\text{Total Ekuitas} = \text{Modal Disetor (311)} + \text{Laba Ditahan (321)} + \text{Laba Periode Berjalan } (NP)$$

Jika selisih $\left| \text{Total Aset} - (\text{Total Liabilitas} + \text{Total Ekuitas}) \right| > 0$, sistem menandai indikator **UNBALANCED WARNING** untuk segera ditinjau oleh staf akuntansi.

---

## 5. Hubungan Rekonsiliasi Bank dengan Buku Besar

Ketika mutasi rekening koran dicocokkan (*reconciled*) dengan jurnal buku besar:
1. **Bank Charges (Biaya Administrasi)**:
   - Terbit mutasi debit di bank $\rightarrow$ Sistem membuat jurnal penyesuaian otomatis:
     - **Debit**: `810-100` Beban Administrasi Bank
     - **Kredit**: `111-20x` Kas di Bank
2. **Jasa Giro / Bunga Bank**:
   - Terbit mutasi kredit di bank $\rightarrow$ Sistem membuat jurnal penyesuaian otomatis:
     - **Debit**: `111-20x` Kas di Bank
     - **Kredit**: `710-100` Pendapatan Bunga Jasa Giro
3. **Locking Sesi Rekonsiliasi**:
   - Setelah rekonsiliasi ditutup (`status = 'LOCKED'`), saldo akhir rekening koran dan saldo akhir buku besar bank diverifikasi dengan selisih Rp 0.

---

## 6. Prosedur Tutup Buku Periode (Fiscal Period Closing SOP)

1. **Verifikasi Neraca Saldo (Trial Balance)**: Memastikan total kolom debit sama dengan total kolom kredit.
2. **Jurnal Penyesuaian Akrual**: Pencatatan beban BBM sopir belum dibayar, bunga bank, dan penyusutan armada bulanan.
3. **Kunci Periode Fiskal**: Mengubah status periode pada `fiscal_period` dari `'OPEN'` menjadi `'CLOSED'` untuk mencegah penambahan atau perubahan voucher bertanggal mundur (*backdating*).
4. **Tutup Buku Tahunan (Year-End Close)**: Memindahkan saldo `Laba Periode Berjalan (331-100)` ke akun `Saldo Laba Ditahan (321-100)`. Saldo nominal pendapatan (4xx) dan beban (5xx, 6xx, 7xx, 8xx) di-nolkan untuk memulai tahun buku baru.
