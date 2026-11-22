-- AlterTable: Add visibility to MasterModul for lightweight URL-based public/private module library
ALTER TABLE "MasterModul" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX IF NOT EXISTS "MasterModul_visibility_jenjang_mataPelajaran_idx"
  ON "MasterModul"("visibility", "jenjang", "mataPelajaran");
