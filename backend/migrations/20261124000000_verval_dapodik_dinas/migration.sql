ALTER TYPE "PeranAkun" ADD VALUE IF NOT EXISTS 'DINAS';

ALTER TABLE "Sekolah"
  ADD COLUMN IF NOT EXISTS "kabupatenKota" TEXT,
  ADD COLUMN IF NOT EXISTS "izinVervalDinas" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Akun"
  ADD COLUMN IF NOT EXISTS "wilayahKabupaten" TEXT;

ALTER TABLE "Siswa"
  ADD COLUMN IF NOT EXISTS "noKk" TEXT,
  ADD COLUMN IF NOT EXISTS "namaIbuKandung" TEXT,
  ADD COLUMN IF NOT EXISTS "desaKelurahan" TEXT,
  ADD COLUMN IF NOT EXISTS "kecamatan" TEXT,
  ADD COLUMN IF NOT EXISTS "sekolahAsal" TEXT,
  ADD COLUMN IF NOT EXISTS "npsnAsal" TEXT,
  ADD COLUMN IF NOT EXISTS "nomorIjazahTerakhir" TEXT,
  ADD COLUMN IF NOT EXISTS "urlKk" TEXT,
  ADD COLUMN IF NOT EXISTS "urlAktaKtp" TEXT,
  ADD COLUMN IF NOT EXISTS "urlIjazah" TEXT,
  ADD COLUMN IF NOT EXISTS "statusVerval" TEXT NOT NULL DEFAULT 'BELUM_LENGKAP',
  ADD COLUMN IF NOT EXISTS "catatanVerval" TEXT,
  ADD COLUMN IF NOT EXISTS "statusVervalDinas" TEXT NOT NULL DEFAULT 'MENUNGGU_DINAS',
  ADD COLUMN IF NOT EXISTS "catatanDinas" TEXT;

CREATE INDEX IF NOT EXISTS "Sekolah_kabupatenKota_izinVervalDinas_idx" ON "Sekolah"("kabupatenKota", "izinVervalDinas");
CREATE INDEX IF NOT EXISTS "Siswa_sekolahId_statusVerval_idx" ON "Siswa"("sekolahId", "statusVerval");
CREATE INDEX IF NOT EXISTS "Siswa_sekolahId_statusVervalDinas_idx" ON "Siswa"("sekolahId", "statusVervalDinas");
