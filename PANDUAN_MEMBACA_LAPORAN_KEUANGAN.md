# Panduan Praktis Membaca Laporan Keuangan (Logistik Enterprise)
**Sistem**: ERP Bank Reconciliation & Accounting Module  
**Entitas**: PT Nusantara Global Mandiri  
**Dokumen Pendamping**: [ACCOUNTING_COMPLIANCE.md](./ACCOUNTING_COMPLIANCE.md)

---

## 1. Hubungan Antar Laporan (Siklus Keuangan)

Tiga tab laporan di aplikasi tidak berdiri sendiri, melainkan saling terhubung secara berurutan:

```
[ BUKU BESAR / GENERAL LEDGER ]
               │
               ▼
   [ 1. NERACA SALDO (TRIAL BALANCE) ]
         │ (Memverifikasi Total Debit = Kredit)
         │
         ├───► Akun Nominal (4xx, 5xx, 6xx, 7xx, 8xx)
         │           │
         │           ▼
         │     [ 2. LAPORAN LABA RUGI ]
         │           │
         │           ▼
         │     LABA BERSIH PERIODE BERJALAN
         │           │
         │           └──────────────────────────┐
         │                                      │ (Mengalir Otomatis)
         └───► Akun Riil (1xx, 2xx, 3xx)        │
                     │                          ▼
                     └────────────────► [ 3. NERACA (POSISI KEUANGAN) ]
                                             Total Aset = Total Liabilitas + Ekuitas
```

---

## 2. Cara Membaca Tab 1: Neraca Saldo (*Trial Balance GL*)

### Fungsi:
Sebagai **alat audit internal** untuk memastikan tidak ada kesalahan input jurnal (Debit dan Kredit wajib seimbang).

### Elemen Kolom:
1. **Kode & Nama Akun**: Kode bagan akun standar (COA).
   - `1xx` = Aset (Kas, Bank, Piutang, Armada Truk)
   - `2xx` = Liabilitas (Hutang Vendor, Leasing)
   - `3xx` = Ekuitas (Modal Saham, Laba Ditahan)
   - `4xx` = Pendapatan
   - `5xx` = Beban Pokok Pendapatan (HPP Logistik)
   - `6xx` = Beban Operasional Kantor (OPEX)
   - `7xx` / `8xx` = Pendapatan & Beban Lain-lain
2. **Pos / Saldo Normal**:
   - `D` (*Debit*): Bertambah di sisi debit (Aset, Beban, HPP).
   - `K` (*Kredit*): Bertambah di sisi kredit (Liabilitas, Ekuitas, Pendapatan).
3. **Saldo Awal**: Posisi saldo akun pada awal bulan (sebelum ada transaksi baru).
4. **Turnover Debit & Kredit**: Total perputaran uang yang masuk dan keluar dari voucher transaksi yang di-*posting* selama bulan berjalan.
5. **Akhir Debit & Akhir Kredit**: Posisi saldo bersih setelah transaksi diakumulasikan.

> **Kunci Pemeriksaan**:  
> Periksa baris paling bawah (**TOTAL NERACA SALDO**).  
> **Total Akhir Debit WAJIB sama dengan Total Akhir Kredit**. Jika selisihnya Rp 0, pembukuan dinyatakan valid.

---

## 3. Cara Membaca Tab 2: Laporan Laba Rugi (*Income Statement*)

### Fungsi:
Menjawab pertanyaan mendasar manajemen: **"Apakah operasional perusahaan menghasilkan laba atau rugi selama periode ini?"**

Laporan ini disusun dengan metode **Multi-Step (Berjenjang)**:

### 3.1. Pendapatan Usaha Logistik (Top Line)
- Akun `411-100`: Pendapatan Jasa Trucking & Distribusi
- Akun `411-200`: Pendapatan Jasa Freight Forwarding & Kliring Pelabuhan
- **Total Pendapatan Usaha**: Omset kotor penjualan jasa logistik ke pelanggan/klien.

### 3.2. Beban Pokok Pendapatan (HPP Logistik Langsung)
Biaya yang **hanya keluar jika armada beroperasi**:
- `511-100` : BBM Solar Truk (Biosolar B35)
- `511-200` : E-Toll Trans Jawa & Uang Saku Supir
- `511-300` : Vendor Subkontraktor Angkutan Pihak Ketiga
- `511-400` : Terminal Handling Charges (THC) & Biaya Lift-On Depo Pelabuhan
- `511-500` : Beban Penyusutan Armada Truk Operasional

### 3.3. Laba Kotor (Gross Profit)
$$\text{Laba Kotor} = \text{Total Pendapatan Usaha} - \text{Total HPP Logistik}$$
- **Makna Finansial**: Menunjukkan efisiensi utilisasi armada dan margin rute pengiriman.
- **Tolak Ukur Industri Logistik**: *Gross Profit Margin* idealnya berada di kisaran **20% – 35%**.

