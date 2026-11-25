-- Add urlFoto to Guru for profile avatar
ALTER TABLE "Guru" ADD COLUMN IF NOT EXISTS "urlFoto" TEXT;

-- Create AgendaSurat table for Surat Masuk & Surat Keluar + auto transcript numbering
CREATE TABLE IF NOT EXISTS "AgendaSurat" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "tahun" INTEGER NOT NULL,
    "nomorUrut" INTEGER NOT NULL,
    "nomorSurat" TEXT NOT NULL,
    "tanggalSurat" DATE NOT NULL,
    "pengirimTujuan" TEXT NOT NULL,
    "perihal" TEXT NOT NULL,
    "keterangan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaSurat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgendaSurat_sekolahId_jenis_tahun_nomorUrut_idx"
  ON "AgendaSurat"("sekolahId", "jenis", "tahun", "nomorUrut");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AgendaSurat_sekolahId_fkey'
    ) THEN
        ALTER TABLE "AgendaSurat"
            ADD CONSTRAINT "AgendaSurat_sekolahId_fkey"
            FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
