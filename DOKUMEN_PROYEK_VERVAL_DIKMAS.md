# DOKUMEN PROYEK PERUBAHAN
## Sistem Terpadu Verifikasi & Validasi (Verval) Administrasi Dapodik PKBM dan Portal Dinas Pendidikan Wilayah (Dikmas)

---

## BAGIAN A — NASKAH KONSEPTUAL DIKLATPIM (UNTUK KEPALA BIDANG DIKMAS)

### 1. Latar Belakang & Permasalahan Lapangan
Pasca batas akhir (*cut-off*) pemutakhiran Data Pokok Pendidikan (Dapodik) tanggal **31 Agustus** setiap tahun ajaran, Kepala Bidang Pendidikan Masyarakat (Dikmas) di Dinas Pendidikan Kabupaten/Kota secara rutin menghadapi tiga tantangan utama dalam pembinaan dan pengawasan Pusat Kegiatan Belajar Masyarakat (PKBM) penyelenggara Program Kesetaraan Paket A, Paket B, dan Paket C:

1. **Disparitas Data Antara Tarikan Dapodik dan Arsip Fisik Lembaga**  
   Operator PKBM sering kali baru menyadari adanya kekurangan dokumen warga belajar (NIK tidak padan 16 digit, Nomor KK kosong, ketiadaan Nama Ibu Kandung, atau belum adanya scan KK/Akta/Ijazah/Surat Pindah) menjelang sinkronisasi akhir, verifikasi Bantuan Operasional Penyelenggaraan (BOP) Kesetaraan, maupun penetapan Daftar Nominatif Peserta Ujian Pendidikan Kesetaraan.
2. **Beban Kerja Ganda (*Double Entry*) di Tingkat Operator PKBM**  
   Pengelolaan data akademik LMS dan pemberkasan administrasi Dapodik yang terpisah memaksa operator melakukan input ulang data warga belajar yang sama pada beberapa aplikasi atau lembar kerja Excel.
3. **Risiko Ketidakvalidan Sasaran (Pencegahan Warga Belajar Fiktif)**  
   Tanpa instrumen rekonsiliasi yang transparan antara jumlah data hasil tarik Dapodik dan kelengkapan berkas fisik identitas warga belajar, Dinas Pendidikan kesulitan mendeteksi dini anomali jumlah warga belajar yang terdaftar di aplikasi namun tidak didukung bukti administrasi kependudukan maupun ijazah asal yang sah.

### 2. Gagasan Aksi Perubahan: Verval Terpadu Satu Tabel (`Zero Re-Entry`)
Proyek perubahan ini menghadirkan alur kerja digital terintegrasi **Impor Dapodik → Data Siswa → Verval Administrasi → Dashboard Dinas** dengan pendekatan **Satu Sumber Kebenaran (*Single Source of Truth*)**:

- **Integrasi Langsung Excel Dapodik ke Tabel `Siswa` Terpadu**  
  File ekspor Peserta Didik dari Dapodik (`.xlsx`/`.xls`) dapat langsung diimpor ke dalam sistem. Sistem otomatis mencocokkan NIK dan NISN pada satu tabel `Siswa` milik PKBM terkait (`sumberDapodik = true`), mengisi biodata awal LMS tanpa menduplikasi tabel siswa, serta mencatat angka pembanding **Hasil Tarik Dapodik** (`totalSiswaDapodik`).
- **Pemberdayaan Warga Belajar untuk Mandiri Melengkapi Berkas**  
  Melalui tab **"Lengkapi Berkas Dapodik"** pada portal LMS siswa, warga belajar dapat langsung mengunggah 4 dokumen persyaratan (**Kartu Keluarga, Akta Kelahiran/KTP, Ijazah Terakhir, dan Surat Pindah/SKP**) serta memperbarui biodata kependudukan dari rumah sebelum diajukan (`SIAP_VERVAL`) ke operator PKBM.
- **Kartu Rekonsiliasi Selisih & Deteksi Dini "Tanpa Berkas"**  
  Dashboard Operator PKBM menampilkan perbandingan real-time antara **Hasil Tarik Dapodik**, **Berkas Fisik Lengkap**, dan **Selisih Belum Ada Berkas** dilengkapi tombol filter cepat **"Hanya Tanpa Berkas"**. Mekanisme ini memastikan setiap nama warga belajar yang tercatat di Dapodik benar-benar memiliki eksistensi dan dokumen fisik yang dapat dipertanggungjawabkan (*anti-fiktif*).

