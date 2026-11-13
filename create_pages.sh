#!/bin/bash

PAGES_DIR="./frontend/src/pages"
mkdir -p "$PAGES_DIR/master" "$PAGES_DIR/akademik" "$PAGES_DIR/ujian" "$PAGES_DIR/lainnya"

# Helper function to create page
create_page() {
  local path="$1"
  local title="$2"
  local tier="$3"
  
  cat <<'EOF_INNER' > "$PAGES_DIR/$path"
import React from 'react';
import PlaceholderPage from '../PlaceholderPage';

const Page: React.FC = () => <PlaceholderPage title="TITLE" requiredTier="TIER" />;
export default Page;
EOF_INNER
  sed -i "s/TITLE/$title/" "$PAGES_DIR/$path"
  sed -i "s/TIER/$tier/" "$PAGES_DIR/$path"
}

# Master
create_page "master/MasterDataSiswa.tsx" "Data Siswa" "basic"
create_page "master/MasterDataGuru.tsx" "Data Guru" "basic"
create_page "master/MasterKelolaMapel.tsx" "Kelola Mata Pelajaran" "basic"
create_page "master/MasterManajemenKelas.tsx" "Manajemen Kelas" "basic"
create_page "master/MasterPpdb.tsx" "Data Pendaftar PPDB" "basic"
create_page "master/MasterModulKesetaraan.tsx" "Modul Kesetaraan" "basic"
create_page "master/MasterAkreditasiSnp.tsx" "Akreditasi SNP" "standard"

# Akademik
create_page "akademik/AkademikJadwal.tsx" "Jadwal Pelajaran" "basic"
create_page "akademik/AkademikAgenda.tsx" "Agenda Mengajar" "basic"
create_page "akademik/AkademikPresensi.tsx" "Presensi Siswa" "standard"
create_page "akademik/AkademikMateriAjar.tsx" "Materi Ajar E-Modul" "basic"
create_page "akademik/AkademikDeteksiAi.tsx" "Deteksi Objek AI" "standard"
create_page "akademik/AkademikAlumni.tsx" "Data Alumni" "premium"
create_page "akademik/AkademikKenaikanKelas.tsx" "Kenaikan Kelas" "premium"
create_page "akademik/AkademikCekRaport.tsx" "Cek Raport" "premium"
create_page "akademik/AkademikAnalitikRaport.tsx" "Analitik e-Raport" "premium"

# Ujian
create_page "ujian/UjianKelola.tsx" "Kelola Ujian" "basic"
create_page "ujian/UjianJadwal.tsx" "Jadwal Ujian" "basic"
create_page "ujian/UjianMonitoring.tsx" "Monitoring Live" "basic"
create_page "ujian/UjianInputRekap.tsx" "Input & Rekap Nilai" "basic"
create_page "ujian/UjianPengaturan.tsx" "Pengaturan Ujian" "basic"

# Lainnya
create_page "lainnya/Keuangan.tsx" "Keuangan" "premium"
create_page "lainnya/RuangDiskusi.tsx" "Ruang Diskusi" "standard"
create_page "lainnya/AsistenAi.tsx" "Asisten AI" "standard"
create_page "lainnya/ManajemenWeb.tsx" "Manajemen Web" "basic"
create_page "lainnya/StatistikEksekutif.tsx" "Statistik Eksekutif" "premium"
create_page "lainnya/ManajemenAset.tsx" "Manajemen Aset" "premium"
create_page "lainnya/KartuDigitalQr.tsx" "Kartu Digital QR" "premium"
