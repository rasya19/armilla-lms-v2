-- Create BukuTamu table for QR Digital Guestbook (Reguler+ feature)
CREATE TABLE IF NOT EXISTS "BukuTamu" (
    "id" TEXT NOT NULL,
    "sekolahId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "noHp" TEXT NOT NULL,
    "tujuanKunjungan" TEXT NOT NULL,
    "instansi" TEXT,
    "tanggalKunjung" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BukuTamu_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BukuTamu_sekolahId_tanggalKunjung_idx" ON "BukuTamu"("sekolahId", "tanggalKunjung");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BukuTamu_sekolahId_fkey'
    ) THEN
        ALTER TABLE "BukuTamu"
            ADD CONSTRAINT "BukuTamu_sekolahId_fkey"
            FOREIGN KEY ("sekolahId") REFERENCES "Sekolah"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