### 3. Penghormatan Fleksibilitas Pendidikan Kesetaraan (Batas Kewenangan Dinas)
Pendidikan Kesetaraan (Paket A, B, dan C) memiliki karakteristik layanan pembelajaran yang fleksibel (tatap muka, tutorial, dan belajar mandiri) karena mayoritas warga belajar merupakan peserta didik usia kerja, putus sekolah, atau pembelajar dewasa.  

Oleh karena itu, desain **Portal Verval Wilayah Dinas Pendidikan (`/dinas`)** menerapkan prinsip **Pemisahan Tata Kelola Administratif & KBM**:
- **Fokus Murni Verifikasi Administratif**: Verifikator Dinas Pendidikan Kabupaten/Kota hanya memeriksa kelengkapan biodata Dapodik, kepatuhan tanggal masuk terhadap batas *cut-off* 31 Agustus, serta keabsahan 4 dokumen scan (KK, Akta/KTP, Ijazah, Surat Pindah).
- **Zero Eksposur Data Akademik KBM ke Dinas**: Sistem secara arsitektural **tidak pernah mengirim maupun menampilkan** data presensi harian, nilai tugas, nilai rapor, atau skor ujian KBM ke antarmuka maupun endpoint API Dinas Pendidikan, sehingga PKBM tetap memiliki ruang fleksibilitas pedagogis penuh dalam melayani warga belajar.

### 4. Manfaat Strategis bagi Bidang Dikmas
- **Akuntabilitas Berbasis Bukti Fisik**: Seluruh keputusan `LOLOS_VERVAL` atau `PERLU_PERBAIKAN` tercatat dengan jejak catatan perbaikan digital antara Verifikator Dinas dan Operator PKBM.
- **Efisiensi Pengawasan Lintas Lembaga**: Kabid Dikmas beserta tim verifikator wilayah dapat memantau kesiapan seluruh PKBM dalam satu Kabupaten/Kota dari satu dasbor dan mengekspor rekapitulasi ke Excel (`.xlsx`) dalam hitungan detik.
- **Kesiapan Audit & Penyaluran Bantuan**: Rekapitulasi kesetaraan Paket A/B/C, kepatuhan *cut-off*, dan kelengkapan berkas fisik terdokumentasi rapi sejak awal siklus pendataan.

---

## BAGIAN B — PANDUAN TEKNIS & OPERASIONAL SISTEM

### 1. Arsitektur Multi-Tenant & Isolasi Keamanan
1. **Isolasi Tenant Sekolah (`sekolahId`)**  
   Seluruh data siswa, kelas, mapel, dan berkas dokumen PKBM terkunci ketat menggunakan `sekolahId` yang diekstrak dari sesi terautentikasi. Operator dan siswa dari satu PKBM tidak dapat melihat maupun memodifikasi data PKBM lain.
2. **Isolasi Wilayah Verifikator Dinas (`wilayahKabupaten`)**  
   Akun dengan peran `DINAS` terikat pada atribut `wilayahKabupaten` dan hanya dapat mengakses PKBM aktif dalam kabupaten/kota yang sama yang memiliki flag `izinVervalDinas = true`.
3. **Integritas Satu Tabel `Siswa`**  
   Modul Data Siswa, Ruang KBM, Verval Dapodik PKBM, dan Monitoring Dinas membaca dari tabel `Siswa` yang sama sehingga perubahan biodata maupun status verifikasi langsung tersinkron di seluruh modul tanpa duplikasi data.

### 2. Skema Basis Data Terpadu (`backend/schema.prisma`)
- **Model `Sekolah`**:
  - `kabupatenKota` (`String?`): Penentu wilayah pembinaan Dinas Pendidikan.
  - `izinVervalDinas` (`Boolean`, default `true`): Pengaturan izin akses verval wilayah.
  - `totalSiswaDapodik` (`Int`, default `0`): Jumlah total baris hasil tarik/impor file Excel Peserta Didik Dapodik terakhir.
