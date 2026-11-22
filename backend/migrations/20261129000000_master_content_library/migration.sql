-- CreateTable: MasterModul (Pustaka Konten Pusat — Modul Ajar & Materi)
CREATE TABLE IF NOT EXISTS "MasterModul" (
    "id" TEXT NOT NULL,
    "jenjang" TEXT NOT NULL,
    "tingkatKelas" TEXT NOT NULL DEFAULT '',
    "mataPelajaran" TEXT NOT NULL,
    "kategoriUjian" TEXT NOT NULL DEFAULT 'MATERI',
    "judul" TEXT NOT NULL,
    "deskripsi" TEXT,
    "konten" TEXT,
    "fileUrl" TEXT,
    "jenis" TEXT NOT NULL DEFAULT 'MODUL',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MasterModul_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MasterModul_jenjang_mataPelajaran_kategoriUjian_idx"
    ON "MasterModul"("jenjang", "mataPelajaran", "kategoriUjian");

-- CreateTable: MasterBankSoal (Pustaka Konten Pusat — Paket Bank Soal UTS/UAS/Ujian Akhir)
CREATE TABLE IF NOT EXISTS "MasterBankSoal" (
    "id" TEXT NOT NULL,
    "jenjang" TEXT NOT NULL,
    "tingkatKelas" TEXT NOT NULL DEFAULT '',
    "mataPelajaran" TEXT NOT NULL,
    "kategoriUjian" TEXT NOT NULL DEFAULT 'UTS',
    "judul" TEXT NOT NULL,
    "deskripsi" TEXT,
    "durasiMenit" INTEGER NOT NULL DEFAULT 60,
    "kkm" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MasterBankSoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MasterBankSoal_jenjang_mataPelajaran_kategoriUjian_idx"
    ON "MasterBankSoal"("jenjang", "mataPelajaran", "kategoriUjian");

-- CreateTable: MasterButirSoal (Butir Soal PG & Esai pada MasterBankSoal)
CREATE TABLE IF NOT EXISTS "MasterButirSoal" (
    "id" TEXT NOT NULL,
    "bankSoalId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "tipe" TEXT NOT NULL DEFAULT 'PG',
    "teks" TEXT NOT NULL,
    "bobot" INTEGER NOT NULL DEFAULT 10,
    "opsiA" TEXT,
    "opsiB" TEXT,
    "opsiC" TEXT,
    "opsiD" TEXT,
    "opsiE" TEXT,
    "kunciJawaban" TEXT NOT NULL,
    "pembahasan" TEXT,
    CONSTRAINT "MasterButirSoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MasterButirSoal_bankSoalId_urutan_key"
    ON "MasterButirSoal"("bankSoalId", "urutan");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'MasterButirSoal_bankSoalId_fkey'
    ) THEN
        ALTER TABLE "MasterButirSoal"
            ADD CONSTRAINT "MasterButirSoal_bankSoalId_fkey"
            FOREIGN KEY ("bankSoalId") REFERENCES "MasterBankSoal"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