### 3.4. Beban Operasional & Umum (OPEX)
Biaya tetap untuk menjalankan perusahaan di luar trip armada:
- `610-100` : Pemeliharaan Rutin & Suku Cadang Armada (*Sparepart*)
- `610-200` : Asuransi Kargo & Kendaraan
- `610-300` : Gaji Staf Kantor & Manajemen
- `610-400` : Sewa Kantor & Utilitas (Listrik, Internet, Air)
- `610-500` : Penyusutan Gedung Pool Armada & Fasilitas Kantor

### 3.5. Laba Operasional Usaha (EBIT)
$$\text{EBIT} = \text{Laba Kotor} - \text{Total Beban Operasional (OPEX)}$$
- Menunjukkan kemampuan bisnis logistik menghasilkan keuntungan murni sebelum pos keuangan/pajak.

### 3.6. Pendapatan & Beban Lain-lain (Non-Operasional)
- `+` Akun `710-100`: Pendapatan Bunga Jasa Giro & Deposito Bank
- `-` Akun `810-100`: Beban Administrasi Bank
- `-` Akun `810-200`: Beban Bunga Pembiayaan Leasing Armada Truk

### 3.7. Laba Bersih Periode Berjalan (Net Income / Bottom Line)
$$\text{Laba Bersih} = \text{Laba Operasi} + \text{Pendapatan Bunga} - \text{Beban Administrasi \& Bunga Leasing}$$
- **Angka ini otomatis dialirkan ke Neraca (Sisi Ekuitas, Akun 331-100)**.

---

## 4. Cara Membaca Tab 3: Neraca (*Laporan Posisi Keuangan*)

### Fungsi:
Menunjukkan **kondisi kesehatan aset, cadangan kas, kewajiban hutang, dan modal pemilik** pada satu tanggal spesifik.

Neraca wajib memenuhi persamaan ekuilibrium akuntansi:
$$\mathbf{Total\ Aset = Total\ Liabilitas + Total\ Ekuitas}$$

---

### SISI KIRI: ASET (Kekayaan Perusahaan)

#### 1. Aset Lancar (Likuid / Cepat Dicairkan):
- **Kas Kecil & Bank Mandiri/BCA/BRI/BNI**: Saldo uang kas riil di rekening bank operasional perusahaan.
- **Piutang Usaha Pelanggan**: Tagihan ke *customer* yang barangnya sudah terkirim (POD selesai) namun belum dibayar.
- **Uang Muka Operasional Sopir**: Kas jalan yang dipegang sopir dan belum di-LPJ-kan (*unsettled*).

#### 2. Aset Tetap & Infrastruktur Logistik:
- **Armada Truk & Tronton**: Harga beli aset kendaraan logistik yang dimiliki perusahaan.
- **Bangunan Gudang & Fasilitas Pool**: Nilai properti gudang depo dan fasilitas *maintenance*.
- **Akumulasi Penyusutan (Tanda Kurung / Negatif)**: Penurunan nilai buku aset karena pemakaian dan usia pakai.
- **Total Aset Tetap Bersih** = Nilai Perolehan Aset Tetap - Akumulasi Penyusutan.

$$\text{TOTAL ASET} = \text{Aset Lancar} + \text{Aset Tetap Bersih}$$

---

### SISI KANAN: LIABILITAS & EKUITAS (Sumber Pembiayaan Aset)

#### 1. Liabilitas Jangka Pendek (Jatuh tempo < 1 tahun):
- **Hutang Usaha Vendor**: Tagihan solar dari SPBU mitra atau mitra pelayaran yang belum dibayar.
- **Hutang Biaya Akrual**: Gaji atau premi supir yang sudah menjadi hak supir namun belum tanggal pembayaran.
- **Hutang Perpajakan**: Titipan PPN Keluaran atau PPh 23 terutang ke kas negara.

#### 2. Liabilitas Jangka Panjang (Jatuh tempo > 1 tahun):
- **Hutang Sewa Pembiayaan / Leasing Armada**: Sisa pokok pinjaman pembelian armada truk ke lembaga pembiayaan/bank.

#### 3. Ekuitas (Hak Milik Pemegang Saham):
- **Modal Saham Disetor Penuh**: Setoran modal awal pendiri perusahaan saat pendirian PT.
- **Saldo Laba Ditahan (*Retained Earnings*)**: Akumulasi laba bersih tahun-tahun sebelumnya yang ditahan untuk ekspansi bisnis (tidak dibagi dividen).
- **Laba Periode Berjalan**: **Laba bersih yang otomatis mengalir dari Tab Laporan Laba Rugi**.

$$\text{TOTAL LIABILITAS \& EKUITAS} = \text{Liabilitas Lancar} + \text{Liabilitas Panjang} + \text{Modal} + \text{Laba Berjalan}$$

---

## 5. Cara Membaca Tab 4: Laporan Arus Kas (*Cash Flow Statement*)