- **Model `User` / `Akun`**:
  - Mendukung peran `DINAS` dengan kolom `wilayahKabupaten` (`String?`) untuk pembatasan lingkup wilayah verifikator.
- **Model `Siswa` (Tabel Terpadu)**:
  - **Identitas & Biodata Dapodik**: `nisn`, `nik`, `noKk`, `nama`, `tempatLahir`, `tanggalLahir`, `jenisKelamin`, `jenjang`, `namaIbuKandung`, `alamatLengkap`, `desaKelurahan`, `kecamatan`, `sekolahAsal`, `npsnAsal`, `nomorIjazahTerakhir`, `tanggalMasuk`.
  - **Penanda Sumber Dapodik**: `sumberDapodik` (`Boolean`, default `false`).
  - **4 Berkas Dokumen Administrasi**: `urlKk`, `urlAktaKtp`, `urlIjazah`, `urlSuratPindah` (mendukung tautan URL maupun unggahan gambar terkompresi/PDF).
  - **Status Berjenjang**:
    - Tingkat PKBM: `statusVerval` (`BELUM_LENGKAP`, `SIAP_VERVAL`, `TERVERIFIKASI_PKBM`) beserta `catatanVerval`.
    - Tingkat Dinas: `statusVervalDinas` (`MENUNGGU_DINAS`, `LOLOS_VERVAL`, `PERLU_PERBAIKAN`) beserta `catatanDinas`.

### 3. Spesifikasi Endpoint API Utama
#### A. Endpoint Operator & Warga Belajar (`/api/verval`)
- `GET /api/verval/me` — Mengambil biodata Dapodik dan status verval milik warga belajar yang sedang login.
- `POST /api/verval/import-dapodik` *(Khusus Admin PKBM)* — Menerima baris hasil pembacaan Excel Peserta Didik Dapodik, melakukan *upsert* ke tabel `Siswa` berdasarkan `nik` atau `nisn` milik `sekolahId` (dengan menjaga berkas fisik yang sudah diunggah agar tidak tertimpa), menandai `sumberDapodik = true`, dan memperbarui `Sekolah.totalSiswaDapodik`.
- `GET /api/verval/siswa` *(Khusus Admin PKBM)* — Menampilkan daftar warga belajar beserta metrik kelengkapan 15 poin Dapodik, 4 berkas dokumen, ringkasan rekonsiliasi (`totalDapodik`, `berkasLengkap`, `belumAdaBerkas`, `selisihTanpaBerkas`), serta mendukung filter `?tanpaBerkas=true`, `statusVerval`, `kelasId`, dan pencarian `q`.
- `PATCH /api/verval/siswa/:id` — Memperbarui biodata Dapodik dan 4 tautan/file berkas. Warga belajar hanya dapat mengubah datanya sendiri hingga status `SIAP_VERVAL`; Admin PKBM dapat menetapkan status `TERVERIFIKASI_PKBM`.
- `GET /api/verval/export` *(Khusus Admin PKBM)* — Mengunduh daftar nominatif format Dapodik dalam JSON/CSV/Excel.

#### B. Endpoint Portal Dinas Pendidikan (`/api/dinas`)
- `GET /api/dinas/ringkasan` — Mengembalikan KPI wilayah (`totalPkbm`, `totalWargaBelajar`, `totalDapodikTarik`, `totalBerkasLengkap`, distribusi Paket A/B/C, kepatuhan *cut-off* 31 Agustus, serta capaian `LOLOS_VERVAL`).
- `GET /api/dinas/pkbm/:sekolahId/siswa` — Mengembalikan daftar nominatif administratif warga belajar PKBM tertentu (biodata, *cut-off*, 4 dokumen, dan status verval — **tanpa data presensi maupun nilai KBM**).
- `PATCH /api/dinas/siswa/:siswaId/verval` — Menetapkan keputusan verifikasi Dinas (`MENUNGGU_DINAS`, `LOLOS_VERVAL`, atau `PERLU_PERBAIKAN` dengan `catatanDinas` wajib diisi).

---

### 4. Panduan Operasional Pengguna

