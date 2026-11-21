-- AlterTable: Nilai
ALTER TABLE "Nilai" ADD COLUMN IF NOT EXISTS "tahunAjaranId" TEXT;
ALTER TABLE "Nilai" ADD COLUMN IF NOT EXISTS "catatanKompetensi" TEXT;

-- AlterTable: AgendaMengajar
ALTER TABLE "AgendaMengajar" ADD COLUMN IF NOT EXISTS "metode" TEXT NOT NULL DEFAULT 'TATAP_MUKA';
ALTER TABLE "AgendaMengajar" ADD COLUMN IF NOT EXISTS "hadirCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgendaMengajar" ADD COLUMN IF NOT EXISTS "tidakHadirCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgendaMengajar" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: Ujian, SoalUjian, PercobaanUjian, JawabanUjian
ALTER TABLE "Ujian" ADD COLUMN IF NOT EXISTS "tokenKode" TEXT;
ALTER TABLE "Ujian" ADD COLUMN IF NOT EXISTS "acakSoal" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Ujian" ADD COLUMN IF NOT EXISTS "acakOpsi" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Ujian" ADD COLUMN IF NOT EXISTS "tampilNilai" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Ujian" ADD COLUMN IF NOT EXISTS "toleransiKeluarTab" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Ujian" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SoalUjian" ADD COLUMN IF NOT EXISTS "tipe" TEXT NOT NULL DEFAULT 'PG';
ALTER TABLE "SoalUjian" ADD COLUMN IF NOT EXISTS "bobot" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "SoalUjian" ADD COLUMN IF NOT EXISTS "kunciEsai" TEXT;
ALTER TABLE "SoalUjian" ADD COLUMN IF NOT EXISTS "pembahasan" TEXT;

ALTER TABLE "PercobaanUjian" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SEDANG_MENGERJAKAN';
ALTER TABLE "PercobaanUjian" ADD COLUMN IF NOT EXISTS "nilaiOverride" DOUBLE PRECISION;
ALTER TABLE "PercobaanUjian" ADD COLUMN IF NOT EXISTS "catatanGuru" TEXT;
ALTER TABLE "PercobaanUjian" ADD COLUMN IF NOT EXISTS "tabViolations" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "JawabanUjian" ADD COLUMN IF NOT EXISTS "jawabanEsai" TEXT;

-- CreateTable: ModulKesetaraan
CREATE TABLE IF NOT EXISTS "ModulKesetaraan" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "mapelId" TEXT,
    "jenjang" TEXT NOT NULL,
    "tingkatan" TEXT NOT NULL,
    "kelompok" TEXT NOT NULL,
    "kodeModul" TEXT NOT NULL,
    "judulModul" TEXT NOT NULL,
    "skkTatapMuka" INTEGER NOT NULL DEFAULT 2,
    "skkTutorial" INTEGER NOT NULL DEFAULT 1,
    "skkMandiri" INTEGER NOT NULL DEFAULT 1,
    "skkTotal" INTEGER NOT NULL DEFAULT 4,
    "deskripsi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModulKesetaraan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ModulKesetaraan_sekolahId_jenjang_kelompok_idx" ON "ModulKesetaraan"("sekolahId", "jenjang", "kelompok");
ALTER TABLE "ModulKesetaraan" ADD CONSTRAINT "ModulKesetaraan_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: CatatanRaport
CREATE TABLE IF NOT EXISTS "CatatanRaport" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tahunAjaranId" TEXT NOT NULL,
    "kelasId" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "catatanWali" TEXT,
    "statusKenaikan" TEXT NOT NULL DEFAULT 'PROSES',
    "tanggalRapor" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatatanRaport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CatatanRaport_sekolahId_tahunAjaranId_siswaId_key" ON "CatatanRaport"("sekolahId", "tahunAjaranId", "siswaId");
CREATE INDEX IF NOT EXISTS "CatatanRaport_sekolahId_kelasId_idx" ON "CatatanRaport"("sekolahId", "kelasId");
ALTER TABLE "CatatanRaport" ADD CONSTRAINT "CatatanRaport_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: CbtPengaturan
CREATE TABLE IF NOT EXISTS "CbtPengaturan" (
    "sekolahId" TEXT NOT NULL,
    "acakUrutanSoal" BOOLEAN NOT NULL DEFAULT true,
    "acakOpsiJawaban" BOOLEAN NOT NULL DEFAULT true,
    "tampilkanNilaiLangsung" BOOLEAN NOT NULL DEFAULT true,
    "batasToleransiKeluarTab" INTEGER NOT NULL DEFAULT 3,
    "kkmDefault" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "wajibToken" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CbtPengaturan_pkey" PRIMARY KEY ("sekolahId")
);
ALTER TABLE "CbtPengaturan" ADD CONSTRAINT "CbtPengaturan_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: InstrumenSnp
CREATE TABLE IF NOT EXISTS "InstrumenSnp" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "standarKode" TEXT NOT NULL,
    "standarNama" TEXT NOT NULL,
    "indikator" TEXT NOT NULL,
    "statusDokumen" TEXT NOT NULL DEFAULT 'BELUM_ADA',
    "tautanBukti" TEXT,
    "catatanVerifikasi" TEXT,
    "urutan" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstrumenSnp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InstrumenSnp_sekolahId_standarKode_idx" ON "InstrumenSnp"("sekolahId", "standarKode");
