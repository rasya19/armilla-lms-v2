-- Add Pas Foto Ijazah 4x6 URL column to Siswa table
ALTER TABLE "Siswa" ADD COLUMN IF NOT EXISTS "urlFotoIjazah" TEXT;
