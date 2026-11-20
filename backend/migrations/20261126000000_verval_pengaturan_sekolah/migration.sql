ALTER TABLE "Sekolah"
  ADD COLUMN IF NOT EXISTS "tanggalCutOffDapodik" DATE,
  ADD COLUMN IF NOT EXISTS "alamatSekolah" TEXT,
  ADD COLUMN IF NOT EXISTS "namaKepalaSekolah" TEXT,
  ADD COLUMN IF NOT EXISTS "namaOperatorDapodik" TEXT;
