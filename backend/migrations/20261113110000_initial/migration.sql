-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PeranAkun" AS ENUM ('MASTER_ADMIN', 'ADMIN', 'GURU', 'SISWA');

-- CreateEnum
CREATE TYPE "StatusPresensi" AS ENUM ('HADIR', 'SAKIT', 'IZIN', 'ALPA');

-- CreateTable
CREATE TABLE "Siswa" (
    "id" TEXT NOT NULL,
    "nisn" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telepon" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sekolahId" TEXT,
    "nik" TEXT,
    "tempatLahir" TEXT,
    "tanggalLahir" DATE,
    "jenisKelamin" TEXT,
    "jenjang" TEXT,
    "tanggalMasuk" DATE,
    "jalurPendaftaran" TEXT,
    "namaAyah" TEXT,
    "namaIbu" TEXT,
    "alamatLengkap" TEXT,

    CONSTRAINT "Siswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guru" (
    "id" TEXT NOT NULL,
    "nuptk" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "mapelUtama" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telepon" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sekolahId" TEXT,

    CONSTRAINT "Guru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mapel" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kkm" INTEGER NOT NULL,
    "sekolahId" TEXT,

    CONSTRAINT "Mapel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kelas" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "waliGuruId" TEXT NOT NULL,
    "sekolahId" TEXT,

    CONSTRAINT "Kelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PPDB" (
    "id" TEXT NOT NULL,
    "noDaftar" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telepon" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "jenjang" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tanggalDaftar" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dokumen" JSONB,
    "sekolahId" TEXT,
    "siswaId" TEXT,
    "ditinjauPada" TIMESTAMP(3),
    "ditinjauOlehId" TEXT,
    "catatanTinjauan" TEXT,

    CONSTRAINT "PPDB_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nilai" (
    "id" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "mapelId" TEXT NOT NULL,
    "nilaiMandiri" DOUBLE PRECISION NOT NULL,
    "nilaiSimulasi" DOUBLE PRECISION NOT NULL,
    "nilaiAkhir" DOUBLE PRECISION NOT NULL,
    "tanggalSimulasi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sekolahId" TEXT,

    CONSTRAINT "Nilai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteSettings" (
    "school_id" TEXT NOT NULL,
    "primary_color" TEXT NOT NULL DEFAULT '#4f46e5',
    "logo_url" TEXT,
    "hero_title" TEXT,
    "hero_subtitle" TEXT,
    "show_gallery" BOOLEAN NOT NULL DEFAULT true,
    "show_news" BOOLEAN NOT NULL DEFAULT true,
    "footer_text" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteSettings_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "RefKabupaten" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL DEFAULT 'Jawa Barat',

    CONSTRAINT "RefKabupaten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefKecamatan" (
    "id" TEXT NOT NULL,
    "kabupatenId" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,

    CONSTRAINT "RefKecamatan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sekolah" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "npsn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sekolah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Akun" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT,
    "email" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "peran" "PeranAkun" NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "siswaId" TEXT,
    "guruId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Akun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiAkun" (
    "id" TEXT NOT NULL,
    "akunId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesiAkun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TahunAjaran" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "mulai" DATE NOT NULL,
    "selesai" DATE NOT NULL,

    CONSTRAINT "TahunAjaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JadwalPelajaran" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "mapelId" TEXT NOT NULL,
    "guruId" TEXT NOT NULL,
    "hari" INTEGER NOT NULL,
    "jamMulai" TEXT NOT NULL,
    "jamSelesai" TEXT NOT NULL,
    "ruangan" TEXT,

    CONSTRAINT "JadwalPelajaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaMengajar" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "mapelId" TEXT NOT NULL,
    "guruId" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "jamKe" TEXT NOT NULL,
    "materiPokok" TEXT NOT NULL,
    "catatanGuru" TEXT,

    CONSTRAINT "AgendaMengajar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presensi" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "status" "StatusPresensi" NOT NULL,
    "keterangan" TEXT,
    "waktuHadir" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presensi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Berkas" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "diunggahOlehId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "ukuranBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Berkas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MateriAjar" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "mapelId" TEXT NOT NULL,
    "guruId" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "deskripsi" TEXT,
    "jenis" TEXT NOT NULL,
    "tautan" TEXT,
    "berkasId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MateriAjar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tugas" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "mapelId" TEXT NOT NULL,
    "guruId" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "instruksi" TEXT,
    "batasWaktu" TIMESTAMP(3),
    "berkasId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tugas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PengumpulanTugas" (
    "id" TEXT NOT NULL,
    "tugasId" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "jawaban" TEXT,
    "tautan" TEXT,
    "berkasId" TEXT,
    "dikumpulkanPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nilai" DOUBLE PRECISION,
    "catatanGuru" TEXT,

    CONSTRAINT "PengumpulanTugas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ujian" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "mapelId" TEXT NOT NULL,
    "guruId" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "durasiMenit" INTEGER NOT NULL,
    "mulai" TIMESTAMP(3) NOT NULL,
    "selesai" TIMESTAMP(3) NOT NULL,
    "kkm" DOUBLE PRECISION NOT NULL,
    "tokenHash" TEXT,
    "dipublikasikan" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Ujian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoalUjian" (
    "id" TEXT NOT NULL,
    "ujianId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "teks" TEXT NOT NULL,

    CONSTRAINT "SoalUjian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsiSoal" (
    "id" TEXT NOT NULL,
    "soalId" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "teks" TEXT NOT NULL,
    "benar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OpsiSoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PercobaanUjian" (
    "id" TEXT NOT NULL,
    "ujianId" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "dimulaiPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dikumpulkanPada" TIMESTAMP(3),
    "nilai" DOUBLE PRECISION,

    CONSTRAINT "PercobaanUjian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JawabanUjian" (
    "id" TEXT NOT NULL,
    "percobaanId" TEXT NOT NULL,
    "soalId" TEXT NOT NULL,
    "opsiId" TEXT,
    "raguRagu" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JawabanUjian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Siswa_nisn_key" ON "Siswa"("nisn");

-- CreateIndex
CREATE INDEX "Siswa_sekolahId_idx" ON "Siswa"("sekolahId");

-- CreateIndex
CREATE UNIQUE INDEX "Guru_nuptk_key" ON "Guru"("nuptk");

-- CreateIndex
CREATE INDEX "Guru_sekolahId_idx" ON "Guru"("sekolahId");

-- CreateIndex
CREATE UNIQUE INDEX "Mapel_kode_key" ON "Mapel"("kode");

-- CreateIndex
CREATE INDEX "Mapel_sekolahId_idx" ON "Mapel"("sekolahId");

-- CreateIndex
CREATE UNIQUE INDEX "Kelas_kode_key" ON "Kelas"("kode");

-- CreateIndex
CREATE INDEX "Kelas_sekolahId_idx" ON "Kelas"("sekolahId");

-- CreateIndex
CREATE UNIQUE INDEX "PPDB_noDaftar_key" ON "PPDB"("noDaftar");

-- CreateIndex
CREATE UNIQUE INDEX "PPDB_siswaId_key" ON "PPDB"("siswaId");

-- CreateIndex
CREATE INDEX "PPDB_sekolahId_status_idx" ON "PPDB"("sekolahId", "status");

-- CreateIndex
CREATE INDEX "Nilai_sekolahId_siswaId_idx" ON "Nilai"("sekolahId", "siswaId");

-- CreateIndex
CREATE UNIQUE INDEX "RefKabupaten_kode_key" ON "RefKabupaten"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "RefKecamatan_kode_key" ON "RefKecamatan"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "Sekolah_slug_key" ON "Sekolah"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Sekolah_npsn_key" ON "Sekolah"("npsn");

-- CreateIndex
CREATE UNIQUE INDEX "Akun_email_key" ON "Akun"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Akun_siswaId_key" ON "Akun"("siswaId");

-- CreateIndex
CREATE UNIQUE INDEX "Akun_guruId_key" ON "Akun"("guruId");

-- CreateIndex
CREATE INDEX "Akun_sekolahId_peran_idx" ON "Akun"("sekolahId", "peran");

-- CreateIndex
CREATE UNIQUE INDEX "SesiAkun_tokenHash_key" ON "SesiAkun"("tokenHash");

-- CreateIndex
CREATE INDEX "SesiAkun_akunId_expiresAt_idx" ON "SesiAkun"("akunId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TahunAjaran_sekolahId_nama_semester_key" ON "TahunAjaran"("sekolahId", "nama", "semester");

-- CreateIndex
CREATE INDEX "JadwalPelajaran_sekolahId_tahunAjaranId_kelasId_hari_idx" ON "JadwalPelajaran"("sekolahId", "tahunAjaranId", "kelasId", "hari");

-- CreateIndex
CREATE INDEX "AgendaMengajar_sekolahId_kelasId_tanggal_idx" ON "AgendaMengajar"("sekolahId", "kelasId", "tanggal");

-- CreateIndex
CREATE INDEX "Presensi_sekolahId_kelasId_tanggal_idx" ON "Presensi"("sekolahId", "kelasId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "Presensi_sekolahId_siswaId_tanggal_key" ON "Presensi"("sekolahId", "siswaId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "Berkas_storageKey_key" ON "Berkas"("storageKey");

-- CreateIndex
CREATE INDEX "Berkas_sekolahId_idx" ON "Berkas"("sekolahId");

-- CreateIndex
CREATE INDEX "MateriAjar_sekolahId_kelasId_mapelId_idx" ON "MateriAjar"("sekolahId", "kelasId", "mapelId");

-- CreateIndex
CREATE INDEX "Tugas_sekolahId_kelasId_batasWaktu_idx" ON "Tugas"("sekolahId", "kelasId", "batasWaktu");

-- CreateIndex
CREATE UNIQUE INDEX "PengumpulanTugas_tugasId_siswaId_key" ON "PengumpulanTugas"("tugasId", "siswaId");

-- CreateIndex
CREATE INDEX "Ujian_sekolahId_kelasId_mulai_idx" ON "Ujian"("sekolahId", "kelasId", "mulai");

-- CreateIndex
CREATE UNIQUE INDEX "Ujian_sekolahId_kode_key" ON "Ujian"("sekolahId", "kode");

-- CreateIndex
CREATE UNIQUE INDEX "SoalUjian_ujianId_urutan_key" ON "SoalUjian"("ujianId", "urutan");

-- CreateIndex
CREATE UNIQUE INDEX "OpsiSoal_soalId_kode_key" ON "OpsiSoal"("soalId", "kode");

-- CreateIndex
CREATE UNIQUE INDEX "PercobaanUjian_ujianId_siswaId_key" ON "PercobaanUjian"("ujianId", "siswaId");

-- CreateIndex
CREATE UNIQUE INDEX "JawabanUjian_percobaanId_soalId_key" ON "JawabanUjian"("percobaanId", "soalId");

-- AddForeignKey
ALTER TABLE "Siswa" ADD CONSTRAINT "Siswa_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guru" ADD CONSTRAINT "Guru_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapel" ADD CONSTRAINT "Mapel_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kelas" ADD CONSTRAINT "Kelas_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PPDB" ADD CONSTRAINT "PPDB_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PPDB" ADD CONSTRAINT "PPDB_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PPDB" ADD CONSTRAINT "PPDB_ditinjauOlehId_fkey" FOREIGN KEY ("ditinjauOlehId") REFERENCES "Akun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nilai" ADD CONSTRAINT "Nilai_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefKecamatan" ADD CONSTRAINT "RefKecamatan_kabupatenId_fkey" FOREIGN KEY ("kabupatenId") REFERENCES "RefKabupaten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Akun" ADD CONSTRAINT "Akun_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Akun" ADD CONSTRAINT "Akun_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Akun" ADD CONSTRAINT "Akun_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiAkun" ADD CONSTRAINT "SesiAkun_akunId_fkey" FOREIGN KEY ("akunId") REFERENCES "Akun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TahunAjaran" ADD CONSTRAINT "TahunAjaran_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "Kelas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_mapelId_fkey" FOREIGN KEY ("mapelId") REFERENCES "Mapel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaMengajar" ADD CONSTRAINT "AgendaMengajar_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaMengajar" ADD CONSTRAINT "AgendaMengajar_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaMengajar" ADD CONSTRAINT "AgendaMengajar_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "Kelas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaMengajar" ADD CONSTRAINT "AgendaMengajar_mapelId_fkey" FOREIGN KEY ("mapelId") REFERENCES "Mapel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaMengajar" ADD CONSTRAINT "AgendaMengajar_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presensi" ADD CONSTRAINT "Presensi_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presensi" ADD CONSTRAINT "Presensi_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presensi" ADD CONSTRAINT "Presensi_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "Kelas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presensi" ADD CONSTRAINT "Presensi_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Berkas" ADD CONSTRAINT "Berkas_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Berkas" ADD CONSTRAINT "Berkas_diunggahOlehId_fkey" FOREIGN KEY ("diunggahOlehId") REFERENCES "Akun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriAjar" ADD CONSTRAINT "MateriAjar_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriAjar" ADD CONSTRAINT "MateriAjar_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriAjar" ADD CONSTRAINT "MateriAjar_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "Kelas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriAjar" ADD CONSTRAINT "MateriAjar_mapelId_fkey" FOREIGN KEY ("mapelId") REFERENCES "Mapel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriAjar" ADD CONSTRAINT "MateriAjar_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriAjar" ADD CONSTRAINT "MateriAjar_berkasId_fkey" FOREIGN KEY ("berkasId") REFERENCES "Berkas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tugas" ADD CONSTRAINT "Tugas_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tugas" ADD CONSTRAINT "Tugas_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tugas" ADD CONSTRAINT "Tugas_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "Kelas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tugas" ADD CONSTRAINT "Tugas_mapelId_fkey" FOREIGN KEY ("mapelId") REFERENCES "Mapel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tugas" ADD CONSTRAINT "Tugas_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tugas" ADD CONSTRAINT "Tugas_berkasId_fkey" FOREIGN KEY ("berkasId") REFERENCES "Berkas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PengumpulanTugas" ADD CONSTRAINT "PengumpulanTugas_tugasId_fkey" FOREIGN KEY ("tugasId") REFERENCES "Tugas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PengumpulanTugas" ADD CONSTRAINT "PengumpulanTugas_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PengumpulanTugas" ADD CONSTRAINT "PengumpulanTugas_berkasId_fkey" FOREIGN KEY ("berkasId") REFERENCES "Berkas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ujian" ADD CONSTRAINT "Ujian_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ujian" ADD CONSTRAINT "Ujian_tahunAjaranId_fkey" FOREIGN KEY ("tahunAjaranId") REFERENCES "TahunAjaran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ujian" ADD CONSTRAINT "Ujian_kelasId_fkey" FOREIGN KEY ("kelasId") REFERENCES "Kelas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ujian" ADD CONSTRAINT "Ujian_mapelId_fkey" FOREIGN KEY ("mapelId") REFERENCES "Mapel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ujian" ADD CONSTRAINT "Ujian_guruId_fkey" FOREIGN KEY ("guruId") REFERENCES "Guru"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoalUjian" ADD CONSTRAINT "SoalUjian_ujianId_fkey" FOREIGN KEY ("ujianId") REFERENCES "Ujian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsiSoal" ADD CONSTRAINT "OpsiSoal_soalId_fkey" FOREIGN KEY ("soalId") REFERENCES "SoalUjian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PercobaanUjian" ADD CONSTRAINT "PercobaanUjian_ujianId_fkey" FOREIGN KEY ("ujianId") REFERENCES "Ujian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PercobaanUjian" ADD CONSTRAINT "PercobaanUjian_siswaId_fkey" FOREIGN KEY ("siswaId") REFERENCES "Siswa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JawabanUjian" ADD CONSTRAINT "JawabanUjian_percobaanId_fkey" FOREIGN KEY ("percobaanId") REFERENCES "PercobaanUjian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JawabanUjian" ADD CONSTRAINT "JawabanUjian_soalId_fkey" FOREIGN KEY ("soalId") REFERENCES "SoalUjian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JawabanUjian" ADD CONSTRAINT "JawabanUjian_opsiId_fkey" FOREIGN KEY ("opsiId") REFERENCES "OpsiSoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
