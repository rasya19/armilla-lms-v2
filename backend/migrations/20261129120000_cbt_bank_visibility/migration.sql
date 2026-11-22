-- Add visibility ('PRIVATE' | 'PUBLIC' | 'ARCHIVED') and origin_school_name to Ujian & MateriAjar
ALTER TABLE "Ujian"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS "origin_school_name" TEXT;

ALTER TABLE "MateriAjar"
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS "source_school_name" TEXT;

CREATE INDEX IF NOT EXISTS "Ujian_visibility_idx" ON "Ujian"("visibility");
CREATE INDEX IF NOT EXISTS "MateriAjar_visibility_idx" ON "MateriAjar"("visibility");