ALTER TABLE "InstrumenSnp" ADD CONSTRAINT "InstrumenSnp_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: TagihanSpp
CREATE TABLE IF NOT EXISTS "TagihanSpp" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "siswaId" TEXT NOT NULL,
    "kelasId" TEXT,
    "judul" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "periode" TEXT,
    "nominal" INTEGER NOT NULL,
    "jatuhTempo" DATE,
    "status" TEXT NOT NULL DEFAULT 'BELUM_BAYAR',
    "keterangan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TagihanSpp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TagihanSpp_sekolahId_status_idx" ON "TagihanSpp"("sekolahId", "status");
CREATE INDEX IF NOT EXISTS "TagihanSpp_sekolahId_siswaId_idx" ON "TagihanSpp"("sekolahId", "siswaId");
ALTER TABLE "TagihanSpp" ADD CONSTRAINT "TagihanSpp_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: PembayaranSpp
CREATE TABLE IF NOT EXISTS "PembayaranSpp" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "tagihanId" TEXT NOT NULL,
    "nomorKuitansi" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "metode" TEXT NOT NULL,
    "tanggalBayar" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "catatan" TEXT,
    "penerima" TEXT,
    CONSTRAINT "PembayaranSpp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PembayaranSpp_nomorKuitansi_key" ON "PembayaranSpp"("nomorKuitansi");
CREATE INDEX IF NOT EXISTS "PembayaranSpp_sekolahId_tanggalBayar_idx" ON "PembayaranSpp"("sekolahId", "tanggalBayar");
ALTER TABLE "PembayaranSpp" ADD CONSTRAINT "PembayaranSpp_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PembayaranSpp" ADD CONSTRAINT "PembayaranSpp_tagihanId_fkey" FOREIGN KEY ("tagihanId") REFERENCES "TagihanSpp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AlumniTracer
CREATE TABLE IF NOT EXISTS "AlumniTracer" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "siswaId" TEXT,
    "nama" TEXT NOT NULL,
    "nisn" TEXT,
    "program" TEXT NOT NULL,
    "tahunLulus" INTEGER NOT NULL,
    "nomorIjazah" TEXT,
    "statusPascaLulus" TEXT NOT NULL DEFAULT 'BEKERJA',
    "namaInstansiUsaha" TEXT,
    "kontakAktif" TEXT,
    "tahunMulai" INTEGER,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlumniTracer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniTracer_siswaId_key" ON "AlumniTracer"("siswaId");
CREATE INDEX IF NOT EXISTS "AlumniTracer_sekolahId_tahunLulus_idx" ON "AlumniTracer"("sekolahId", "tahunLulus");
ALTER TABLE "AlumniTracer" ADD CONSTRAINT "AlumniTracer_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: AsetSarpras
CREATE TABLE IF NOT EXISTS "AsetSarpras" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "kodeInventaris" TEXT NOT NULL,
    "namaBarang" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL DEFAULT 1,
    "kondisi" TEXT NOT NULL DEFAULT 'BAIK',
    "lokasiRuangan" TEXT NOT NULL,
    "tahunPengadaan" INTEGER NOT NULL,
    "sumberPengadaan" TEXT NOT NULL,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AsetSarpras_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AsetSarpras_sekolahId_kodeInventaris_key" ON "AsetSarpras"("sekolahId", "kodeInventaris");
CREATE INDEX IF NOT EXISTS "AsetSarpras_sekolahId_kategori_idx" ON "AsetSarpras"("sekolahId", "kategori");
ALTER TABLE "AsetSarpras" ADD CONSTRAINT "AsetSarpras_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: TopikDiskusi
CREATE TABLE IF NOT EXISTS "TopikDiskusi" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "kelasId" TEXT,
    "kategori" TEXT NOT NULL DEFAULT 'UMUM',
    "judul" TEXT NOT NULL,
    "isi" TEXT NOT NULL,
    "penulisNama" TEXT NOT NULL,
    "penulisPeran" TEXT NOT NULL,
    "disematkan" BOOLEAN NOT NULL DEFAULT false,
    "ditutup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopikDiskusi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TopikDiskusi_sekolahId_disematkan_createdAt_idx" ON "TopikDiskusi"("sekolahId", "disematkan", "createdAt");
ALTER TABLE "TopikDiskusi" ADD CONSTRAINT "TopikDiskusi_sekolahId_fkey" FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: BalasanDiskusi
CREATE TABLE IF NOT EXISTS "BalasanDiskusi" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "topikId" TEXT NOT NULL,
    "isi" TEXT NOT NULL,
    "penulisNama" TEXT NOT NULL,
    "penulisPeran" TEXT NOT NULL,
    "terbaik" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalasanDiskusi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BalasanDiskusi_topikId_createdAt_idx" ON "BalasanDiskusi"("topikId", "createdAt");
ALTER TABLE "BalasanDiskusi" ADD CONSTRAINT "BalasanDiskusi_topikId_fkey" FOREIGN KEY ("topikId") REFERENCES "TopikDiskusi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
