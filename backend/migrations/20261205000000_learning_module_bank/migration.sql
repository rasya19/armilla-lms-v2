-- CreateTable
CREATE TABLE IF NOT EXISTS "LearningModuleBank" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "originSchoolName" TEXT NOT NULL,
    "paket" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "fileUrl" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningModuleBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LearningModuleBank_schoolId_visibility_idx" ON "LearningModuleBank"("schoolId", "visibility");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LearningModuleBank_visibility_paket_gradeLevel_idx" ON "LearningModuleBank"("visibility", "paket", "gradeLevel");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'LearningModuleBank_schoolId_fkey'
    ) THEN
        ALTER TABLE "LearningModuleBank"
            ADD CONSTRAINT "LearningModuleBank_schoolId_fkey"
            FOREIGN KEY ("schoolId") REFERENCES "Sekolah"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