### Mengapa Owner Sangat Membutuhkan Laporan Ini? (*The Cash vs Profit Trap*)
Banyak pemilik perusahaan logistik mengalami situasi:  
*"Di Laporan Laba Rugi kita mencatat laba Rp 200 juta, tapi kenapa saldo rekening giro bank kita menipis?"*

Jawabannya adalah **Perbedaan Akrual vs Kas**:
- Di Laba Rugi, pendapatan sudah diakui saat barang selesai diantar (POD terbit), padahal **uang kasnya belum tentu dibayar oleh klien**.
- Ada pengeluaran kas yang **tidak masuk laba rugi**, misalnya pembayaran angsuran pokok leasing truk atau uang muka pembelian armada baru.

Laporan Arus Kas membedah pergerakan uang tunai riil ke dalam 3 aktivitas:

1. **Arus Kas Aktivitas Operasi**:
   - `+` Penerimaan kas pelunasan piutang invoice dari pelanggan logistik.
   - `+` Penerimaan bunga giro bank.
   - `-` Pengeluaran kas untuk pembelian solar BBM armada.
   - `-` Pengeluaran kas sewa armada subkontraktor dan suku cadang.
   - `-` Pengeluaran kas biaya terminal pelabuhan (THC).
   - **Makna**: Jika nilainya positif (+), operasional harian mampu membiayai dirinya sendiri tanpa perlu pinjam uang.
2. **Arus Kas Aktivitas Investasi**:
   - Pembelian aset tetap armada truk baru atau renovasi fasilitas pool.
3. **Arus Kas Aktivitas Pendanaan**:
   - Pembayaran cicilan pokok leasing armada truk dan bunga pembiayaan ke bank.

$$\text{Saldo Kas Akhir} = \text{Saldo Kas Awal} + \text{Arus Kas Operasi} + \text{Arus Kas Investasi} + \text{Arus Kas Pendanaan}$$

---

## 6. Cara Membaca Tab 5: Analisis Eksekutif Owner (AR Aging & Profitabilitas Rute)

### 6.1. Jadwal Umur Piutang (*AR Aging Schedule*)
Menjawab kekhawatiran Owner: **"Siapa klien yang menunggak dan membahayakan kas harian armada?"**

| Kelompok Umur | Kategori Risiko | Tindakan Manajemen Owner |
| :--- | :--- | :--- |
| **0 - 30 Hari** | **Lancar (Healthy)** | Pembayaran berjalan normal sesuai tempo kredit standar. |
| **31 - 60 Hari** | **Perhatian (Warning)** | Tim finance wajib mengirim surat pengingat (*statement of account*). |
| **61 - 90 Hari** | **Peringatan Tinggi** | Batasi plafon kredit rute baru untuk pelanggan tersebut. |
| **> 90 Hari** | **Kritis / Macet (Critical)** | **Tahan penugasan armada baru**. Lakukan penagihan langsung (*legal warning*). |

### 6.2. Profitabilitas per Rute / Unit Bisnis (*Job Costing / Unit Economics*)
Menjawab: **"Rute mana yang paling menghasilkan uang dan mana yang bakar uang?"**

- **Koridor Jakarta - Surabaya (Full Truck Load 40ft)**:
  - Omset tinggi dan ketersediaan muatan stabil. Margin Kotor mencapai **~50%**.
- **Jasa Handling & Freight Pelabuhan Tanjung Priok**:
  - Efisiensi tinggi dengan perputaran cepat. Margin Kotor **~53.5%**.
- **Rute Lintas Trans Sumatra (Jakarta - Medan)**:
  - Margin rendah (**~23.4%**) akibat konsumsi solar tinggi, biaya penyeberangan kapal feri, dan risiko truk pulang kosong (*empty haul*).
  - **Keputusan Owner**: Naikkan tarif rute Sumatra atau wajibkan order muatan balik sebelum armada diberangkatkan.

---

## 7. Pertanyaan Praktis Bisnis Logistik yang Dijawab oleh Laporan Ini

| Pertanyaan Bisnis Owner | Tab yang Dilihat | Baris / Indikator yang Diperiksa |
| :--- | :--- | :--- |
| **Berapa sisa uang kas riil dan giro perusahaan?** | Neraca / Arus Kas | Kelompok Akun `111-xxx` / Saldo Kas Akhir |
| **Kenapa laba tinggi tapi kas di bank tiris?** | Arus Kas | Aktivitas Operasi vs Pembayaran Pokok Leasing |
| **Klien mana yang berisiko gagal bayar?** | Analisis Owner | Tabel Umur Piutang kolom `> 60 Hari` |
| **Rute pengiriman mana yang paling menguntungkan?** | Analisis Owner | Tabel Profitabilitas Rute kolom `Margin (%)` |
| **Berapa sisa pokok hutang leasing armada yang harus dilunasi?** | Neraca | Akun `221-100` (Hutang Leasing Armada) |
| **Apakah ada data pembukuan yang korup atau tidak seimbang?** | Neraca Saldo | Baris **Total Saldo Akhir Debit vs Kredit** |