#### Langkah 1 — Operator PKBM: Impor Excel Dapodik & Rekonsiliasi
1. Masuk ke Portal Admin Sekolah (`https://<slug>.pkbm.siput.id/login`), lalu buka menu **Verval Data Dapodik**.
2. Klik **Impor Excel Dapodik** dan unggah file `.xlsx` / `.xls` ekspor Peserta Didik dari aplikasi Dapodik.
3. Periksa pratinjau hasil pemetaan kolom (`Nama`, `NISN`, `NIK`, `No KK`, `Nama Ibu Kandung`, `Jenjang/Rombel`, `Sekolah Asal`, `No Ijazah`, `Tanggal Masuk`), lalu klik **Sinkronkan ke Tabel Siswa**.
4. Pantau **Kartu Rekonsiliasi Selisih** untuk membandingkan *Hasil Tarik Dapodik* dengan *Berkas Fisik Lengkap*.
5. Gunakan tombol filter cepat **Hanya Tanpa Berkas** untuk mengidentifikasi warga belajar yang belum memiliki satu pun berkas fisik agar segera ditindaklanjuti atau dievaluasi keaktifannya.

#### Langkah 2 — Warga Belajar (Siswa): Lengkapi Berkas Dapodik Mandiri
1. Masuk ke Portal LMS Siswa (`https://<slug>.pkbm.siput.id/lms/login`) menggunakan NISN dan kata sandi.
2. Pilih tab navigasi **Lengkapi Berkas Dapodik**.
3. Lengkapi field biodata wajib (NIK 16 digit, Nomor KK 16 digit, Nama Ibu Kandung, Tempat/Tanggal Lahir, Alamat Lengkap, Sekolah Asal, Nomor Ijazah Terakhir, Tanggal Masuk).
4. Unggah scan gambar/PDF atau tempel tautan dokumen pada 4 kartu berkas: **Kartu Keluarga (KK)**, **Akta Kelahiran / KTP**, **Ijazah / Rapor Terakhir**, dan **Surat Pindah / SKP** (jika mutasi).
5. Klik **Simpan & Ajukan Verifikasi** sehingga status berubah menjadi `SIAP_VERVAL`.

#### Langkah 3 — Operator PKBM: Validasi Internal Lembaga
1. Pada menu **Verval Data Dapodik**, saring status `SIAP_VERVAL` atau klik **Lihat / Verifikasi** pada baris warga belajar.
2. Periksa pratinjau dokumen KK, Akta/KTP, Ijazah, dan Surat Pindah secara langsung pada modal pemeriksaan.
3. Bila seluruh data dan dokumen fisik telah sesuai, klik **Tandai Terverifikasi PKBM** (`TERVERIFIKASI_PKBM`).
4. Gunakan **Cetak Nominatif** atau **Export Excel** apabila diperlukan arsip tanda tangan kepala PKBM.

#### Langkah 4 — Verifikator Dinas Pendidikan: Pemeriksaan Wilayah
1. Buka **Portal Dinas Pendidikan** pada domain utama (`https://pkbm.siput.id/dinas` atau `/dinas` pada lingkungan pengembangan) dan masuk menggunakan akun `DINAS` wilayah Anda.
   - *Akun uji Sandbox Kabupaten Bandung*: `dinas.sandbox@pkbm.siput.id` · kata sandi: `123456`
2. Tinjau KPI wilayah, distribusi Paket A/B/C, kesesuaian *cut-off* 31 Agustus, serta perbandingan *Dapodik vs Berkas Lengkap* per PKBM.
3. Klik **Periksa Berkas** pada PKBM tujuan, lalu pilih **Cek & Putuskan** pada warga belajar yang akan diverifikasi.
4. Pratinjau keempat berkas (KK, Akta/KTP, Ijazah, Surat Pindah), lalu putuskan:
   - **Loloskan** (`LOLOS_VERVAL`) jika data dan berkas dinyatakan sah.
   - **Minta Perbaikan** (`PERLU_PERBAIKAN`) disertai catatan perbaikan yang otomatis muncul di layar Operator PKBM dan Warga Belajar terkait.
5. Klik **Export Rekap Verval Kabupaten** untuk mengunduh laporan rekapitulasi wilayah dalam format `.xlsx`.
