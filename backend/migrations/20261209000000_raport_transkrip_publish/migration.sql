-- Add publish flags for E-Raport Digital (CatatanRaport) and Transkrip Nilai (Siswa)
ALTER TABLE "CatatanRaport" ADD COLUMN IF NOT EXISTS "raportDiterbitkan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CatatanRaport" ADD COLUMN IF NOT EXISTS "raportDiterbitkanPada" TIMESTAMP(3);

ALTER TABLE "Siswa" ADD COLUMN IF NOT EXISTS "transkripDiterbitkan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Siswa" ADD COLUMN IF NOT EXISTS "transkripDiterbitkanPada" TIMESTAMP(3);
